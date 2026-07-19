import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { providerSettings, pricingRules, serviceToggles, TransactionCategory } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { writeAuditLog } from "./admin.service";
import { encrypt } from "../../lib/crypto";
import { HttpError } from "../../lib/http-error";

const router = Router();

// ---------- Provider settings (VTU + payment gateway credentials) ----------
// Credentials are never returned in plaintext — list/get endpoints strip
// `encryptedConfig` entirely and return only `hasCredentials: true/false`.

router.get(
  "/providers",
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(providerSettings);
    res.json({
      providers: rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        isActive: r.isActive,
        isPrimary: r.isPrimary,
        hasCredentials: Boolean(r.encryptedConfig),
        updatedAt: r.updatedAt,
      })),
    });
  }),
);

const upsertProviderSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["VTU", "PAYMENT_GATEWAY"]),
  config: z.record(z.string(), z.string()), // { apiKey, secretKey, baseUrl, ... } — shape varies by provider
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
});

// Only SUPER_ADMIN can write API credentials — this is the single most
// sensitive action in the whole admin panel.
router.put(
  "/providers",
  requireAdmin("SUPER_ADMIN"),
  validateBody(upsertProviderSchema),
  asyncHandler(async (req, res) => {
    const { name, type, config, isActive, isPrimary } = req.body;
    const encryptedConfig = encrypt(config);

    // Only one provider per type can be primary — demote any existing primary first.
    if (isPrimary) {
      await db
        .update(providerSettings)
        .set({ isPrimary: false })
        .where(and(eq(providerSettings.type, type), eq(providerSettings.isPrimary, true)));
    }

    const [existing] = await db
      .select()
      .from(providerSettings)
      .where(and(eq(providerSettings.name, name), eq(providerSettings.type, type)));

    let saved;
    if (existing) {
      [saved] = await db
        .update(providerSettings)
        .set({
          encryptedConfig,
          isActive: isActive ?? existing.isActive,
          isPrimary: isPrimary ?? existing.isPrimary,
          updatedAt: new Date(),
        })
        .where(eq(providerSettings.id, existing.id))
        .returning();
    } else {
      [saved] = await db
        .insert(providerSettings)
        .values({
          name,
          type,
          encryptedConfig,
          isActive: isActive ?? false,
          isPrimary: isPrimary ?? false,
        })
        .returning();
    }

    await writeAuditLog(req.admin!.sub, "PROVIDER_UPDATED", "ProviderSetting", saved.id, { name, type });

    res.json({ id: saved.id, name: saved.name, type: saved.type, isActive: saved.isActive, isPrimary: saved.isPrimary });
  }),
);

const toggleProviderSchema = z.object({ isActive: z.boolean() });

router.patch(
  "/providers/:id/toggle",
  requireAdmin("SUPER_ADMIN"),
  validateBody(toggleProviderSchema),
  asyncHandler(async (req, res) => {
    const [updated] = await db
      .update(providerSettings)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(eq(providerSettings.id, (req.params.id as string)))
      .returning();

    if (!updated) throw HttpError.notFound("Provider setting not found");

    await writeAuditLog(req.admin!.sub, "PROVIDER_TOGGLED", "ProviderSetting", updated.id, {
      isActive: req.body.isActive,
    });

    res.json({ id: updated.id, isActive: updated.isActive });
  }),
);

// ---------- Pricing rules ----------

router.get(
  "/pricing",
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(pricingRules);
    res.json({ pricing: rows });
  }),
);

const upsertPricingSchema = z.object({
  category: z.enum(["AIRTIME", "DATA", "CABLE_TV", "ELECTRICITY", "EDUCATION_PIN"]),
  network: z.string().optional(),
  planCode: z.string().optional(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().positive(),
  isActive: z.boolean().optional(),
});

router.put(
  "/pricing",
  requireAdmin("SUPER_ADMIN", "FINANCE"),
  validateBody(upsertPricingSchema),
  asyncHandler(async (req, res) => {
    const { category, network, planCode, costPrice, sellingPrice, isActive } = req.body;

    const conditions = [eq(pricingRules.category, category as TransactionCategory)];
    conditions.push(network ? eq(pricingRules.network, network) : eq(pricingRules.network, ""));
    conditions.push(planCode ? eq(pricingRules.planCode, planCode) : eq(pricingRules.planCode, ""));

    const [existing] = await db.select().from(pricingRules).where(and(...conditions));

    let saved;
    if (existing) {
      [saved] = await db
        .update(pricingRules)
        .set({ costPrice: costPrice.toFixed(2), sellingPrice: sellingPrice.toFixed(2), isActive: isActive ?? existing.isActive, updatedAt: new Date() })
        .where(eq(pricingRules.id, existing.id))
        .returning();
    } else {
      [saved] = await db
        .insert(pricingRules)
        .values({
          category: category as TransactionCategory,
          network,
          planCode,
          costPrice: costPrice.toFixed(2),
          sellingPrice: sellingPrice.toFixed(2),
          isActive: isActive ?? true,
        })
        .returning();
    }

    await writeAuditLog(req.admin!.sub, "PRICING_UPDATED", "PricingRule", saved.id, { category, network, planCode, sellingPrice });

    res.json({ pricing: saved });
  }),
);

// ---------- Service toggles (kill switch per category) ----------

router.get(
  "/service-toggles",
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(serviceToggles);
    res.json({ toggles: rows });
  }),
);

const toggleServiceSchema = z.object({
  category: z.enum(["AIRTIME", "DATA", "CABLE_TV", "ELECTRICITY", "EDUCATION_PIN", "WALLET_FUNDING", "INTERNAL_TRANSFER", "BANK_WITHDRAWAL"]),
  enabled: z.boolean(),
});

router.put(
  "/service-toggles",
  requireAdmin("SUPER_ADMIN"),
  validateBody(toggleServiceSchema),
  asyncHandler(async (req, res) => {
    const [existing] = await db
      .select()
      .from(serviceToggles)
      .where(eq(serviceToggles.category, req.body.category as TransactionCategory));

    let saved;
    if (existing) {
      [saved] = await db
        .update(serviceToggles)
        .set({ enabled: req.body.enabled })
        .where(eq(serviceToggles.id, existing.id))
        .returning();
    } else {
      [saved] = await db
        .insert(serviceToggles)
        .values({ category: req.body.category as TransactionCategory, enabled: req.body.enabled })
        .returning();
    }

    await writeAuditLog(req.admin!.sub, "SERVICE_TOGGLED", "ServiceToggle", saved.id, {
      category: req.body.category,
      enabled: req.body.enabled,
    });

    res.json({ toggle: saved });
  }),
);

export default router;

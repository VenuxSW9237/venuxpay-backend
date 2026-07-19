import { Router } from "express";
import { z } from "zod";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { writeAuditLog } from "./admin.service";
import { getWalletByUserId, getWalletBalance, creditWallet, debitWallet } from "../wallet/ledger.service";
import { HttpError } from "../../lib/http-error";

const router = Router();

router.get(
  "/",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const search = (req.query.search as string) || "";
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        username: users.username,
        status: users.status,
        kycStatus: users.kycStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        search
          ? or(
              ilike(users.fullName, `%${search}%`),
              ilike(users.email, `%${search}%`),
              ilike(users.phone, `%${search}%`),
              ilike(users.username, `%${search}%`),
            )
          : undefined,
      )
      .orderBy(desc(users.createdAt))
      .limit(limit);

    res.json({ users: rows });
  }),
);

router.get(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, (req.params.id as string)));
    if (!user) throw HttpError.notFound("User not found");

    const wallet = await getWalletByUserId(user.id);
    const balance = await getWalletBalance(wallet.id);

    const { passwordHash, transactionPinHash, ...safeUser } = user;
    void passwordHash;
    void transactionPinHash;

    res.json({ user: safeUser, wallet: { id: wallet.id, balance, isFrozen: wallet.isFrozen } });
  }),
);

const suspendSchema = z.object({ reason: z.string().min(3) });

router.post(
  "/:id/suspend",
  requireAdmin("SUPER_ADMIN", "SUPPORT"),
  validateBody(suspendSchema),
  asyncHandler(async (req, res) => {
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, (req.params.id as string)));
    await writeAuditLog(req.admin!.sub, "USER_SUSPENDED", "User", (req.params.id as string), { reason: req.body.reason });
    res.json({ suspended: true });
  }),
);

router.post(
  "/:id/reactivate",
  requireAdmin("SUPER_ADMIN", "SUPPORT"),
  asyncHandler(async (req, res) => {
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, (req.params.id as string)));
    await writeAuditLog(req.admin!.sub, "USER_REACTIVATED", "User", (req.params.id as string));
    res.json({ reactivated: true });
  }),
);

const adjustSchema = z.object({
  direction: z.enum(["credit", "debit"]),
  amount: z.number().positive(),
  reason: z.string().min(3),
});

// Manual wallet adjustment — always creates a ledger entry (never edits a
// balance directly) and always writes an audit log entry, so every Naira
// moved by an admin is fully traceable.
router.post(
  "/:id/wallet-adjustment",
  requireAdmin("SUPER_ADMIN", "FINANCE"),
  validateBody(adjustSchema),
  asyncHandler(async (req, res) => {
    const wallet = await getWalletByUserId((req.params.id as string));
    const move = req.body.direction === "credit" ? creditWallet : debitWallet;

    const { balanceAfter } = await move({
      walletId: wallet.id,
      amount: req.body.amount,
      reason: "ADMIN_ADJUSTMENT",
    });

    await writeAuditLog(req.admin!.sub, "WALLET_ADJUSTED", "Wallet", wallet.id, {
      direction: req.body.direction,
      amount: req.body.amount,
      reason: req.body.reason,
    });

    res.json({ balanceAfter });
  }),
);

export default router;

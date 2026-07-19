import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { auditLogs, adminUsers } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { createAdmin } from "./admin.service";

const router = Router();

router.get(
  "/audit-logs",
  requireAdmin("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    res.json({ auditLogs: rows });
  }),
);

router.get(
  "/admins",
  requireAdmin("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: adminUsers.id,
        fullName: adminUsers.fullName,
        email: adminUsers.email,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers);
    res.json({ admins: rows });
  }),
);

const createAdminSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "FINANCE", "SUPPORT"]),
});

router.post(
  "/admins",
  requireAdmin("SUPER_ADMIN"),
  validateBody(createAdminSchema),
  asyncHandler(async (req, res) => {
    const admin = await createAdmin(req.body.fullName, req.body.email, req.body.password, req.body.role);
    res.status(201).json({ id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role });
  }),
);

router.patch(
  "/admins/:id/deactivate",
  requireAdmin("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    await db.update(adminUsers).set({ isActive: false }).where(eq(adminUsers.id, (req.params.id as string)));
    res.json({ deactivated: true });
  }),
);

export default router;

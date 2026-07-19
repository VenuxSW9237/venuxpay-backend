import { Router } from "express";
import { z } from "zod";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { loginAdmin } from "./admin.service";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { admin, accessToken } = await loginAdmin(req.body.email, req.body.password);
    res.json({
      admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role },
      accessToken,
    });
  }),
);

router.get(
  "/me",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    res.json({ adminId: req.admin!.sub, role: req.admin!.role });
  }),
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { registerUser, loginUser, issueOtp, verifyOtp } from "./auth.service";
import { getWalletBalance, getWalletByUserId } from "../wallet/ledger.service";
import { HttpError } from "../../lib/http-error";

const router = Router();

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  referredByCode: z.string().optional(),
});

router.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { user, accessToken } = await registerUser(req.body);

    // In production this dispatches via Termii/Africa's Talking SMS — for now
    // the code is returned in the response only in non-production environments.
    const otp = await issueOtp(user.id, "REGISTER");

    res.status(201).json({
      user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone },
      accessToken,
      ...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
    });
  }),
);

const verifySchema = z.object({ code: z.string().length(6) });

router.post(
  "/verify-registration",
  requireUser,
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    await verifyOtp(req.userId!, req.body.code, "REGISTER");
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, req.userId!));
    res.json({ verified: true });
  }),
);

const loginSchema = z.object({
  emailOrPhone: z.string().min(3),
  password: z.string().min(1),
});

router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, accessToken } = await loginUser(req.body.emailOrPhone, req.body.password);
    res.json({
      user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone },
      accessToken,
    });
  }),
);

router.get(
  "/me",
  requireUser,
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
    const wallet = await getWalletByUserId(req.userId!);
    const balance = await getWalletBalance(wallet.id);

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        username: user.username,
        kycStatus: user.kycStatus,
        referralCode: user.referralCode,
      },
      wallet: { balance, currency: wallet.currency },
    });
  }),
);

const updateMeSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().min(10).max(15).optional(),
});

router.patch(
  "/me",
  requireUser,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    let updated;
    try {
      [updated] = await db
        .update(users)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(users.id, req.userId!))
        .returning();
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string; constraint?: string } }).cause
        ?? (err as { code?: string; constraint?: string });
      if (pgError?.code === "23505") {
        const field = pgError.constraint?.includes("phone") ? "phone number" : "value";
        throw HttpError.conflict(`That ${field} is already in use by another account`, "DUPLICATE_FIELD");
      }
      throw err;
    }

    res.json({
      user: {
        id: updated.id,
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone,
        username: updated.username,
        kycStatus: updated.kycStatus,
        referralCode: updated.referralCode,
      },
    });
  }),
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { transactions } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { getWalletByUserId, getWalletBalance } from "./ledger.service";
import { transferInternal, initiateBankWithdrawal } from "./wallet.service";

const router = Router();

router.get(
  "/balance",
  requireUser,
  asyncHandler(async (req, res) => {
    const wallet = await getWalletByUserId(req.userId!);
    const balance = await getWalletBalance(wallet.id);
    res.json({ balance, currency: wallet.currency });
  }),
);

router.get(
  "/transactions",
  requireUser,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, req.userId!))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
    res.json({ transactions: rows });
  }),
);

const transferSchema = z.object({
  recipient: z.string().min(3),
  amount: z.number().positive(),
  narration: z.string().max(140).optional(),
});

router.post(
  "/transfer",
  requireUser,
  validateBody(transferSchema),
  asyncHandler(async (req, res) => {
    const result = await transferInternal(req.userId!, req.body.recipient, req.body.amount, req.body.narration);
    res.status(201).json(result);
  }),
);

const withdrawSchema = z.object({
  bankCode: z.string().min(3),
  accountNumber: z.string().length(10),
  accountName: z.string().min(2),
  amount: z.number().positive(),
});

router.post(
  "/withdraw",
  requireUser,
  validateBody(withdrawSchema),
  asyncHandler(async (req, res) => {
    const result = await initiateBankWithdrawal(
      req.userId!,
      req.body.bankCode,
      req.body.accountNumber,
      req.body.accountName,
      req.body.amount,
    );
    res.status(201).json(result);
  }),
);

export default router;

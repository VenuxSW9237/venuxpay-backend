import { Router } from "express";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { transactions, TransactionCategory, TransactionStatus } from "../../db/schema";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireAdmin } from "../../middleware/auth";
import { writeAuditLog } from "./admin.service";
import { getWalletByUserId, creditWallet } from "../wallet/ledger.service";
import { HttpError } from "../../lib/http-error";

const router = Router();

router.get(
  "/",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const { status, category } = req.query as { status?: string; category?: string };
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const conditions = [];
    if (status) conditions.push(eq(transactions.status, status as TransactionStatus));
    if (category) conditions.push(eq(transactions.category, category as TransactionCategory));

    const rows = await db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt))
      .limit(limit);

    res.json({ transactions: rows });
  }),
);

router.get(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const [txn] = await db.select().from(transactions).where(eq(transactions.id, (req.params.id as string)));
    if (!txn) throw HttpError.notFound("Transaction not found");
    res.json({ transaction: txn });
  }),
);

const reverseSchema = z.object({ reason: z.string().min(3) });

// Manual reversal for stuck/disputed transactions — e.g. provider confirmed
// failure out-of-band but the automated reversal never fired. Credits the
// user back and marks the transaction REVERSED, with a full audit trail.
router.post(
  "/:id/reverse",
  requireAdmin("SUPER_ADMIN", "FINANCE"),
  validateBody(reverseSchema),
  asyncHandler(async (req, res) => {
    const [txn] = await db.select().from(transactions).where(eq(transactions.id, (req.params.id as string)));
    if (!txn) throw HttpError.notFound("Transaction not found");
    if (txn.status === "REVERSED") throw HttpError.conflict("Transaction has already been reversed");

    const wallet = await getWalletByUserId(txn.userId);
    await creditWallet({
      walletId: wallet.id,
      amount: Number(txn.totalCharged),
      reason: "SERVICE_PURCHASE_REVERSAL",
    });

    await db
      .update(transactions)
      .set({ status: "REVERSED", failureReason: req.body.reason })
      .where(eq(transactions.id, txn.id));

    await writeAuditLog(req.admin!.sub, "TRANSACTION_REVERSED", "Transaction", txn.id, {
      reason: req.body.reason,
      amount: txn.totalCharged,
    });

    res.json({ reversed: true });
  }),
);

export default router;

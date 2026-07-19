import { sql, eq, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { ledgerEntries, wallets, LedgerEntryType, LedgerReason } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { generateIdempotencyKey } from "../../lib/reference";

// Re-export enum value types for callers (drizzle pg-enum doesn't export a TS union directly,
// so we define the allowed literals here to keep call sites type-safe).
export type LedgerType = "CREDIT" | "DEBIT";
export type LedgerReasonType =
  | "WALLET_FUNDING"
  | "SERVICE_PURCHASE"
  | "SERVICE_PURCHASE_REVERSAL"
  | "INTERNAL_TRANSFER_OUT"
  | "INTERNAL_TRANSFER_IN"
  | "BANK_WITHDRAWAL"
  | "BANK_WITHDRAWAL_REVERSAL"
  | "ADMIN_ADJUSTMENT"
  | "REFERRAL_BONUS";

/** Returns the wallet's current balance, derived from the ledger (never a stored column). */
export async function getWalletBalance(walletId: string): Promise<number> {
  const [row] = await db
    .select({ balanceAfter: ledgerEntries.balanceAfter })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, walletId))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(1);

  return row ? Number(row.balanceAfter) : 0;
}

export async function getWalletByUserId(userId: string) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) throw HttpError.notFound("Wallet not found for this user");
  return wallet;
}

interface LedgerMoveInput {
  walletId: string;
  amount: number; // always positive
  reason: LedgerReasonType;
  transactionId?: string;
  idempotencyKey?: string;
}

/**
 * Credits a wallet atomically. Uses SELECT ... FOR UPDATE to lock the wallet's
 * ledger row set for the duration of the transaction, preventing two concurrent
 * operations from computing the same "balance before" and causing a lost update.
 */
export async function creditWallet(input: LedgerMoveInput) {
  return moveWallet({ ...input, type: "CREDIT" });
}

/** Debits a wallet atomically. Throws HttpError(409) if funds are insufficient. */
export async function debitWallet(input: LedgerMoveInput) {
  return moveWallet({ ...input, type: "DEBIT" });
}

async function moveWallet(input: LedgerMoveInput & { type: LedgerType }) {
  const { walletId, amount, reason, type, transactionId } = input;
  if (amount <= 0) throw HttpError.badRequest("Amount must be greater than zero");

  const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();

  return db.transaction(async (tx) => {
    // Lock the wallet row itself so concurrent debits/credits on the same
    // wallet serialize instead of racing on the "current balance" read.
    await tx.execute(sql`SELECT id FROM ${wallets} WHERE id = ${walletId} FOR UPDATE`);

    const [lastEntry] = await tx
      .select({ balanceAfter: ledgerEntries.balanceAfter })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(1);

    const currentBalance = lastEntry ? Number(lastEntry.balanceAfter) : 0;
    const newBalance = type === "CREDIT" ? currentBalance + amount : currentBalance - amount;

    if (type === "DEBIT" && newBalance < 0) {
      throw HttpError.conflict("Insufficient wallet balance", "INSUFFICIENT_FUNDS");
    }

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        walletId,
        type: type as LedgerEntryType,
        reason: reason as LedgerReason,
        amount: amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        transactionId: transactionId ?? null,
        idempotencyKey,
      })
      .returning();

    return { entry, balanceAfter: newBalance };
  });
}

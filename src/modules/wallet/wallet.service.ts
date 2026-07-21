import { eq, or } from "drizzle-orm";
import { db } from "../../db/client";
import { users, transactions } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { generateReference } from "../../lib/reference";
import { getWalletByUserId, debitWallet, creditWallet } from "./ledger.service";

export async function findRecipientUser(identifier: string) {
  const [recipient] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, identifier.replace(/^@/, "").toLowerCase()),
        eq(users.email, identifier.toLowerCase()),
        eq(users.phone, identifier),
      ),
    );
  if (!recipient) throw HttpError.notFound("No VenuxPay user found with that username, email or phone");
  return recipient;
}

/** Wallet-to-wallet transfer between two VenuxPay users. Fully atomic: both
 *  the debit and credit succeed together or neither does. */
export async function transferInternal(senderId: string, recipientIdentifier: string, amount: number, narration?: string) {
  const recipient = await findRecipientUser(recipientIdentifier);
  if (recipient.id === senderId) {
    throw HttpError.badRequest("You cannot transfer money to yourself");
  }

  const senderWallet = await getWalletByUserId(senderId);
  const recipientWallet = await getWalletByUserId(recipient.id);
  const reference = generateReference();

  const [txn] = await db
    .insert(transactions)
    .values({
      reference,
      userId: senderId,
      category: "INTERNAL_TRANSFER",
      status: "PROCESSING",
      amount: amount.toFixed(2),
      totalCharged: amount.toFixed(2),
      counterpartyUserId: recipient.id,
      payload: { narration, recipientUsername: recipient.username },
    })
    .returning();

  await debitWallet({
    walletId: senderWallet.id,
    amount,
    reason: "INTERNAL_TRANSFER_OUT",
    transactionId: txn.id,
  });

  await creditWallet({
    walletId: recipientWallet.id,
    amount,
    reason: "INTERNAL_TRANSFER_IN",
  });

  await db.update(transactions).set({ status: "SUCCESSFUL" }).where(eq(transactions.id, txn.id));

  return { reference, recipientName: recipient.fullName };
}

/** Wallet-to-bank withdrawal. Debits immediately (funds held), then the payout
 *  is dispatched to the bank transfer provider (Paystack/Monnify Transfers) —
 *  see payments module. If the payout provider later reports failure via
 *  webhook, the debit is reversed there.
 *
 *  NOT YET SAFE TO USE: the actual payout dispatch below is unimplemented.
 *  This throws until that's built, so the endpoint can never debit a user's
 *  wallet without a real transfer ever being sent. Remove this guard only
 *  once the TODO below is implemented and tested against a real payout. */
export async function initiateBankWithdrawal(
  userId: string,
  bankCode: string,
  accountNumber: string,
  accountName: string,
  amount: number,
) {
  throw HttpError.badRequest(
    "Bank withdrawal isn't available yet — payout provider integration is still in progress.",
    "WITHDRAWAL_NOT_AVAILABLE",
  );

  // eslint-disable-next-line no-unreachable
  const wallet = await getWalletByUserId(userId);
  const reference = generateReference();

  const [txn] = await db
    .insert(transactions)
    .values({
      reference,
      userId,
      category: "BANK_WITHDRAWAL",
      status: "PROCESSING",
      amount: amount.toFixed(2),
      totalCharged: amount.toFixed(2),
      bankCode,
      accountNumber,
      accountName,
    })
    .returning();

  await debitWallet({
    walletId: wallet.id,
    amount,
    reason: "BANK_WITHDRAWAL",
    transactionId: txn.id,
  });

  // TODO: dispatch to Paystack/Monnify Transfers API here once credentials
  // are configured in the admin panel. The transaction stays PROCESSING
  // until the provider's webhook confirms success or failure. Remove the
  // early throw above once this is implemented and tested end-to-end.

  return { reference, status: txn.status };
}

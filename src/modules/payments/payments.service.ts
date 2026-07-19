import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users, transactions } from "../../db/schema";
import { generateReference } from "../../lib/reference";
import { getWalletByUserId, creditWallet } from "../wallet/ledger.service";
import { getPaymentGatewayConfig } from "./gateway-config";

export function verifyPaystackSignature(rawBody: Buffer, signatureHeader: string | undefined, secretKey: string): boolean {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return hash === signatureHeader;
}

export function verifyMonnifySignature(rawBody: Buffer, signatureHeader: string | undefined, secretKey: string): boolean {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return hash === signatureHeader;
}

/** Credits the wallet belonging to `email`. Uses the provider's event/reference
 *  as the idempotency key so a retried webhook delivery never double-credits. */
async function creditUserWalletByEmail(email: string, amount: number, idempotencyKey: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user) return { credited: false, reason: "No matching user for this email" };

  const wallet = await getWalletByUserId(user.id);
  const reference = generateReference();

  const [txn] = await db
    .insert(transactions)
    .values({
      reference,
      userId: user.id,
      category: "WALLET_FUNDING",
      status: "SUCCESSFUL",
      amount: amount.toFixed(2),
      totalCharged: amount.toFixed(2),
    })
    .returning();

  await creditWallet({
    walletId: wallet.id,
    amount,
    reason: "WALLET_FUNDING",
    transactionId: txn.id,
    idempotencyKey,
  });

  return { credited: true };
}

export async function handlePaystackWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  const config = await getPaymentGatewayConfig("paystack");
  if (!config) return { ok: false, reason: "Paystack is not configured" };

  if (!verifyPaystackSignature(rawBody, signatureHeader, config.secretKey)) {
    return { ok: false, reason: "Invalid signature" };
  }

  const event = JSON.parse(rawBody.toString("utf8"));

  if (event.event === "charge.success") {
    const email: string = event.data.customer.email;
    const amount: number = event.data.amount / 100; // kobo -> naira
    const idempotencyKey = `paystack:${event.data.reference}`;
    const result = await creditUserWalletByEmail(email, amount, idempotencyKey);
    return { ok: true, ...result };
  }

  return { ok: true, ignored: true };
}

export async function handleMonnifyWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  const config = await getPaymentGatewayConfig("monnify");
  if (!config) return { ok: false, reason: "Monnify is not configured" };

  if (!verifyMonnifySignature(rawBody, signatureHeader, config.secretKey)) {
    return { ok: false, reason: "Invalid signature" };
  }

  const event = JSON.parse(rawBody.toString("utf8"));

  if (event.eventType === "SUCCESSFUL_TRANSACTION") {
    const email: string = event.eventData.customer.email;
    const amount: number = event.eventData.amountPaid;
    const idempotencyKey = `monnify:${event.eventData.transactionReference}`;
    const result = await creditUserWalletByEmail(email, amount, idempotencyKey);
    return { ok: true, ...result };
  }

  return { ok: true, ignored: true };
}

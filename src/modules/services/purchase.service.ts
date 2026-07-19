import { eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { transactions, pricingRules, serviceToggles, TransactionCategory } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { generateReference } from "../../lib/reference";
import { getWalletByUserId, debitWallet, creditWallet } from "../wallet/ledger.service";
import { getActiveVtuProvider } from "./providers/registry";
import {
  PurchaseAirtimeInput,
  PurchaseDataInput,
  PurchaseCableInput,
  PurchaseElectricityInput,
  PurchaseEducationPinInput,
  ProviderPurchaseResult,
} from "./providers/types";

type Category = "AIRTIME" | "DATA" | "CABLE_TV" | "ELECTRICITY" | "EDUCATION_PIN";

async function assertServiceEnabled(category: Category) {
  const [toggle] = await db
    .select()
    .from(serviceToggles)
    .where(eq(serviceToggles.category, category as TransactionCategory));
  // No row yet = treated as enabled by default (admin hasn't explicitly disabled it).
  if (toggle && !toggle.enabled) {
    throw HttpError.forbidden("This service is temporarily unavailable", "SERVICE_DISABLED");
  }
}

/** Looks up the admin-configured selling price. Falls back to the raw amount
 *  passed by the client only for variable-amount services (airtime/electricity). */
async function resolveSellingPrice(
  category: Category,
  network: string | undefined,
  planCode: string | undefined,
  fallbackAmount?: number,
): Promise<number> {
  const conditions = [eq(pricingRules.category, category as TransactionCategory)];
  if (network) conditions.push(eq(pricingRules.network, network));
  if (planCode) conditions.push(eq(pricingRules.planCode, planCode));

  const [rule] = await db
    .select()
    .from(pricingRules)
    .where(and(...conditions, eq(pricingRules.isActive, true)));

  if (rule) return Number(rule.sellingPrice);
  if (fallbackAmount !== undefined) return fallbackAmount;

  throw HttpError.badRequest("This plan is not currently available", "PRICING_NOT_FOUND");
}

/**
 * Generic execution flow shared by every purchase type:
 * 1. Create a PENDING transaction row (audit trail exists even if we crash next).
 * 2. Debit the wallet (funds are now "held").
 * 3. Call the provider.
 * 4. On success: mark transaction SUCCESSFUL.
 *    On failure: reverse the debit with a credit, mark transaction FAILED.
 * This guarantees a user is never left charged for a service they didn't receive.
 */
async function executePurchase(params: {
  userId: string;
  category: Category;
  amount: number;
  payload: Record<string, unknown>;
  call: () => Promise<ProviderPurchaseResult>;
}) {
  const { userId, category, amount, payload, call } = params;
  const wallet = await getWalletByUserId(userId);
  const reference = generateReference();

  const [txn] = await db
    .insert(transactions)
    .values({
      reference,
      userId,
      category: category as TransactionCategory,
      status: "PENDING",
      amount: amount.toFixed(2),
      fee: "0",
      totalCharged: amount.toFixed(2),
      payload,
    })
    .returning();

  try {
    await debitWallet({
      walletId: wallet.id,
      amount,
      reason: "SERVICE_PURCHASE",
      transactionId: txn.id,
    });
  } catch (err) {
    await db.update(transactions).set({ status: "FAILED", failureReason: "Insufficient balance" }).where(eq(transactions.id, txn.id));
    throw err;
  }

  await db.update(transactions).set({ status: "PROCESSING" }).where(eq(transactions.id, txn.id));

  try {
    const result = await call();

    if (result.success) {
      await db
        .update(transactions)
        .set({
          status: "SUCCESSFUL",
          providerRef: result.providerRef,
          providerResponse: result.data ?? {},
        })
        .where(eq(transactions.id, txn.id));

      return { reference, status: "SUCCESSFUL" as const, data: result.data };
    }

    // Provider explicitly failed the request — reverse the hold immediately.
    await creditWallet({
      walletId: wallet.id,
      amount,
      reason: "SERVICE_PURCHASE_REVERSAL",
      transactionId: txn.id,
    });
    await db
      .update(transactions)
      .set({ status: "REVERSED", failureReason: result.message, providerResponse: { raw: result.raw } })
      .where(eq(transactions.id, txn.id));

    throw HttpError.badRequest(result.message, "PROVIDER_DECLINED");
  } catch (err) {
    // Network/unexpected error talking to provider — also reverse, never leave
    // a customer debited with no way to know if they'll get their service.
    if (!(err instanceof HttpError && err.code === "PROVIDER_DECLINED")) {
      await creditWallet({
        walletId: wallet.id,
        amount,
        reason: "SERVICE_PURCHASE_REVERSAL",
        transactionId: txn.id,
      });
      await db
        .update(transactions)
        .set({ status: "REVERSED", failureReason: "Provider unreachable, transaction reversed" })
        .where(eq(transactions.id, txn.id));
    }
    throw err;
  }
}

export async function buyAirtime(userId: string, input: PurchaseAirtimeInput) {
  await assertServiceEnabled("AIRTIME");
  const amount = await resolveSellingPrice("AIRTIME", input.network, undefined, input.amount);
  const provider = await getActiveVtuProvider();

  return executePurchase({
    userId,
    category: "AIRTIME",
    amount,
    payload: { ...input },
    call: () => provider.purchaseAirtime({ ...input, amount }),
  });
}

export async function buyData(userId: string, input: PurchaseDataInput) {
  await assertServiceEnabled("DATA");
  const amount = await resolveSellingPrice("DATA", input.network, input.planCode);
  const provider = await getActiveVtuProvider();

  return executePurchase({
    userId,
    category: "DATA",
    amount,
    payload: { ...input },
    call: () => provider.purchaseData(input),
  });
}

export async function buyCable(userId: string, input: PurchaseCableInput) {
  await assertServiceEnabled("CABLE_TV");
  const amount = await resolveSellingPrice("CABLE_TV", input.provider, input.packageCode);
  const provider = await getActiveVtuProvider();

  return executePurchase({
    userId,
    category: "CABLE_TV",
    amount,
    payload: { ...input },
    call: () => provider.purchaseCable(input),
  });
}

export async function buyElectricity(userId: string, input: PurchaseElectricityInput) {
  await assertServiceEnabled("ELECTRICITY");
  const amount = await resolveSellingPrice("ELECTRICITY", input.disco, undefined, input.amount);
  const provider = await getActiveVtuProvider();

  return executePurchase({
    userId,
    category: "ELECTRICITY",
    amount,
    payload: { ...input },
    call: () => provider.purchaseElectricity({ ...input, amount }),
  });
}

export async function buyEducationPin(userId: string, input: PurchaseEducationPinInput) {
  await assertServiceEnabled("EDUCATION_PIN");
  const unitPrice = await resolveSellingPrice("EDUCATION_PIN", input.examBody, undefined);
  const amount = unitPrice * input.quantity;
  const provider = await getActiveVtuProvider();

  return executePurchase({
    userId,
    category: "EDUCATION_PIN",
    amount,
    payload: { ...input },
    call: () => provider.purchaseEducationPin(input),
  });
}

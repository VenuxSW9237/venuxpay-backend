import { eq, and } from "drizzle-orm";
import { db } from "../../db/client";
import { providerSettings } from "../../db/schema";
import { decrypt } from "../../lib/crypto";

export interface PaymentGatewayConfig {
  secretKey: string;
  publicKey?: string;
  contractCode?: string; // Monnify-specific
  apiKey?: string; // Monnify-specific
}

export async function getPaymentGatewayConfig(name: "paystack" | "monnify"): Promise<PaymentGatewayConfig | null> {
  const [setting] = await db
    .select()
    .from(providerSettings)
    .where(
      and(
        eq(providerSettings.name, name),
        eq(providerSettings.type, "PAYMENT_GATEWAY"),
        eq(providerSettings.isActive, true),
      ),
    );

  if (!setting) return null;
  return decrypt<PaymentGatewayConfig>(setting.encryptedConfig);
}

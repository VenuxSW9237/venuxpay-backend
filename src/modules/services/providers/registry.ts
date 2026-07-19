import { eq, and } from "drizzle-orm";
import { db } from "../../../db/client";
import { providerSettings } from "../../../db/schema";
import { decrypt } from "../../../lib/crypto";
import { VtuProvider } from "./types";
import { MockProvider } from "./mock-provider";

// Add real adapters here as they're built, e.g.:
//   import { VtpassProvider } from "./vtpass-provider";
//   import { ClubkonnectProvider } from "./clubkonnect-provider";
const PROVIDER_FACTORIES: Record<string, (config: Record<string, string>) => VtuProvider> = {
  mock: () => new MockProvider(),
  // vtpass: (config) => new VtpassProvider(config),
  // clubkonnect: (config) => new ClubkonnectProvider(config),
};

/**
 * Reads the admin-configured active VTU provider from the database, decrypts
 * its credentials, and constructs the adapter. Falls back to MockProvider if
 * none is configured yet, so the purchase flow works end-to-end from day one.
 */
export async function getActiveVtuProvider(): Promise<VtuProvider> {
  const [setting] = await db
    .select()
    .from(providerSettings)
    .where(
      and(
        eq(providerSettings.type, "VTU"),
        eq(providerSettings.isActive, true),
        eq(providerSettings.isPrimary, true),
      ),
    );

  if (!setting) return new MockProvider();

  const factory = PROVIDER_FACTORIES[setting.name];
  if (!factory) return new MockProvider();

  const config = decrypt<Record<string, string>>(setting.encryptedConfig);
  return factory(config);
}

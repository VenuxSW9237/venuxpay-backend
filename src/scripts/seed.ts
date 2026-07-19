import "dotenv/config";
import { db } from "../db/client";
import { serviceToggles } from "../db/schema";
import { createAdmin } from "../modules/admin/admin.service";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipping admin seed — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.");
  } else {
    const admin = await createAdmin("Super Admin", email, password, "SUPER_ADMIN");
    console.log(`Created super admin: ${admin.email}`);
  }

  const categories = [
    "AIRTIME",
    "DATA",
    "CABLE_TV",
    "ELECTRICITY",
    "EDUCATION_PIN",
    "WALLET_FUNDING",
    "INTERNAL_TRANSFER",
    "BANK_WITHDRAWAL",
  ] as const;

  for (const category of categories) {
    await db.insert(serviceToggles).values({ category, enabled: true }).onConflictDoNothing();
  }
  console.log("Service toggles seeded (all enabled by default).");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

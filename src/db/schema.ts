import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Enums ----------

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "PENDING_VERIFICATION",
]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
]);
export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "CREDIT",
  "DEBIT",
]);
export const ledgerReasonEnum = pgEnum("ledger_reason", [
  "WALLET_FUNDING",
  "SERVICE_PURCHASE",
  "SERVICE_PURCHASE_REVERSAL",
  "INTERNAL_TRANSFER_OUT",
  "INTERNAL_TRANSFER_IN",
  "BANK_WITHDRAWAL",
  "BANK_WITHDRAWAL_REVERSAL",
  "ADMIN_ADJUSTMENT",
  "REFERRAL_BONUS",
]);
export const transactionCategoryEnum = pgEnum("transaction_category", [
  "AIRTIME",
  "DATA",
  "CABLE_TV",
  "ELECTRICITY",
  "EDUCATION_PIN",
  "WALLET_FUNDING",
  "INTERNAL_TRANSFER",
  "BANK_WITHDRAWAL",
]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "PROCESSING",
  "SUCCESSFUL",
  "FAILED",
  "REVERSED",
]);
export const adminRoleEnum = pgEnum("admin_role", [
  "SUPER_ADMIN",
  "FINANCE",
  "SUPPORT",
]);
export const otpPurposeEnum = pgEnum("otp_purpose", [
  "REGISTER",
  "LOGIN",
  "RESET_PASSWORD",
  "TRANSFER",
]);

// ---------- Users & Auth ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    username: varchar("username", { length: 40 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    transactionPinHash: text("transaction_pin_hash"),
    status: userStatusEnum("status").notNull().default("PENDING_VERIFICATION"),
    kycStatus: kycStatusEnum("kyc_status").notNull().default("UNVERIFIED"),
    bvn: varchar("bvn", { length: 20 }),
    referralCode: varchar("referral_code", { length: 30 }).notNull(),
    referredById: uuid("referred_by_id"),
    twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_phone_idx").on(t.phone),
    uniqueIndex("users_username_idx").on(t.username),
    uniqueIndex("users_referral_code_idx").on(t.referralCode),
  ],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("otp_user_purpose_idx").on(t.userId, t.purpose)],
);

// ---------- Wallet & Ledger ----------
// Balance is NEVER stored directly. It is always derived as the running sum
// of ledger entries for a wallet — this is what makes reconciliation and
// dispute resolution possible and prevents silent balance drift.

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    type: ledgerEntryTypeEnum("type").notNull(),
    reason: ledgerReasonEnum("reason").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // always positive
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
    transactionId: uuid("transaction_id").unique(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_wallet_created_idx").on(t.walletId, t.createdAt),
    uniqueIndex("ledger_idempotency_idx").on(t.idempotencyKey),
  ],
);

// ---------- Transactions ----------

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: varchar("reference", { length: 40 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    category: transactionCategoryEnum("category").notNull(),
    status: transactionStatusEnum("status").notNull().default("PENDING"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    fee: numeric("fee", { precision: 14, scale: 2 }).notNull().default("0"),
    totalCharged: numeric("total_charged", { precision: 14, scale: 2 }).notNull(),

    providerId: uuid("provider_id"),
    providerRef: varchar("provider_ref", { length: 100 }),
    payload: jsonb("payload"),
    providerResponse: jsonb("provider_response"),

    counterpartyUserId: uuid("counterparty_user_id"),

    bankCode: varchar("bank_code", { length: 10 }),
    accountNumber: varchar("account_number", { length: 20 }),
    accountName: varchar("account_name", { length: 120 }),

    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_reference_idx").on(t.reference),
    index("transactions_user_created_idx").on(t.userId, t.createdAt),
    index("transactions_status_idx").on(t.status),
  ],
);

// ---------- Virtual Accounts ----------

export const virtualAccounts = pgTable("virtual_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 30 }).notNull(),
  accountNumber: varchar("account_number", { length: 20 }).notNull(),
  bankName: varchar("bank_name", { length: 80 }).notNull(),
  accountName: varchar("account_name", { length: 120 }).notNull(),
  providerRef: varchar("provider_ref", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Admin, Provider settings, Pricing ----------

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 160 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRoleEnum("role").notNull().default("SUPPORT"),
  twoFaSecret: text("two_fa_secret"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Stores VTU provider & payment gateway credentials. `encryptedConfig` holds
// an AES-256-GCM encrypted JSON blob — see src/lib/crypto.ts. Never decrypted
// in any API response, only used server-side when calling the provider.
export const providerSettings = pgTable(
  "provider_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 40 }).notNull(), // "vtpass" | "clubkonnect" | "paystack" | "monnify" ...
    type: varchar("type", { length: 20 }).notNull(), // "VTU" | "PAYMENT_GATEWAY"
    isActive: boolean("is_active").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    encryptedConfig: text("encrypted_config").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_name_type_idx").on(t.name, t.type)],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: transactionCategoryEnum("category").notNull(),
    network: varchar("network", { length: 30 }),
    planCode: varchar("plan_code", { length: 60 }),
    costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull(),
    sellingPrice: numeric("selling_price", { precision: 14, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pricing_unique_idx").on(t.category, t.network, t.planCode),
  ],
);

export const serviceToggles = pgTable("service_toggles", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: transactionCategoryEnum("category").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id),
    action: varchar("action", { length: 60 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: varchar("target_id", { length: 100 }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_admin_created_idx").on(t.adminId, t.createdAt)],
);

// ---------- Relations ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  transactions: many(transactions),
  otps: many(otpCodes),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  wallet: one(wallets, { fields: [ledgerEntries.walletId], references: [wallets.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  admin: one(adminUsers, { fields: [auditLogs.adminId], references: [adminUsers.id] }),
}));

// ---------- Derived TS types for enum columns ----------
// Drizzle's pgEnum() exposes runtime values via `.enumValues`; these give us
// proper TS union types for use in service/route code (e.g. TransactionCategory).

export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type KycStatus = (typeof kycStatusEnum.enumValues)[number];
export type LedgerEntryType = (typeof ledgerEntryTypeEnum.enumValues)[number];
export type LedgerReason = (typeof ledgerReasonEnum.enumValues)[number];
export type TransactionCategory = (typeof transactionCategoryEnum.enumValues)[number];
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];
export type AdminRole = (typeof adminRoleEnum.enumValues)[number];
export type OtpPurpose = (typeof otpPurposeEnum.enumValues)[number];

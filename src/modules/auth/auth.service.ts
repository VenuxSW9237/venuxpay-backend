import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { users, wallets, otpCodes } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { generateReferralCode } from "../../lib/reference";
import { signToken } from "../../lib/jwt";

const SALT_ROUNDS = 12;

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, SALT_ROUNDS);
}

export async function verifySecret(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  referredByCode?: string;
}

export async function registerUser(input: RegisterInput) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()));

  if (existing.length > 0) {
    throw HttpError.conflict("An account with this email already exists", "EMAIL_TAKEN");
  }

  const passwordHash = await hashSecret(input.password);
  const referralCode = generateReferralCode(input.username);

  let referredById: string | null = null;
  if (input.referredByCode) {
    const [referrer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, input.referredByCode));
    referredById = referrer?.id ?? null;
  }

  const { user, wallet } = await db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        username: input.username.toLowerCase(),
        passwordHash,
        referralCode,
        referredById,
      })
      .returning();

    const [createdWallet] = await tx
      .insert(wallets)
      .values({ userId: createdUser.id })
      .returning();

    return { user: createdUser, wallet: createdWallet };
  });

  const accessToken = signToken({ sub: user.id, type: "user" });
  return { user, wallet, accessToken };
}

export async function loginUser(emailOrPhone: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, emailOrPhone.toLowerCase()));

  const candidate = user ?? (await db.select().from(users).where(eq(users.phone, emailOrPhone)))[0];

  if (!candidate) throw HttpError.unauthorized("Incorrect email/phone or password", "INVALID_CREDENTIALS");

  const valid = await verifySecret(password, candidate.passwordHash);
  if (!valid) throw HttpError.unauthorized("Incorrect email/phone or password", "INVALID_CREDENTIALS");

  if (candidate.status === "SUSPENDED") {
    throw HttpError.forbidden("Your account has been suspended. Contact support.", "ACCOUNT_SUSPENDED");
  }

  const accessToken = signToken({ sub: candidate.id, type: "user" });
  return { user: candidate, accessToken };
}

/** Generates a 6-digit OTP, stores its hash (never the raw code), and returns the raw code
 *  so the caller can dispatch it via SMS/email. Never log or persist the raw code. */
export async function issueOtp(userId: string, purpose: "REGISTER" | "LOGIN" | "RESET_PASSWORD" | "TRANSFER") {
  const code = crypto.randomInt(100000, 999999).toString();
  const codeHash = await hashSecret(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(otpCodes).values({ userId, codeHash, purpose, expiresAt });
  return code;
}

export async function verifyOtp(
  userId: string,
  code: string,
  purpose: "REGISTER" | "LOGIN" | "RESET_PASSWORD" | "TRANSFER",
) {
  const candidates = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.userId, userId),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    );

  for (const candidate of candidates) {
    if (await verifySecret(code, candidate.codeHash)) {
      await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, candidate.id));
      return true;
    }
  }

  throw HttpError.badRequest("Invalid or expired code", "INVALID_OTP");
}

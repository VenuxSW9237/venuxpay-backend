import crypto from "crypto";

/** Generates a human-friendly transaction reference, e.g. TXN-88213-VNX */
export function generateReference(): string {
  const num = crypto.randomInt(10000, 99999);
  return `TXN-${num}-VNX`;
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function generateReferralCode(username: string): string {
  const suffix = crypto.randomInt(10, 99);
  return `VENUX-${username.toUpperCase().slice(0, 6)}${suffix}`;
}

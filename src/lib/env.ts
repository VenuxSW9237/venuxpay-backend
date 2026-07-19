import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  selfPingUrl: process.env.SELF_PING_URL || "", // e.g. https://venuxpay-api.onrender.com (no trailing slash)

  paystackWebhookSecret: process.env.PAYSTACK_SECRET_KEY || "",
  monnifySecretKey: process.env.MONNIFY_SECRET_KEY || "",

  isProd: process.env.NODE_ENV === "production",
};

/** Call at boot in production to fail fast instead of running with bad config. */
export function assertProductionEnv() {
  if (!env.isProd) return;
  required("DATABASE_URL");
  required("JWT_SECRET");
  required("ENCRYPTION_KEY");
}

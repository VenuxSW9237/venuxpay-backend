import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { adminUsers, auditLogs } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { signToken } from "../../lib/jwt";
import { hashSecret, verifySecret } from "../auth/auth.service";

export async function loginAdmin(email: string, password: string) {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
  if (!admin || !admin.isActive) {
    throw HttpError.unauthorized("Incorrect email or password", "INVALID_CREDENTIALS");
  }

  const valid = await verifySecret(password, admin.passwordHash);
  if (!valid) throw HttpError.unauthorized("Incorrect email or password", "INVALID_CREDENTIALS");

  const accessToken = signToken({ sub: admin.id, type: "admin", role: admin.role }, "8h");
  return { admin, accessToken };
}

export async function createAdmin(fullName: string, email: string, password: string, role: "SUPER_ADMIN" | "FINANCE" | "SUPPORT") {
  const passwordHash = await hashSecret(password);
  const [admin] = await db
    .insert(adminUsers)
    .values({ fullName, email: email.toLowerCase(), passwordHash, role })
    .returning();
  return admin;
}

export async function writeAuditLog(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({ adminId, action, targetType, targetId, metadata });
}

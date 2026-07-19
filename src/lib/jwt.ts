import jwt from "jsonwebtoken";
import { env } from "./env";

export interface UserTokenPayload {
  sub: string; // user id
  type: "user";
}

export interface AdminTokenPayload {
  sub: string; // admin id
  type: "admin";
  role: "SUPER_ADMIN" | "FINANCE" | "SUPPORT";
}

export type TokenPayload = UserTokenPayload | AdminTokenPayload;

export function signToken(payload: TokenPayload, expiresIn: string = env.jwtExpiresIn): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken<T extends TokenPayload = TokenPayload>(token: string): T {
  return jwt.verify(token, env.jwtSecret) as T;
}

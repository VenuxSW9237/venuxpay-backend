import { Request, Response, NextFunction } from "express";
import { verifyToken, AdminTokenPayload, UserTokenPayload } from "../lib/jwt";
import { HttpError } from "../lib/http-error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      admin?: AdminTokenPayload;
    }
  }
}

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw HttpError.unauthorized("Missing or invalid Authorization header");
  }
  return header.slice("Bearer ".length);
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    const payload = verifyToken<UserTokenPayload>(token);
    if (payload.type !== "user") throw HttpError.unauthorized("Invalid token type");
    req.userId = payload.sub;
    next();
  } catch {
    next(HttpError.unauthorized("Session expired or invalid, please log in again"));
  }
}

export function requireAdmin(...allowedRoles: AdminTokenPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      const payload = verifyToken<AdminTokenPayload>(token);
      if (payload.type !== "admin") throw HttpError.unauthorized("Invalid token type");
      if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
        throw HttpError.forbidden("You do not have permission to perform this action");
      }
      req.admin = payload;
      next();
    } catch (err) {
      if (err instanceof HttpError) return next(err);
      next(HttpError.unauthorized("Session expired or invalid, please log in again"));
    }
  };
}

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./lib/env";
import { HttpError } from "./lib/http-error";
import paymentsRoutes from "./modules/payments/payments.routes";
import apiRoutes from "./routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(morgan(env.isProd ? "combined" : "dev"));

  // Payment webhooks MUST be mounted before express.json() — signature
  // verification needs the raw, unparsed request body.
  app.use("/webhooks", paymentsRoutes);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Global rate limiting — tighter limits on auth/OTP endpoints specifically
  // to slow down credential-stuffing and OTP-brute-force attempts.
  app.use(
    "/api",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }),
  );
  app.use(
    ["/api/auth/login", "/api/auth/register", "/api/admin/auth/login"],
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", apiRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  // Centralized error handler — every route uses asyncHandler so thrown
  // errors (including from Zod validation and HttpError) land here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  });

  return app;
}

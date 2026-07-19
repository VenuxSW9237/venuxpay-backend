import { Router, raw } from "express";
import { asyncHandler } from "../../lib/validate";
import { handlePaystackWebhook, handleMonnifyWebhook } from "./payments.service";

const router = Router();

// IMPORTANT: this router must be mounted in app.ts BEFORE express.json(),
// because signature verification requires the exact raw request bytes —
// once a JSON body parser re-serializes the body, the HMAC won't match.

router.post(
  "/paystack",
  raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const result = await handlePaystackWebhook(req.body as Buffer, req.headers["x-paystack-signature"] as string);
    res.status(result.ok ? 200 : 400).json(result);
  }),
);

router.post(
  "/monnify",
  raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const result = await handleMonnifyWebhook(req.body as Buffer, req.headers["monnify-signature"] as string);
    res.status(result.ok ? 200 : 400).json(result);
  }),
);

export default router;

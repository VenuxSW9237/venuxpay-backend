import { Router } from "express";
import { z } from "zod";
import { validateBody, asyncHandler } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import {
  buyAirtime,
  buyData,
  buyCable,
  buyElectricity,
  buyEducationPin,
} from "./purchase.service";
import { getActiveVtuProvider } from "./providers/registry";

const router = Router();

const airtimeSchema = z.object({
  network: z.enum(["mtn", "glo", "airtel", "9mobile"]),
  phone: z.string().min(10).max(15),
  amount: z.number().positive(),
});

router.post(
  "/airtime",
  requireUser,
  validateBody(airtimeSchema),
  asyncHandler(async (req, res) => {
    const result = await buyAirtime(req.userId!, req.body);
    res.status(201).json(result);
  }),
);

const dataSchema = z.object({
  network: z.enum(["mtn", "glo", "airtel", "9mobile"]),
  phone: z.string().min(10).max(15),
  planCode: z.string().min(1),
});

router.post(
  "/data",
  requireUser,
  validateBody(dataSchema),
  asyncHandler(async (req, res) => {
    const result = await buyData(req.userId!, req.body);
    res.status(201).json(result);
  }),
);

const cableSchema = z.object({
  provider: z.enum(["dstv", "gotv", "startimes"]),
  smartCardNumber: z.string().min(5),
  packageCode: z.string().min(1),
});

router.post(
  "/cable",
  requireUser,
  validateBody(cableSchema),
  asyncHandler(async (req, res) => {
    const result = await buyCable(req.userId!, req.body);
    res.status(201).json(result);
  }),
);

router.get(
  "/cable/verify",
  requireUser,
  asyncHandler(async (req, res) => {
    const { smartCardNumber, provider } = req.query as { smartCardNumber?: string; provider?: string };
    if (!smartCardNumber || !provider) {
      res.status(400).json({ message: "smartCardNumber and provider are required" });
      return;
    }
    const vtu = await getActiveVtuProvider();
    const result = await vtu.verifyCableCustomer(smartCardNumber, provider);
    res.json(result);
  }),
);

const electricitySchema = z.object({
  disco: z.string().min(2),
  meterNumber: z.string().min(5),
  meterType: z.enum(["prepaid", "postpaid"]),
  amount: z.number().positive(),
});

router.post(
  "/electricity",
  requireUser,
  validateBody(electricitySchema),
  asyncHandler(async (req, res) => {
    const result = await buyElectricity(req.userId!, req.body);
    res.status(201).json(result);
  }),
);

router.get(
  "/electricity/verify",
  requireUser,
  asyncHandler(async (req, res) => {
    const { meterNumber, disco } = req.query as { meterNumber?: string; disco?: string };
    if (!meterNumber || !disco) {
      res.status(400).json({ message: "meterNumber and disco are required" });
      return;
    }
    const vtu = await getActiveVtuProvider();
    const result = await vtu.verifyMeterNumber(meterNumber, disco);
    res.json(result);
  }),
);

const educationSchema = z.object({
  examBody: z.enum(["waec", "neco", "jamb", "nabteb"]),
  quantity: z.number().int().positive().max(10),
});

router.post(
  "/education-pin",
  requireUser,
  validateBody(educationSchema),
  asyncHandler(async (req, res) => {
    const result = await buyEducationPin(req.userId!, req.body);
    res.status(201).json(result);
  }),
);

export default router;

export interface PurchaseAirtimeInput {
  network: string; // "mtn" | "glo" | "airtel" | "9mobile"
  phone: string;
  amount: number;
}

export interface PurchaseDataInput {
  network: string;
  phone: string;
  planCode: string;
}

export interface PurchaseCableInput {
  provider: string; // "dstv" | "gotv" | "startimes"
  smartCardNumber: string;
  packageCode: string;
}

export interface PurchaseElectricityInput {
  disco: string;
  meterNumber: string;
  meterType: "prepaid" | "postpaid";
  amount: number;
}

export interface PurchaseEducationPinInput {
  examBody: string; // "waec" | "neco" | "jamb" | "nabteb"
  quantity: number;
}

export interface ProviderPurchaseResult {
  success: boolean;
  providerRef: string;
  message: string;
  /** e.g. generated education pins, token for electricity, etc. */
  data?: Record<string, unknown>;
  raw: unknown;
}

export interface VerifyCustomerResult {
  name: string;
  raw: unknown;
}

/**
 * Every VTU provider (VTpass, Clubkonnect, Payscribe, ...) implements this
 * interface. Business logic (src/modules/services) only ever talks to this
 * interface, never to a specific provider's SDK directly — so switching or
 * adding providers is a matter of writing one new adapter class and
 * registering it, not touching purchase/reversal logic anywhere else.
 */
export interface VtuProvider {
  readonly name: string;

  purchaseAirtime(input: PurchaseAirtimeInput): Promise<ProviderPurchaseResult>;
  purchaseData(input: PurchaseDataInput): Promise<ProviderPurchaseResult>;
  purchaseCable(input: PurchaseCableInput): Promise<ProviderPurchaseResult>;
  purchaseElectricity(input: PurchaseElectricityInput): Promise<ProviderPurchaseResult>;
  purchaseEducationPin(input: PurchaseEducationPinInput): Promise<ProviderPurchaseResult>;

  verifyCableCustomer(smartCardNumber: string, provider: string): Promise<VerifyCustomerResult>;
  verifyMeterNumber(meterNumber: string, disco: string): Promise<VerifyCustomerResult>;
}

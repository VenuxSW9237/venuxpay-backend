import crypto from "crypto";
import {
  VtuProvider,
  PurchaseAirtimeInput,
  PurchaseDataInput,
  PurchaseCableInput,
  PurchaseElectricityInput,
  PurchaseEducationPinInput,
  ProviderPurchaseResult,
  VerifyCustomerResult,
} from "./types";

function ref(): string {
  return `MOCK-${crypto.randomInt(100000, 999999)}`;
}

/**
 * Simulates a real VTU provider: succeeds ~95% of the time with realistic
 * latency, so the full purchase → debit → reversal-on-failure flow can be
 * exercised end-to-end before a real provider (VTpass/Clubkonnect/etc.) is
 * wired in. Swap by registering a new adapter in providers/registry.ts —
 * no other code changes.
 */
export class MockProvider implements VtuProvider {
  readonly name = "mock";

  private async simulate(): Promise<{ success: boolean }> {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    return { success: Math.random() > 0.05 };
  }

  async purchaseAirtime(input: PurchaseAirtimeInput): Promise<ProviderPurchaseResult> {
    const { success } = await this.simulate();
    return {
      success,
      providerRef: ref(),
      message: success ? "Airtime delivered successfully" : "Provider timeout, please retry",
      raw: { input, simulated: true },
    };
  }

  async purchaseData(input: PurchaseDataInput): Promise<ProviderPurchaseResult> {
    const { success } = await this.simulate();
    return {
      success,
      providerRef: ref(),
      message: success ? "Data plan activated successfully" : "Plan currently unavailable",
      raw: { input, simulated: true },
    };
  }

  async purchaseCable(input: PurchaseCableInput): Promise<ProviderPurchaseResult> {
    const { success } = await this.simulate();
    return {
      success,
      providerRef: ref(),
      message: success ? "Subscription renewed successfully" : "Invalid smart card number",
      raw: { input, simulated: true },
    };
  }

  async purchaseElectricity(input: PurchaseElectricityInput): Promise<ProviderPurchaseResult> {
    const { success } = await this.simulate();
    return {
      success,
      providerRef: ref(),
      message: success ? "Token generated successfully" : "Meter validation failed",
      data: success ? { token: crypto.randomInt(1000000000000, 9999999999999).toString() } : undefined,
      raw: { input, simulated: true },
    };
  }

  async purchaseEducationPin(input: PurchaseEducationPinInput): Promise<ProviderPurchaseResult> {
    const { success } = await this.simulate();
    const pins = Array.from({ length: input.quantity }, () =>
      crypto.randomInt(100000000000, 999999999999).toString(),
    );
    return {
      success,
      providerRef: ref(),
      message: success ? "Pin(s) generated successfully" : "Pin stock unavailable",
      data: success ? { pins } : undefined,
      raw: { input, simulated: true },
    };
  }

  async verifyCableCustomer(smartCardNumber: string): Promise<VerifyCustomerResult> {
    await this.simulate();
    return { name: "Sample Customer Name", raw: { smartCardNumber, simulated: true } };
  }

  async verifyMeterNumber(meterNumber: string): Promise<VerifyCustomerResult> {
    await this.simulate();
    return { name: "Sample Customer Name", raw: { meterNumber, simulated: true } };
  }
}

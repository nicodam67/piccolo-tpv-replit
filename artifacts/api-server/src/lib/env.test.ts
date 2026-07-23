import { describe, expect, it } from "vitest";
import { ENV_CLASSIFICATION, validateApiEnvironment } from "./env";

const VALID_PRODUCTION = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost/piccolo",
  SESSION_SECRET: "x".repeat(32),
  PORT: "8080",
  RESTAURANT_ID: "restaurant-1",
};

describe("central environment validation", () => {
  it("accepts a complete production environment", () => {
    expect(validateApiEnvironment(VALID_PRODUCTION).environment).toBe("production");
  });

  for (const key of ENV_CLASSIFICATION.productionRequired) {
    it(`rejects production without ${key}`, () => {
      expect(() => validateApiEnvironment({ ...VALID_PRODUCTION, [key]: undefined }))
        .toThrow(key);
    });
  }

  it("rejects short secrets, invalid ports and development-only simulator variables", () => {
    expect(() => validateApiEnvironment({ ...VALID_PRODUCTION, SESSION_SECRET: "short" }))
      .toThrow("SESSION_SECRET");
    expect(() => validateApiEnvironment({ ...VALID_PRODUCTION, PORT: "invalid" }))
      .toThrow("PORT");
    expect(() => validateApiEnvironment({ ...VALID_PRODUCTION, CASH_MACHINE_SCENARIO: "success" }))
      .toThrow("CASH_MACHINE_SCENARIO");
    expect(() => validateApiEnvironment({ ...VALID_PRODUCTION, OCR_PROVIDER: "simulator" }))
      .toThrow("OCR_PROVIDER");
  });

  it("keeps Stripe disabled and reports configured credentials without activating it", () => {
    const result = validateApiEnvironment({
      ...VALID_PRODUCTION,
      STRIPE_SECRET_KEY: "sk_live_redacted",
    });
    expect(result.warnings).toContain("Stripe permanece desactivado aunque existan credenciales");
  });

  it("allows development/test profiles without activating demo implicitly", () => {
    expect(validateApiEnvironment({ NODE_ENV: "development" }).environment).toBe("development");
    expect(validateApiEnvironment({ NODE_ENV: "test" }).environment).toBe("test");
  });
});

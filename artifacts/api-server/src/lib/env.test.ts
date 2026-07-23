import { describe, expect, it } from "vitest";
import { ENV_CLASSIFICATION, validateApiEnvironment } from "./env";

const VALID_PRODUCTION = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost/piccolo",
  SESSION_SECRET: "x".repeat(32),
  PORT: "8080",
  RESTAURANT_ID: "restaurant-1",
  QR_TABLE_HMAC_SECRET: "q".repeat(32),
};

describe("central environment validation", () => {
  it("classifies public and secret variables explicitly", () => {
    expect(ENV_CLASSIFICATION.public).toContain("NODE_ENV");
    expect(ENV_CLASSIFICATION.secret).toContain("SESSION_SECRET");
    expect(ENV_CLASSIFICATION.secret).toContain("QR_TABLE_HMAC_SECRET");
    expect(ENV_CLASSIFICATION.public).not.toContain("SESSION_SECRET");
  });
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

  it("rejects staging, prod and misspelled environments instead of treating them as development", () => {
    for (const NODE_ENV of ["prod", "staging", "develop"]) {
      expect(() => validateApiEnvironment({ NODE_ENV })).toThrow("NODE_ENV");
    }
  });
});

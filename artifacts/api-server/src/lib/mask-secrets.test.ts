import { describe, expect, it } from "vitest";
import { maskSecrets, withoutBearerToken } from "./mask-secrets";

describe("secret masking", () => {
  it("recursively masks private configuration while preserving public identifiers", () => {
    const value = maskSecrets({
      stripePublishableKey: "pk_live_public",
      stripeSecretKey: "sk_live_private",
      stripeWebhookSecret: "whsec_private",
      nested: { secretAccessKey: "s3-private", apiKey: "provider-private" },
    });
    expect(value).toEqual({
      stripePublishableKey: "pk_live_public",
      stripeSecretKey: "***",
      stripeWebhookSecret: "***",
      nested: { secretAccessKey: "***", apiKey: "***" },
    });
  });

  it("removes bearer credentials from device and courier DTOs", () => {
    expect(withoutBearerToken({ id: "1", token: "secret" })).toEqual({
      id: "1",
      hasToken: true,
    });
    expect(withoutBearerToken({ id: "2", deviceToken: "secret" })).toEqual({
      id: "2",
      hasToken: true,
    });
  });
});

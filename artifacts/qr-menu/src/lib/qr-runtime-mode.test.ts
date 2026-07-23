import { describe, expect, it } from "vitest";
import { resolveQrRuntimeMode } from "./qr-runtime-mode";

describe("QR runtime mode", () => {
  it("requires complete configuration in production", () => {
    expect(resolveQrRuntimeMode({ nodeEnv: "production" })).toBe("blocked");
    expect(resolveQrRuntimeMode({
      nodeEnv: "production",
      demoFlag: "true",
    })).toBe("blocked");
    expect(resolveQrRuntimeMode({
      nodeEnv: "production",
      convexUrl: "https://example.convex.cloud",
    })).toBe("live");
  });

  it("only enables demo explicitly in development", () => {
    expect(resolveQrRuntimeMode({ nodeEnv: "development" })).toBe("blocked");
    expect(resolveQrRuntimeMode({
      nodeEnv: "development",
      demoFlag: "true",
    })).toBe("demo");
    expect(resolveQrRuntimeMode({
      nodeEnv: "development",
      convexUrl: "https://example.convex.cloud",
    })).toBe("live");
  });
});

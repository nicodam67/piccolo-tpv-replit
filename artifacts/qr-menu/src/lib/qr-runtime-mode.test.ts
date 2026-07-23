import { describe, expect, it } from "vitest";
import { resolveQrRuntimeMode } from "./qr-runtime-mode";

describe("QR environment matrix", () => {
  it.each([
    ["production", undefined, undefined, "blocked"],
    ["production", undefined, "true", "blocked"],
    ["production", "https://example.convex.cloud", undefined, "live"],
    ["development", undefined, undefined, "blocked"],
    ["development", undefined, "true", "demo"],
    ["development", "https://example.convex.cloud", "true", "live"],
    ["test", undefined, undefined, "blocked"],
  ])("%s url=%s demo=%s -> %s", (nodeEnv, convexUrl, demoFlag, expected) => {
    expect(resolveQrRuntimeMode({ nodeEnv, convexUrl, demoFlag })).toBe(expected);
  });
});

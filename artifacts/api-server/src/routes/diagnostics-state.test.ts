import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: {} };
});

const { deriveOperationalState } = await import("./diagnostics");

describe("service operational states", () => {
  it("reports every required service state consistently", () => {
    expect(deriveOperationalState({ total: 2 })).toBe("operational");
    expect(deriveOperationalState({ recovering: 1 })).toBe("recovering");
    expect(deriveOperationalState({ errors: 1 })).toBe("degraded");
    expect(deriveOperationalState({ total: 2, disconnected: 1 })).toBe("degraded");
    expect(deriveOperationalState({ total: 2, disconnected: 2 })).toBe("disconnected");
  });
});

import { describe, expect, it } from "vitest";
import {
  ClockAuthorizationError,
  hashClockProof,
  validateClockAuthorization,
  type ClockAuthorizationRecord,
} from "./clock-authorization";

const NOW = new Date("2026-07-21T19:00:00.000Z");
const VALID: ClockAuthorizationRecord = {
  id: "authorization-1",
  proofHash: hashClockProof("proof-value"),
  employeeId: "employee-1",
  deviceId: "device-1",
  allowedAction: "clock_in",
  method: "pin",
  expiresAt: new Date("2026-07-21T19:01:00.000Z"),
  consumedAt: null,
};

const REQUEST = {
  employeeId: "employee-1",
  deviceId: "device-1",
  action: "clock_in" as const,
};

function expectReason(run: () => void, reason: string) {
  try {
    run();
    throw new Error("Expected ClockAuthorizationError");
  } catch (error) {
    expect(error).toBeInstanceOf(ClockAuthorizationError);
    expect((error as ClockAuthorizationError).reason).toBe(reason);
    expect((error as ClockAuthorizationError).externalMessage)
      .toBe("No se pudo autorizar el fichaje");
  }
}

describe("clock authorization proof validation", () => {
  it("accepts a valid, unconsumed and correctly bound proof", () => {
    expect(() => validateClockAuthorization(VALID, REQUEST, NOW)).not.toThrow();
  });

  it("stores a deterministic hash instead of the proof value", () => {
    expect(hashClockProof("proof-value")).not.toBe("proof-value");
    expect(hashClockProof("proof-value")).toHaveLength(64);
  });

  it("rejects proof reuse", () => {
    expectReason(
      () => validateClockAuthorization({ ...VALID, consumedAt: NOW }, REQUEST, NOW),
      "proof_reused",
    );
  });

  it("rejects an expired proof", () => {
    expectReason(
      () => validateClockAuthorization({ ...VALID, expiresAt: NOW }, REQUEST, NOW),
      "proof_expired",
    );
  });

  it("rejects a proof bound to another employee", () => {
    expectReason(
      () => validateClockAuthorization(VALID, { ...REQUEST, employeeId: "employee-2" }, NOW),
      "employee_mismatch",
    );
  });

  it("rejects a proof bound to another device", () => {
    expectReason(
      () => validateClockAuthorization(VALID, { ...REQUEST, deviceId: "device-2" }, NOW),
      "device_mismatch",
    );
  });

  it("rejects a proof bound to another action", () => {
    expectReason(
      () => validateClockAuthorization(VALID, { ...REQUEST, action: "clock_out" }, NOW),
      "action_mismatch",
    );
  });
});

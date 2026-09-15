import { describe, expect, it, vi } from "vitest";
import { resolvePlannedShiftId } from "./planned-shift-link";

describe("planned shift linking", () => {
  it("links one unambiguous published shift", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "shift-1" }] });
    await expect(resolvePlannedShiftId({ execute }, "employee-1", new Date("2027-03-28T01:30:00Z")))
      .resolves.toBe("shift-1");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("fails closed when no shift contains the timestamp", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    await expect(resolvePlannedShiftId({ execute }, "employee-1", new Date()))
      .resolves.toBeNull();
  });

  it("does not guess when overlapping published shifts are ambiguous", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "shift-1" }, { id: "shift-2" }] });
    await expect(resolvePlannedShiftId({ execute }, "employee-1", new Date()))
      .resolves.toBeNull();
  });
});

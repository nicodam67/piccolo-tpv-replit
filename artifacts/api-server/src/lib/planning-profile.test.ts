import { describe, expect, it } from "vitest";
import {
  copyDayToWeek,
  timeWindowMinutes,
  validatePlanningConfiguration,
  weeklyAvailableMinutes,
  type EditableAvailabilityRule,
} from "./planning-profile";

const profile = {
  maxWeeklyMinutes: 2_400,
  minRestMinutes: 720,
  allowsSplitShift: false,
  workingDays: [1, 2, 3, 4, 5],
  preferredWindows: [],
};

describe("planning availability configuration", () => {
  it("supports recurrent availability with multiple windows", () => {
    const rules: EditableAvailabilityRule[] = [
      { type: "AVAILABLE", dayOfWeek: 1, startTime: "12:00", endTime: "16:00" },
      { type: "AVAILABLE", dayOfWeek: 1, startTime: "19:00", endTime: "23:30" },
    ];
    expect(weeklyAvailableMinutes(rules)).toBe(510);
    expect(validatePlanningConfiguration({
      weeklyRules: rules,
      exceptions: [],
      profile,
      contractedWeeklyMinutes: 2_400,
      positionIds: ["waiter"],
    })).toEqual([]);
  });

  it("calculates windows crossing midnight", () => {
    expect(timeWindowMinutes("19:00", "02:00")).toBe(420);
  });

  it("detects overlapping and zero-length windows", () => {
    const issues = validatePlanningConfiguration({
      weeklyRules: [
        { type: "AVAILABLE", dayOfWeek: 1, startTime: "12:00", endTime: "18:00" },
        { type: "AVAILABLE", dayOfWeek: 1, startTime: "17:00", endTime: "20:00" },
        { type: "AVAILABLE", dayOfWeek: 2, startTime: "09:00", endTime: "09:00" },
      ],
      exceptions: [],
      profile,
      contractedWeeklyMinutes: 2_400,
      positionIds: ["waiter"],
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["OVERLAPPING_WINDOWS", "INVALID_WINDOW"]),
    );
  });

  it("copies one configured day to the full week", () => {
    const copied = copyDayToWeek([
      { type: "AVAILABLE", dayOfWeek: 1, startTime: "12:00", endTime: "16:00" },
      { type: "AVAILABLE", dayOfWeek: 1, startTime: "19:00", endTime: "23:30" },
    ], 1);
    expect(copied).toHaveLength(14);
    expect(new Set(copied.map((rule) => rule.dayOfWeek))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  it("detects incompatible limits and missing positions", () => {
    const issues = validatePlanningConfiguration({
      weeklyRules: [],
      exceptions: [],
      profile: { ...profile, maxWeeklyMinutes: 1_800 },
      contractedWeeklyMinutes: 2_400,
      positionIds: [],
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["MAX_BELOW_CONTRACT", "NO_POSITION"]),
    );
  });

  it("rejects contradictory exceptions and unavailable working days", () => {
    const issues = validatePlanningConfiguration({
      weeklyRules: [{ type: "AVAILABLE", dayOfWeek: 0 }],
      exceptions: [
        { type: "UNAVAILABLE", date: "2026-09-20" },
        { type: "AVAILABLE", date: "2026-09-20", startTime: "18:00", endTime: "22:00" },
      ],
      profile,
      contractedWeeklyMinutes: 2_400,
      positionIds: ["waiter"],
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["INCOHERENT_DAY"]),
    );
    expect(issues).toHaveLength(2);
  });
});

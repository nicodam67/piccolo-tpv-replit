import { describe, expect, it } from "vitest";
import {
  canPublish,
  comparePlannedWithClock,
  generateSchedule,
  type PlannedAssignment,
  type PlannerEmployee,
  type StaffingNeed,
  validateAssignment,
  validateSchedule,
} from "./staff-planner";

const need: StaffingNeed = {
  id: "need-waiter",
  date: "2026-09-19",
  startTime: "19:00",
  endTime: "00:00",
  positionId: "waiter",
  positionName: "camarero",
  requiredCount: 1,
};

function employee(overrides: Partial<PlannerEmployee> = {}): PlannerEmployee {
  return {
    id: "employee-a",
    name: "Ana",
    positionIds: ["waiter"],
    contractedWeeklyMinutes: 2_400,
    maxWeeklyMinutes: 2_400,
    minRestMinutes: 720,
    allowsSplitShift: false,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    availability: [],
    absenceDates: [],
    ...overrides,
  };
}

function assignment(overrides: Partial<PlannedAssignment> = {}): PlannedAssignment {
  return {
    id: "shift-a",
    employeeId: "employee-a",
    positionId: "waiter",
    date: "2026-09-19",
    startTime: "19:00",
    endTime: "00:00",
    ...overrides,
  };
}

describe("mandatory planner constraints", () => {
  it("rejects an unavailable employee", () => {
    const candidate = employee({
      availability: [{ type: "UNAVAILABLE", date: need.date, startTime: "18:00", endTime: "23:00" }],
    });
    expect(validateAssignment(candidate, assignment(), [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNAVAILABLE" })]),
    );
  });

  it("rejects approved absence or vacation dates", () => {
    const candidate = employee({ absenceDates: [need.date] });
    expect(validateAssignment(candidate, assignment(), [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ABSENCE" })]),
    );
  });

  it("rejects overlapping shifts", () => {
    const existing = assignment({ id: "existing", startTime: "18:00", endTime: "21:00" });
    expect(validateAssignment(employee(), assignment(), [existing])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "OVERLAP" })]),
    );
  });

  it("rejects an incompatible position", () => {
    expect(validateAssignment(employee({ positionIds: ["kitchen"] }), assignment(), [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INCOMPATIBLE_POSITION" })]),
    );
  });

  it("rejects the configured weekly limit", () => {
    const candidate = employee({ maxWeeklyMinutes: 600 });
    const existing = assignment({
      id: "existing",
      date: "2026-09-18",
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(validateAssignment(candidate, assignment(), [existing])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MAX_HOURS" })]),
    );
  });

  it("uses contracted hours as a preference, not a hard limit", () => {
    const candidate = employee({ contractedWeeklyMinutes: 300, maxWeeklyMinutes: null });
    expect(validateAssignment(candidate, assignment(), [])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MAX_HOURS" })]),
    );
  });

  it("applies the configured limit independently to each week", () => {
    const candidate = employee({ maxWeeklyMinutes: 600 });
    const previousWeek = assignment({
      id: "previous-week",
      date: "2026-09-12",
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(validateAssignment(candidate, assignment(), [previousWeek])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MAX_HOURS" })]),
    );
  });

  it("rejects insufficient rest between days", () => {
    const existing = assignment({
      id: "existing",
      date: "2026-09-18",
      startTime: "20:00",
      endTime: "02:00",
    });
    expect(validateAssignment(employee(), assignment({ startTime: "08:00", endTime: "12:00" }), [existing])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MIN_REST" })]),
    );
  });
});

describe("generation, editing and publication", () => {
  it("explains uncovered staffing needs", () => {
    const result = generateSchedule([], [need]);
    expect(result.assignments).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ code: "UNCOVERED_NEED", requirementId: need.id });
    expect(result.issues[0]?.message).toContain("Falta 1 camarero");
  });

  it("generates the same valid draft deterministically", () => {
    const employees = [employee({ id: "b", name: "Bea" }), employee({ id: "a", name: "Ana" })];
    const first = generateSchedule(employees, [need]);
    const second = generateSchedule(employees, [need]);
    expect(first).toEqual(second);
    expect(first.issues).toEqual([]);
    expect(first.assignments[0]?.employeeId).toBe("a");
  });

  it("does not assign one employee twice to the same staffing need", () => {
    const result = generateSchedule([employee()], [{ ...need, requiredCount: 2 }]);
    const persistedAssignments = result.assignments.map((item, index) => ({ ...item, id: `generated-${index}` }));
    const validationIssues = validateSchedule(
      [employee()],
      [{ ...need, requiredCount: 2 }],
      persistedAssignments,
    );

    expect(validationIssues.filter((issue) => issue.code === "OVERLAP")).toHaveLength(0);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]?.employeeId).toBe("employee-a");
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "UNCOVERED_NEED",
        requirementId: need.id,
        details: expect.objectContaining({ missing: 1 }),
      }),
    ]);
  });

  it("revalidates an incompatible manual edit", () => {
    const edited = assignment({ id: "manual", positionId: "kitchen", origin: "manual" });
    const issues = validateSchedule([employee()], [{ ...need, positionId: "kitchen" }], [edited]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INCOMPATIBLE_POSITION", shiftId: "manual" }),
    ]));
  });

  it("only permits publication without incidents", () => {
    expect(canPublish([])).toBe(true);
    expect(canPublish([{ code: "UNCOVERED_NEED", message: "Falta cobertura" }])).toBe(false);
  });
});

describe("planned shift and time-clock relationship", () => {
  it("calculates planned, actual, late and early minutes", () => {
    const result = comparePlannedWithClock(
      assignment({ startTime: "09:00", endTime: "17:00" }),
      new Date("2026-09-19T09:15:00Z"),
      new Date("2026-09-19T16:45:00Z"),
    );
    expect(result).toEqual({
      plannedMinutes: 480,
      workedMinutes: 450,
      lateMinutes: 15,
      earlyDepartureMinutes: 15,
      excessMinutes: 0,
    });
  });
});

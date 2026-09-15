import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";
import type { PlannedAssignment, PlannerEmployee } from "./staff-planner";
import {
  assertShiftOwner,
  buildProposedAssignments,
  evaluateShiftChange,
  initialShiftChangeStatus,
  nextShiftChangeStatus,
  ShiftChangeError,
  shiftVersionMatches,
  type ShiftSnapshot,
} from "./shift-change";

const original: ShiftSnapshot = {
  id: "shift-a",
  scheduleId: "schedule",
  employeeId: "employee-a",
  positionId: "waiter",
  date: "2026-09-21",
  startTime: "12:00",
  endTime: "17:00",
  origin: "generated",
  updatedAt: "2026-09-15T08:00:00.000Z",
};
const counterpart: ShiftSnapshot = {
  id: "shift-b",
  scheduleId: "schedule",
  employeeId: "employee-b",
  positionId: "waiter",
  date: "2026-09-22",
  startTime: "18:00",
  endTime: "23:00",
  origin: "generated",
  updatedAt: "2026-09-15T08:00:00.000Z",
};

function employee(id: string, overrides: Partial<PlannerEmployee> = {}): PlannerEmployee {
  return {
    id,
    name: id,
    positionIds: ["waiter"],
    contractedWeeklyMinutes: 2_400,
    maxWeeklyMinutes: 2_400,
    minRestMinutes: 720,
    allowsSplitShift: true,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    availability: [],
    absenceDates: [],
    ...overrides,
  };
}

function evaluate(overrides: {
  recipient?: PlannerEmployee;
  assignments?: PlannedAssignment[];
  original?: ShiftSnapshot;
  proposal?: { employeeId?: string; date?: string; startTime?: string; endTime?: string };
} = {}) {
  const recipient = overrides.recipient ?? employee("employee-b");
  return evaluateShiftChange({
    type: "TRANSFER",
    requesterId: "employee-a",
    recipientId: recipient.id,
    original: overrides.original ?? original,
    proposal: overrides.proposal,
    employees: [employee("employee-a"), recipient],
    assignments: overrides.assignments ?? [original],
  });
}

describe("shift-change state machine and authorization", () => {
  it("creates a valid employee-directed request in PENDING_RECIPIENT", () => {
    expect(initialShiftChangeStatus("employee-b")).toBe("PENDING_RECIPIENT");
    expect(evaluate().issues).toEqual([]);
  });

  it("sends an open or time request directly to the manager", () => {
    expect(initialShiftChangeStatus(null)).toBe("PENDING_MANAGER");
  });

  it("blocks an employee changing another employee's shift", () => {
    expect(() => assertShiftOwner("employee-b", original)).toThrowError(
      expect.objectContaining({ code: "FOREIGN_SHIFT" }),
    );
  });

  it("moves acceptance to manager review without applying the shift", () => {
    expect(nextShiftChangeStatus("PENDING_RECIPIENT", "ACCEPT")).toBe("PENDING_MANAGER");
  });

  it("supports recipient rejection", () => {
    expect(nextShiftChangeStatus("PENDING_RECIPIENT", "REJECT_RECIPIENT")).toBe("REJECTED_BY_RECIPIENT");
  });

  it("supports requester cancellation while pending", () => {
    expect(nextShiftChangeStatus("PENDING_MANAGER", "CANCEL")).toBe("CANCELLED");
  });

  it("supports explicit manager approval", () => {
    expect(nextShiftChangeStatus("PENDING_MANAGER", "APPROVE")).toBe("APPROVED");
  });

  it("blocks double approval", () => {
    expect(() => nextShiftChangeStatus("APPROVED", "APPROVE")).toThrowError(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });

  it("expires either pending state and releases it from the active workflow", () => {
    expect(nextShiftChangeStatus("PENDING_RECIPIENT", "EXPIRE")).toBe("EXPIRED");
    expect(nextShiftChangeStatus("PENDING_MANAGER", "EXPIRE")).toBe("EXPIRED");
  });

  it("does not grant approval permission to employees", () => {
    expect(hasPermission("waiter", "shift_changes.manage")).toBe(false);
    expect(hasPermission("manager", "shift_changes.manage")).toBe(true);
  });

  it("detects a turn modified after request creation", () => {
    expect(shiftVersionMatches(original, { ...original, startTime: "13:00" })).toBe(false);
    expect(shiftVersionMatches(original, { ...original, scheduleId: "other-schedule" })).toBe(false);
  });
});

describe("mandatory revalidation before shift changes", () => {
  it("rejects an employee incompatible with the position", () => {
    expect(evaluate({ recipient: employee("employee-b", { positionIds: ["kitchen"] }) }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "INCOMPATIBLE_POSITION" })]));
  });

  it("rejects vacation or approved absence", () => {
    expect(evaluate({ recipient: employee("employee-b", { absenceDates: [original.date] }) }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "ABSENCE" })]));
  });

  it("rejects explicit unavailability", () => {
    expect(evaluate({ recipient: employee("employee-b", {
      availability: [{ type: "UNAVAILABLE", date: original.date }],
    }) }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAVAILABLE" })]));
  });

  it("rejects overlapping recipient shifts", () => {
    const overlap = { ...original, id: "existing", employeeId: "employee-b", startTime: "11:00", endTime: "13:00" };
    expect(evaluate({ assignments: [original, overlap] }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "OVERLAP" })]));
  });

  it("rejects insufficient rest", () => {
    const morning = { ...original, startTime: "08:00", endTime: "12:00" };
    const previous = { ...counterpart, id: "previous", date: "2026-09-20", employeeId: "employee-b", startTime: "20:00", endTime: "02:00" };
    expect(evaluate({ original: morning, assignments: [morning, previous] }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "MIN_REST" })]));
  });

  it("rejects excess weekly hours", () => {
    const existing = { ...counterpart, id: "existing", employeeId: "employee-b", startTime: "08:00", endTime: "16:00" };
    expect(evaluate({
      recipient: employee("employee-b", { maxWeeklyMinutes: 600 }),
      assignments: [original, existing],
    }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MAX_HOURS" })]));
  });

  it("rejects disallowed split shifts and working days", () => {
    const existing = { ...original, id: "existing", employeeId: "employee-b", startTime: "08:00", endTime: "10:00" };
    const result = evaluate({
      recipient: employee("employee-b", { allowsSplitShift: false, workingDays: [2] }),
      assignments: [original, existing],
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPLIT_SHIFT" }),
      expect.objectContaining({ code: "WORKING_DAY" }),
    ]));
  });

  it("builds a two-sided swap without mutating either snapshot", () => {
    const beforeOriginal = structuredClone(original);
    const beforeCounterpart = structuredClone(counterpart);
    const proposed = buildProposedAssignments({
      type: "SWAP",
      requesterId: "employee-a",
      recipientId: "employee-b",
      original,
      counterpart,
    });
    expect(proposed.map((shift) => shift.employeeId)).toEqual(["employee-b", "employee-a"]);
    expect(original).toEqual(beforeOriginal);
    expect(counterpart).toEqual(beforeCounterpart);
  });

  it("leaves source assignments unchanged when validation blocks application", () => {
    const assignments = [structuredClone(original)];
    const before = structuredClone(assignments);
    const result = evaluate({
      recipient: employee("employee-b", { absenceDates: [original.date] }),
      assignments,
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(assignments).toEqual(before);
  });
});

describe("error contract", () => {
  it("uses auditable domain error codes", () => {
    const error = new ShiftChangeError("SHIFT_LOCKED", "locked");
    expect(error.code).toBe("SHIFT_LOCKED");
  });
});

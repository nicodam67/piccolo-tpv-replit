import {
  assignmentMinutes,
  type PlannedAssignment,
  type PlannerEmployee,
  type PlannerIssue,
  validateAssignment,
} from "./staff-planner";

export const SHIFT_CHANGE_TYPES = ["SWAP", "TRANSFER", "TIME_CHANGE", "OPEN_REQUEST"] as const;
export type ShiftChangeType = typeof SHIFT_CHANGE_TYPES[number];

export const SHIFT_CHANGE_STATUSES = [
  "PENDING_RECIPIENT",
  "PENDING_MANAGER",
  "REJECTED_BY_RECIPIENT",
  "REJECTED_BY_MANAGER",
  "APPROVED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type ShiftChangeStatus = typeof SHIFT_CHANGE_STATUSES[number];

export type ShiftChangeAction =
  | "ACCEPT"
  | "REJECT_RECIPIENT"
  | "REJECT_MANAGER"
  | "CANCEL"
  | "APPROVE"
  | "EXPIRE";

export interface ShiftSnapshot extends PlannedAssignment {
  id: string;
  updatedAt: string;
  scheduleId: string;
}

export interface ShiftChangeProposal {
  employeeId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface ShiftChangeEvaluation {
  assignments: PlannedAssignment[];
  issues: PlannerIssue[];
  impactMinutes: Record<string, { before: number; after: number; difference: number }>;
}

export class ShiftChangeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function initialShiftChangeStatus(recipientId?: string | null): ShiftChangeStatus {
  return recipientId ? "PENDING_RECIPIENT" : "PENDING_MANAGER";
}

export function assertShiftOwner(actorId: string, shift: ShiftSnapshot): void {
  if (shift.employeeId !== actorId) {
    throw new ShiftChangeError("FOREIGN_SHIFT", "Solo puedes solicitar cambios sobre tus propios turnos.");
  }
}

export function nextShiftChangeStatus(
  status: ShiftChangeStatus,
  action: ShiftChangeAction,
): ShiftChangeStatus {
  const transitions: Partial<Record<ShiftChangeStatus, Partial<Record<ShiftChangeAction, ShiftChangeStatus>>>> = {
    PENDING_RECIPIENT: {
      ACCEPT: "PENDING_MANAGER",
      REJECT_RECIPIENT: "REJECTED_BY_RECIPIENT",
      CANCEL: "CANCELLED",
      EXPIRE: "EXPIRED",
    },
    PENDING_MANAGER: {
      APPROVE: "APPROVED",
      REJECT_MANAGER: "REJECTED_BY_MANAGER",
      CANCEL: "CANCELLED",
      EXPIRE: "EXPIRED",
    },
  };
  const next = transitions[status]?.[action];
  if (!next) {
    throw new ShiftChangeError("INVALID_TRANSITION", `No se puede ejecutar ${action} desde ${status}.`);
  }
  return next;
}

export function shiftVersionMatches(snapshot: ShiftSnapshot, current: ShiftSnapshot): boolean {
  return snapshot.id === current.id
    && new Date(snapshot.updatedAt).getTime() === new Date(current.updatedAt).getTime()
    && snapshot.employeeId === current.employeeId
    && snapshot.date === current.date
    && snapshot.startTime === current.startTime
    && snapshot.endTime === current.endTime
    && snapshot.positionId === current.positionId;
}

export function buildProposedAssignments(input: {
  type: ShiftChangeType;
  requesterId: string;
  recipientId?: string | null;
  original: ShiftSnapshot;
  counterpart?: ShiftSnapshot | null;
  proposal?: ShiftChangeProposal;
}): PlannedAssignment[] {
  const { type, requesterId, recipientId, original, counterpart, proposal = {} } = input;
  if (type === "SWAP") {
    if (!recipientId || !counterpart) {
      throw new ShiftChangeError("MISSING_COUNTERPART", "El intercambio requiere empleado y turno receptor.");
    }
    return [
      { ...original, employeeId: recipientId },
      { ...counterpart, employeeId: requesterId },
    ];
  }
  if (type === "TRANSFER") {
    if (!recipientId) throw new ShiftChangeError("MISSING_RECIPIENT", "La cesión requiere un empleado receptor.");
    return [{ ...original, employeeId: recipientId }];
  }
  return [{
    ...original,
    employeeId: proposal.employeeId ?? original.employeeId,
    date: proposal.date ?? original.date,
    startTime: proposal.startTime ?? original.startTime,
    endTime: proposal.endTime ?? original.endTime,
  }];
}

function sumByEmployee(assignments: PlannedAssignment[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const assignment of assignments) {
    totals.set(
      assignment.employeeId,
      (totals.get(assignment.employeeId) ?? 0) + assignmentMinutes(assignment),
    );
  }
  return totals;
}

export function evaluateShiftChange(input: {
  type: ShiftChangeType;
  requesterId: string;
  recipientId?: string | null;
  original: ShiftSnapshot;
  counterpart?: ShiftSnapshot | null;
  proposal?: ShiftChangeProposal;
  employees: PlannerEmployee[];
  assignments: PlannedAssignment[];
}): ShiftChangeEvaluation {
  const proposed = buildProposedAssignments(input);
  const changedIds = new Set(proposed.map((assignment) => assignment.id));
  const finalAssignments = [
    ...input.assignments.filter((assignment) => !changedIds.has(assignment.id)),
    ...proposed,
  ];
  const employees = new Map(input.employees.map((employee) => [employee.id, employee]));
  const issues = proposed.flatMap((assignment) => {
    const employee = employees.get(assignment.employeeId);
    if (!employee) {
      return [{
        code: "UNAVAILABLE" as const,
        employeeId: assignment.employeeId,
        shiftId: assignment.id,
        message: "El empleado propuesto no está activo o no puede gestionarse en este centro.",
      }];
    }
    return validateAssignment(employee, assignment, finalAssignments);
  });

  const beforeTotals = sumByEmployee(input.assignments);
  const afterTotals = sumByEmployee(finalAssignments);
  const impacted = new Set([
    input.original.employeeId,
    input.counterpart?.employeeId,
    ...proposed.map((assignment) => assignment.employeeId),
  ].filter((id): id is string => Boolean(id)));
  const impactMinutes: ShiftChangeEvaluation["impactMinutes"] = {};
  for (const employeeId of impacted) {
    const before = beforeTotals.get(employeeId) ?? 0;
    const after = afterTotals.get(employeeId) ?? 0;
    impactMinutes[employeeId] = { before, after, difference: after - before };
  }
  return { assignments: proposed, issues, impactMinutes };
}

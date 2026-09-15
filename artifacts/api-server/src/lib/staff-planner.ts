export type AvailabilityType = "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";

export interface AvailabilityRule {
  type: AvailabilityType;
  date?: string | null;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface PlannerEmployee {
  id: string;
  name: string;
  positionIds: string[];
  contractedWeeklyMinutes?: number | null;
  maxWeeklyMinutes?: number | null;
  minRestMinutes: number;
  allowsSplitShift: boolean;
  workingDays: number[];
  availability: AvailabilityRule[];
  absenceDates: string[];
  preferredWindows?: AvailabilityRule[];
}

export interface StaffingNeed {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  positionName: string;
  requiredCount: number;
}

export interface PlannedAssignment {
  id?: string;
  employeeId: string;
  employeeName?: string;
  requirementId?: string;
  positionId: string;
  date: string;
  startTime: string;
  endTime: string;
  origin?: "generated" | "manual";
}

export type PlannerIssueCode =
  | "UNAVAILABLE"
  | "ABSENCE"
  | "OVERLAP"
  | "MIN_REST"
  | "MAX_HOURS"
  | "INCOMPATIBLE_POSITION"
  | "WORKING_DAY"
  | "SPLIT_SHIFT"
  | "UNCOVERED_NEED";

export interface PlannerIssue {
  code: PlannerIssueCode;
  message: string;
  employeeId?: string;
  requirementId?: string;
  shiftId?: string;
  details?: Record<string, unknown>;
}

export interface GenerationResult {
  assignments: PlannedAssignment[];
  issues: PlannerIssue[];
}

function utcDay(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weekKey(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function bounds(date: string, startTime: string, endTime: string): [number, number] {
  const base = Date.parse(`${date}T00:00:00Z`);
  const start = base + minutes(startTime) * 60_000;
  let end = base + minutes(endTime) * 60_000;
  if (end <= start) end += 24 * 60 * 60_000;
  return [start, end];
}

export function assignmentMinutes(assignment: Pick<PlannedAssignment, "date" | "startTime" | "endTime">): number {
  const [start, end] = bounds(assignment.date, assignment.startTime, assignment.endTime);
  return (end - start) / 60_000;
}

export function expandDateRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  for (
    let date = new Date(`${dateFrom}T12:00:00Z`);
    date <= new Date(`${dateTo}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function overlaps(
  a: Pick<PlannedAssignment, "date" | "startTime" | "endTime">,
  b: Pick<PlannedAssignment, "date" | "startTime" | "endTime">,
): boolean {
  const [aStart, aEnd] = bounds(a.date, a.startTime, a.endTime);
  const [bStart, bEnd] = bounds(b.date, b.startTime, b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function ruleMatchesDate(rule: AvailabilityRule, date: string): boolean {
  if (rule.date && rule.date !== date) return false;
  if (rule.dayOfWeek != null && rule.dayOfWeek !== utcDay(date)) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  return Boolean(rule.date || rule.dayOfWeek != null);
}

function ruleOverlaps(rule: AvailabilityRule, assignment: PlannedAssignment): boolean {
  if (!rule.startTime || !rule.endTime) return true;
  return overlaps(
    assignment,
    { date: assignment.date, startTime: rule.startTime, endTime: rule.endTime },
  );
}

function ruleContains(rule: AvailabilityRule, assignment: PlannedAssignment): boolean {
  if (!rule.startTime || !rule.endTime) return true;
  const [ruleStart, ruleEnd] = bounds(assignment.date, rule.startTime, rule.endTime);
  const [shiftStart, shiftEnd] = bounds(assignment.date, assignment.startTime, assignment.endTime);
  return ruleStart <= shiftStart && ruleEnd >= shiftEnd;
}

export function validateAssignment(
  employee: PlannerEmployee,
  assignment: PlannedAssignment,
  assignments: PlannedAssignment[],
): PlannerIssue[] {
  const issues: PlannerIssue[] = [];
  const ownAssignments = assignments.filter(
    (item) => item.employeeId === employee.id
      && item !== assignment
      && (assignment.id === undefined || item.id !== assignment.id),
  );

  if (!employee.positionIds.includes(assignment.positionId)) {
    issues.push({
      code: "INCOMPATIBLE_POSITION",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} no está habilitado para el puesto solicitado.`,
    });
  }
  if (!employee.workingDays.includes(utcDay(assignment.date))) {
    issues.push({
      code: "WORKING_DAY",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} no puede trabajar ese día de la semana.`,
    });
  }
  if (employee.absenceDates.includes(assignment.date)) {
    issues.push({
      code: "ABSENCE",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} tiene vacaciones o una ausencia aprobada.`,
    });
  }

  const dateRules = employee.availability.filter((rule) => ruleMatchesDate(rule, assignment.date));
  const unavailable = dateRules.some(
    (rule) => rule.type === "UNAVAILABLE" && ruleOverlaps(rule, assignment),
  );
  const availableRules = dateRules.filter((rule) => rule.type === "AVAILABLE");
  if (unavailable || (availableRules.length > 0 && !availableRules.some((rule) => ruleContains(rule, assignment)))) {
    issues.push({
      code: "UNAVAILABLE",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} no está disponible en esa franja.`,
    });
  }

  if (ownAssignments.some((item) => overlaps(item, assignment))) {
    issues.push({
      code: "OVERLAP",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `Asignación imposible para ${employee.name} por solapamiento.`,
    });
  }

  const [start, end] = bounds(assignment.date, assignment.startTime, assignment.endTime);
  for (const existing of ownAssignments) {
    if (existing.date === assignment.date) continue;
    const [existingStart, existingEnd] = bounds(existing.date, existing.startTime, existing.endTime);
    const rest = start >= existingEnd
      ? (start - existingEnd) / 60_000
      : existingStart >= end
        ? (existingStart - end) / 60_000
        : Number.POSITIVE_INFINITY;
    if (rest < employee.minRestMinutes) {
      issues.push({
        code: "MIN_REST",
        employeeId: employee.id,
        shiftId: assignment.id,
        message: `${employee.name} no cumple el descanso mínimo de ${employee.minRestMinutes} minutos.`,
      });
      break;
    }
  }

  const sameDay = ownAssignments.filter((item) => item.date === assignment.date);
  if (!employee.allowsSplitShift && sameDay.length > 0 && !sameDay.some((item) => overlaps(item, assignment))) {
    issues.push({
      code: "SPLIT_SHIFT",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} no admite turno partido.`,
    });
  }

  const sameWeekAssignments = ownAssignments.filter((item) => weekKey(item.date) === weekKey(assignment.date));
  const totalMinutes = sameWeekAssignments.reduce((total, item) => total + assignmentMinutes(item), 0)
    + assignmentMinutes(assignment);
  const limit = employee.maxWeeklyMinutes;
  if (limit != null && totalMinutes > limit) {
    issues.push({
      code: "MAX_HOURS",
      employeeId: employee.id,
      shiftId: assignment.id,
      message: `${employee.name} supera el límite de horas configurado.`,
      details: { assignedMinutes: totalMinutes, limitMinutes: limit },
    });
  }
  return issues;
}

function preferenceScore(
  employee: PlannerEmployee,
  assignment: PlannedAssignment,
  assignments: PlannedAssignment[],
): number[] {
  const own = assignments.filter((item) => item.employeeId === employee.id);
  const assigned = own.reduce((total, item) => total + assignmentMinutes(item), 0);
  const target = employee.contractedWeeklyMinutes ?? employee.maxWeeklyMinutes ?? 0;
  const preferred = [...employee.availability, ...(employee.preferredWindows ?? [])]
    .some((rule) => rule.type === "PREFERRED" && ruleMatchesDate(rule, assignment.date) && ruleContains(rule, assignment));
  const weekendCount = own.filter((item) => [0, 6].includes(utcDay(item.date))).length;
  const splitCount = own.filter((item) => item.date === assignment.date).length;
  const openingCount = own.filter((item) => minutes(item.startTime) < 10 * 60).length;
  const closingCount = own.filter((item) => minutes(item.endTime) < minutes(item.startTime) || minutes(item.endTime) >= 23 * 60).length;
  return [
    preferred ? 0 : 1,
    Math.abs(target - (assigned + assignmentMinutes(assignment))),
    [0, 6].includes(utcDay(assignment.date)) ? weekendCount : 0,
    splitCount,
    minutes(assignment.startTime) < 10 * 60 ? openingCount : 0,
    minutes(assignment.endTime) < minutes(assignment.startTime) || minutes(assignment.endTime) >= 23 * 60 ? closingCount : 0,
  ];
}

function compareScores(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function generateSchedule(
  employees: PlannerEmployee[],
  needs: StaffingNeed[],
  existingAssignments: PlannedAssignment[] = [],
): GenerationResult {
  const assignments = [...existingAssignments];
  const issues: PlannerIssue[] = [];
  const sortedNeeds = [...needs].sort((a, b) =>
    `${a.date}-${a.startTime}-${a.positionId}-${a.id}`.localeCompare(
      `${b.date}-${b.startTime}-${b.positionId}-${b.id}`,
    ),
  );

  for (const need of sortedNeeds) {
    let covered = assignments.filter((item) =>
      item.requirementId === need.id
      || (item.positionId === need.positionId
        && item.date === need.date
        && item.startTime === need.startTime
        && item.endTime === need.endTime),
    ).length;
    while (covered < need.requiredCount) {
      const proposed = (employee: PlannerEmployee): PlannedAssignment => ({
        employeeId: employee.id,
        employeeName: employee.name,
        requirementId: need.id,
        positionId: need.positionId,
        date: need.date,
        startTime: need.startTime,
        endTime: need.endTime,
        origin: "generated",
      });
      const candidates = employees
        .map((employee) => ({ employee, assignment: proposed(employee) }))
        .filter(({ employee, assignment }) => validateAssignment(employee, assignment, assignments).length === 0)
        .sort((a, b) =>
          compareScores(
            preferenceScore(a.employee, a.assignment, assignments),
            preferenceScore(b.employee, b.assignment, assignments),
          ) || a.employee.id.localeCompare(b.employee.id),
        );
      const selected = candidates[0];
      if (!selected) break;
      assignments.push(selected.assignment);
      covered++;
    }
    if (covered < need.requiredCount) {
      const missing = need.requiredCount - covered;
      issues.push({
        code: "UNCOVERED_NEED",
        requirementId: need.id,
        message: `Falta${missing > 1 ? "n" : ""} ${missing} ${need.positionName} el ${need.date} ${need.startTime}–${need.endTime}.`,
        details: { missing, positionId: need.positionId },
      });
    }
  }
  return { assignments, issues };
}

export function validateSchedule(
  employees: PlannerEmployee[],
  needs: StaffingNeed[],
  assignments: PlannedAssignment[],
  constraintAssignments: PlannedAssignment[] = assignments,
): PlannerIssue[] {
  const byEmployee = new Map(employees.map((employee) => [employee.id, employee]));
  const issues = assignments.flatMap((assignment) => {
    const employee = byEmployee.get(assignment.employeeId);
    return employee
      ? validateAssignment(employee, assignment, constraintAssignments)
      : [{
          code: "UNAVAILABLE" as const,
          employeeId: assignment.employeeId,
          shiftId: assignment.id,
          message: "El empleado asignado ya no está disponible.",
        }];
  });
  const coverage = generateSchedule([], needs, assignments).issues;
  return [...issues, ...coverage];
}

export function canPublish(issues: PlannerIssue[]): boolean {
  return issues.length === 0;
}

export interface ClockComparison {
  plannedMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  excessMinutes: number;
}

export function comparePlannedWithClock(
  assignment: PlannedAssignment,
  clockIn: Date,
  clockOut: Date,
): ClockComparison {
  const [plannedStart, plannedEnd] = bounds(assignment.date, assignment.startTime, assignment.endTime);
  const workedMinutes = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / 60_000);
  const plannedMinutes = assignmentMinutes(assignment);
  return {
    plannedMinutes,
    workedMinutes,
    lateMinutes: Math.max(0, Math.round((clockIn.getTime() - plannedStart) / 60_000)),
    earlyDepartureMinutes: Math.max(0, Math.round((plannedEnd - clockOut.getTime()) / 60_000)),
    excessMinutes: Math.max(0, Math.round(workedMinutes - plannedMinutes)),
  };
}

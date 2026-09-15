import type { AvailabilityRule, AvailabilityType } from "./staff-planner";

export interface EditableAvailabilityRule extends AvailabilityRule {
  type: AvailabilityType;
  reason?: string | null;
}

export interface PlanningProfileInput {
  maxWeeklyMinutes?: number | null;
  minRestMinutes: number;
  allowsSplitShift: boolean;
  workingDays: number[];
  preferredWindows: EditableAvailabilityRule[];
}

export interface PlanningConfigurationIssue {
  code: "INVALID_WINDOW" | "OVERLAPPING_WINDOWS" | "INCOHERENT_DAY" | "MAX_BELOW_CONTRACT" | "NO_POSITION";
  path: string;
  message: string;
}

export function timeWindowMinutes(startTime?: string | null, endTime?: string | null): number {
  if (!startTime && !endTime) return 1_440;
  if (!startTime || !endTime || startTime === endTime) return 0;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const start = startHours * 60 + startMinutes;
  let end = endHours * 60 + endMinutes;
  if (end <= start) end += 1_440;
  return end - start;
}

function overlaps(a: EditableAvailabilityRule, b: EditableAvailabilityRule): boolean {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return true;
  const toBounds = (rule: EditableAvailabilityRule): [number, number] => {
    const [startHours, startMinutes] = rule.startTime!.split(":").map(Number);
    const [endHours, endMinutes] = rule.endTime!.split(":").map(Number);
    const start = startHours * 60 + startMinutes;
    let end = endHours * 60 + endMinutes;
    if (end <= start) end += 1_440;
    return [start, end];
  };
  const [aStart, aEnd] = toBounds(a);
  const [bStart, bEnd] = toBounds(b);
  return aStart < bEnd && bStart < aEnd;
}

export function weeklyAvailableMinutes(rules: EditableAvailabilityRule[]): number {
  return rules
    .filter((rule) => rule.dayOfWeek != null && rule.type === "AVAILABLE")
    .reduce((total, rule) => total + timeWindowMinutes(rule.startTime, rule.endTime), 0);
}

export function copyDayToWeek(
  rules: EditableAvailabilityRule[],
  sourceDay: number,
): EditableAvailabilityRule[] {
  const source = rules.filter((rule) => rule.dayOfWeek === sourceDay);
  return Array.from({ length: 7 }, (_, dayOfWeek) =>
    source.map((rule) => ({ ...rule, dayOfWeek })),
  ).flat();
}

export function validatePlanningConfiguration(input: {
  weeklyRules: EditableAvailabilityRule[];
  exceptions: EditableAvailabilityRule[];
  profile: PlanningProfileInput;
  contractedWeeklyMinutes?: number | null;
  positionIds: string[];
}): PlanningConfigurationIssue[] {
  const issues: PlanningConfigurationIssue[] = [];
  const allRules = [...input.weeklyRules, ...input.exceptions, ...input.profile.preferredWindows];
  allRules.forEach((rule, index) => {
    if ((rule.startTime && !rule.endTime)
      || (!rule.startTime && rule.endTime)
      || (rule.startTime && rule.startTime === rule.endTime)) {
      issues.push({
        code: "INVALID_WINDOW",
        path: `rules.${index}`,
        message: "La hora de inicio y fin deben ser distintas; usa “todo el día” para 24 horas.",
      });
    }
  });

  for (let day = 0; day < 7; day++) {
    const rules = input.weeklyRules.filter((rule) => rule.dayOfWeek === day);
    const fullDayUnavailable = rules.some((rule) =>
      rule.type === "UNAVAILABLE" && !rule.startTime && !rule.endTime,
    );
    if (fullDayUnavailable && rules.length > 1) {
      issues.push({
        code: "INCOHERENT_DAY",
        path: `weeklyRules.${day}`,
        message: "Un día no disponible no puede contener otras franjas.",
      });
    }
    const available = rules.filter((rule) => rule.type === "AVAILABLE");
    if (available.length > 0 && !input.profile.workingDays.includes(day)) {
      issues.push({
        code: "INCOHERENT_DAY",
        path: `weeklyRules.${day}`,
        message: "Hay disponibilidad en un día no permitido como laborable.",
      });
    }
    for (let left = 0; left < available.length; left++) {
      for (let right = left + 1; right < available.length; right++) {
        if (overlaps(available[left]!, available[right]!)) {
          issues.push({
            code: "OVERLAPPING_WINDOWS",
            path: `weeklyRules.${day}`,
            message: "Hay franjas disponibles solapadas en el mismo día.",
          });
        }
      }
    }
  }

  const exceptionGroups = new Map<string, EditableAvailabilityRule[]>();
  for (const exception of input.exceptions) {
    const key = exception.date ?? `${exception.validFrom ?? ""}:${exception.validTo ?? ""}`;
    exceptionGroups.set(key, [...(exceptionGroups.get(key) ?? []), exception]);
  }
  for (const [key, rules] of exceptionGroups) {
    const fullUnavailable = rules.some((rule) =>
      rule.type === "UNAVAILABLE" && !rule.startTime && !rule.endTime,
    );
    if (fullUnavailable && rules.length > 1) {
      issues.push({
        code: "INCOHERENT_DAY",
        path: `exceptions.${key}`,
        message: "Una excepción no disponible todo el día no puede combinarse con otras franjas.",
      });
    }
    const available = rules.filter((rule) => rule.type === "AVAILABLE");
    for (let left = 0; left < available.length; left++) {
      for (let right = left + 1; right < available.length; right++) {
        if (overlaps(available[left]!, available[right]!)) {
          issues.push({
            code: "OVERLAPPING_WINDOWS",
            path: `exceptions.${key}`,
            message: "Hay franjas excepcionales disponibles solapadas.",
          });
        }
      }
    }
  }

  if (input.profile.maxWeeklyMinutes != null
    && input.contractedWeeklyMinutes != null
    && input.profile.maxWeeklyMinutes < input.contractedWeeklyMinutes) {
    issues.push({
      code: "MAX_BELOW_CONTRACT",
      path: "profile.maxWeeklyMinutes",
      message: "El máximo semanal no puede ser inferior a las horas contratadas.",
    });
  }
  if (input.positionIds.length === 0) {
    issues.push({
      code: "NO_POSITION",
      path: "positionIds",
      message: "El empleado necesita al menos un puesto compatible.",
    });
  }
  return issues;
}

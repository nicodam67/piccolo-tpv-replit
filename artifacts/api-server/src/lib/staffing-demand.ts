export type HistoricalMetric = "TICKETS" | "REVENUE" | "GUESTS" | "UNITS";
export type ThresholdRounding = "PER_STARTED_BLOCK" | "PER_COMPLETE_BLOCK" | "ON_THRESHOLD";

export interface StaffingDemandRuleInput {
  id: string;
  ruleGroupId: string;
  version: number;
  name: string;
  workCenterId: string;
  positionId: string;
  departmentId?: string | null;
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
  validFrom?: string | null;
  validTo?: string | null;
  baseCount: number;
  historicalWeeks: number;
  minimumComparableWeeks: number;
  historicalMetric?: HistoricalMetric | null;
  historicalThreshold?: number | null;
  historicalIncrement?: number | null;
  historicalRounding?: ThresholdRounding | null;
  reservationGuestThreshold?: number | null;
  reservationIncrement?: number | null;
  reservationRounding?: ThresholdRounding | null;
  categoryId?: string | null;
  prepZone?: string | null;
}

export interface HistoricalDemandObservation {
  ticketId: string;
  date: string;
  time: string;
  revenue: number;
  guests: number;
  units: number;
  unitsByCategory: Record<string, number>;
  unitsByPrepZone: Record<string, number>;
}

export interface FutureReservationDemand {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
  guests: number;
  status: string;
}

export interface StaffingNeedRecommendation {
  requirementDate: string;
  startTime: string;
  endTime: string;
  positionId: string;
  suggestedCount: number;
  historicalValue: number | null;
  reservationGuests: number;
  comparableWeeks: number;
  explanation: {
    base: number;
    historical: {
      enabled: boolean;
      metric: HistoricalMetric | null;
      average: number | null;
      addition: number;
      comparableWeeks: number;
      requestedWeeks: number;
      minimumWeeks: number;
      sufficientData: boolean;
      message: string;
    };
    reservations: {
      enabled: boolean;
      guests: number;
      reservationCount: number;
      addition: number;
    };
    result: number;
  };
  inputSnapshot: {
    comparableDates: string[];
    reservationIds: string[];
    historicalTicketIds: string[];
  };
  ruleSnapshot: StaffingDemandRuleInput;
}

const ACTIVE_RESERVATION_STATUSES = new Set([
  "pendiente",
  "confirmada",
  "recordatorio_enviado",
  "cliente_avisado",
  "cliente_llegado",
  "sentada",
  "en_espera",
]);

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timeMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeInWindow(time: string, startTime: string, endTime: string): boolean {
  const value = timeMinutes(time);
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);
  return end > start ? value >= start && value < end : value >= start || value < end;
}

function reservationOverlapsWindow(
  reservation: FutureReservationDemand,
  startTime: string,
  endTime: string,
): boolean {
  const reservationStart = timeMinutes(reservation.time);
  const reservationEnd = reservationStart + reservation.durationMinutes;
  const windowStart = timeMinutes(startTime);
  let windowEnd = timeMinutes(endTime);
  if (windowEnd <= windowStart) windowEnd += 1_440;
  return [
    [reservationStart, reservationEnd],
    [reservationStart + 1_440, reservationEnd + 1_440],
  ].some(([start, end]) => start < windowEnd && windowStart < end);
}

export function thresholdAddition(
  value: number,
  threshold: number,
  increment: number,
  rounding: ThresholdRounding,
): number {
  if (value <= 0) return 0;
  if (rounding === "PER_STARTED_BLOCK") return Math.ceil(value / threshold) * increment;
  if (rounding === "PER_COMPLETE_BLOCK") return Math.floor(value / threshold) * increment;
  return value > threshold ? increment : 0;
}

function metricValue(
  observation: HistoricalDemandObservation,
  rule: StaffingDemandRuleInput,
): number {
  switch (rule.historicalMetric) {
    case "TICKETS": return 1;
    case "REVENUE": return observation.revenue;
    case "GUESTS": return observation.guests;
    case "UNITS":
      if (rule.categoryId) return observation.unitsByCategory[rule.categoryId] ?? 0;
      if (rule.prepZone) return observation.unitsByPrepZone[rule.prepZone] ?? 0;
      return observation.units;
    default: return 0;
  }
}

function ruleApplies(rule: StaffingDemandRuleInput, date: string): boolean {
  if (rule.dayOfWeek != null && rule.dayOfWeek !== dayOfWeek(date)) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  return true;
}

export function calculateStaffingNeeds(input: {
  dates: string[];
  rules: StaffingDemandRuleInput[];
  observations: HistoricalDemandObservation[];
  reservations: FutureReservationDemand[];
  historicalWeeksOverride?: number | null;
}): StaffingNeedRecommendation[] {
  const activeHistoricalDates = new Set(input.observations.map((observation) => observation.date));
  const recommendations: StaffingNeedRecommendation[] = [];

  for (const date of [...input.dates].sort()) {
    for (const rule of [...input.rules].sort((left, right) =>
      `${left.startTime}:${left.positionId}:${left.id}`.localeCompare(`${right.startTime}:${right.positionId}:${right.id}`),
    )) {
      if (!ruleApplies(rule, date)) continue;
      const requestedWeeks = input.historicalWeeksOverride ?? rule.historicalWeeks;
      const requestedComparableDates = Array.from({ length: requestedWeeks }, (_, index) =>
        addDays(date, -7 * (index + 1)),
      );
      const comparableDates = requestedComparableDates.filter((candidate) => activeHistoricalDates.has(candidate));
      const matchingObservations = input.observations.filter((observation) =>
        comparableDates.includes(observation.date)
        && timeInWindow(observation.time, rule.startTime, rule.endTime),
      );
      const historicalValues = comparableDates.map((candidate) =>
        matchingObservations
          .filter((observation) => observation.date === candidate)
          .reduce((total, observation) => total + metricValue(observation, rule), 0),
      );
      const sufficientData = comparableDates.length >= rule.minimumComparableWeeks;
      const historicalAverage = sufficientData && historicalValues.length > 0
        ? historicalValues.reduce((sum, value) => sum + value, 0) / historicalValues.length
        : null;
      const historicalEnabled = Boolean(
        rule.historicalMetric
        && rule.historicalThreshold
        && rule.historicalIncrement
        && rule.historicalRounding,
      );
      const historicalAddition = historicalEnabled && historicalAverage != null
        ? thresholdAddition(
            historicalAverage,
            rule.historicalThreshold!,
            rule.historicalIncrement!,
            rule.historicalRounding!,
          )
        : 0;

      const matchingReservations = input.reservations.filter((reservation) =>
        reservation.date === date
        && ACTIVE_RESERVATION_STATUSES.has(reservation.status)
        && reservationOverlapsWindow(reservation, rule.startTime, rule.endTime),
      );
      const reservationGuests = matchingReservations.reduce((sum, reservation) => sum + reservation.guests, 0);
      const reservationsEnabled = Boolean(
        rule.reservationGuestThreshold
        && rule.reservationIncrement
        && rule.reservationRounding,
      );
      const reservationAddition = reservationsEnabled
        ? thresholdAddition(
            reservationGuests,
            rule.reservationGuestThreshold!,
            rule.reservationIncrement!,
            rule.reservationRounding!,
          )
        : 0;
      const suggestedCount = rule.baseCount + historicalAddition + reservationAddition;

      recommendations.push({
        requirementDate: date,
        startTime: rule.startTime,
        endTime: rule.endTime,
        positionId: rule.positionId,
        suggestedCount,
        historicalValue: historicalAverage == null ? null : Number(historicalAverage.toFixed(2)),
        reservationGuests,
        comparableWeeks: comparableDates.length,
        explanation: {
          base: rule.baseCount,
          historical: {
            enabled: historicalEnabled,
            metric: rule.historicalMetric ?? null,
            average: historicalAverage == null ? null : Number(historicalAverage.toFixed(2)),
            addition: historicalAddition,
            comparableWeeks: comparableDates.length,
            requestedWeeks,
            minimumWeeks: rule.minimumComparableWeeks,
            sufficientData,
            message: historicalEnabled
              ? sufficientData
                ? `Media de ${comparableDates.length} ${comparableDates.length === 1 ? "semana comparable" : "semanas comparables"}.`
                : `Datos insuficientes: ${comparableDates.length} de ${rule.minimumComparableWeeks} semanas mínimas.`
              : "Histórico desactivado en esta regla.",
          },
          reservations: {
            enabled: reservationsEnabled,
            guests: reservationGuests,
            reservationCount: matchingReservations.length,
            addition: reservationAddition,
          },
          result: suggestedCount,
        },
        inputSnapshot: {
          comparableDates,
          reservationIds: matchingReservations.map((reservation) => reservation.id).sort(),
          historicalTicketIds: [...new Set(matchingObservations.map((observation) => observation.ticketId))].sort(),
        },
        ruleSnapshot: { ...rule },
      });
    }
  }
  return recommendations;
}

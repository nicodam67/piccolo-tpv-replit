import { describe, expect, it } from "vitest";
import {
  calculateStaffingNeeds,
  thresholdAddition,
  type HistoricalDemandObservation,
  type StaffingDemandRuleInput,
} from "./staffing-demand";

const rule: StaffingDemandRuleInput = {
  id: "rule-v1",
  ruleGroupId: "rule",
  version: 1,
  name: "Sala noche",
  workCenterId: "center-a",
  positionId: "waiter",
  dayOfWeek: 5,
  startTime: "20:00",
  endTime: "23:00",
  baseCount: 1,
  historicalWeeks: 3,
  minimumComparableWeeks: 2,
  historicalMetric: "GUESTS",
  historicalThreshold: 10,
  historicalIncrement: 1,
  historicalRounding: "PER_STARTED_BLOCK",
  reservationGuestThreshold: 8,
  reservationIncrement: 1,
  reservationRounding: "PER_STARTED_BLOCK",
};

function observation(overrides: Partial<HistoricalDemandObservation>): HistoricalDemandObservation {
  return {
    ticketId: "ticket",
    date: "2026-09-11",
    time: "21:00",
    revenue: 100,
    guests: 10,
    units: 4,
    unitsByCategory: {},
    unitsByPrepZone: {},
    ...overrides,
  };
}

describe("deterministic staffing demand", () => {
  it("returns base demand and explains missing historical data", () => {
    const [result] = calculateStaffingNeeds({
      dates: ["2026-09-18"],
      rules: [rule],
      observations: [],
      reservations: [],
    });
    expect(result).toMatchObject({
      suggestedCount: 1,
      comparableWeeks: 0,
      explanation: {
        historical: { sufficientData: false, addition: 0 },
        reservations: { addition: 0 },
      },
    });
  });

  it("uses the configured number of comparable same-weekday weeks", () => {
    const observations = [
      observation({ ticketId: "a", date: "2026-09-11", guests: 10 }),
      observation({ ticketId: "b", date: "2026-09-04", guests: 20 }),
      observation({ ticketId: "ignored-day", date: "2026-09-03", guests: 100 }),
    ];
    const [result] = calculateStaffingNeeds({
      dates: ["2026-09-18"],
      rules: [rule],
      observations,
      reservations: [],
    });
    expect(result).toMatchObject({
      historicalValue: 15,
      comparableWeeks: 2,
      suggestedCount: 3,
      explanation: { historical: { addition: 2, requestedWeeks: 3 } },
    });
  });

  it("does not claim comparable coverage from tickets outside the rule window", () => {
    const [result] = calculateStaffingNeeds({
      dates: ["2026-09-18"],
      rules: [rule],
      observations: [
        observation({ ticketId: "a", date: "2026-09-11", time: "12:00" }),
        observation({ ticketId: "b", date: "2026-09-04", time: "12:00" }),
      ],
      reservations: [],
    });
    expect(result).toMatchObject({
      comparableWeeks: 0,
      historicalValue: null,
      explanation: { historical: { sufficientData: false, addition: 0 } },
    });
  });

  it("includes active future reservations and excludes cancelled ones", () => {
    const [result] = calculateStaffingNeeds({
      dates: ["2026-09-18"],
      rules: [{ ...rule, historicalMetric: null, historicalThreshold: null, historicalIncrement: null, historicalRounding: null }],
      observations: [],
      reservations: [
        { id: "active", date: "2026-09-18", time: "21:00", durationMinutes: 90, guests: 9, status: "confirmada" },
        { id: "cancelled", date: "2026-09-18", time: "21:00", durationMinutes: 90, guests: 100, status: "cancelada_cliente" },
      ],
    });
    expect(result).toMatchObject({
      reservationGuests: 9,
      suggestedCount: 3,
      explanation: { reservations: { reservationCount: 1, addition: 2 } },
    });
    expect(result?.inputSnapshot.reservationIds).toEqual(["active"]);
  });

  it("supports position rules and filtered product-unit volume", () => {
    const [result] = calculateStaffingNeeds({
      dates: ["2026-09-18"],
      rules: [{
        ...rule,
        positionId: "pizzaiolo",
        historicalMetric: "UNITS",
        historicalThreshold: 5,
        historicalRounding: "ON_THRESHOLD",
        categoryId: "pizza",
        reservationGuestThreshold: null,
        reservationIncrement: null,
        reservationRounding: null,
      }],
      observations: [
        observation({ ticketId: "a", date: "2026-09-11", unitsByCategory: { pizza: 6 } }),
        observation({ ticketId: "b", date: "2026-09-04", unitsByCategory: { pizza: 6 } }),
      ],
      reservations: [],
    });
    expect(result).toMatchObject({ positionId: "pizzaiolo", historicalValue: 6, suggestedCount: 2 });
  });

  it("is reproducible and snapshots the applied rule version", () => {
    const input = {
      dates: ["2026-09-18"],
      rules: [rule],
      observations: [
        observation({ ticketId: "a", date: "2026-09-11" }),
        observation({ ticketId: "b", date: "2026-09-04" }),
      ],
      reservations: [],
    };
    expect(calculateStaffingNeeds(input)).toEqual(calculateStaffingNeeds(input));
    expect(calculateStaffingNeeds(input)[0]?.ruleSnapshot).toMatchObject({ id: "rule-v1", version: 1 });
  });

  it("keeps threshold rounding explicit", () => {
    expect(thresholdAddition(9, 10, 1, "PER_STARTED_BLOCK")).toBe(1);
    expect(thresholdAddition(9, 10, 1, "PER_COMPLETE_BLOCK")).toBe(0);
    expect(thresholdAddition(10, 10, 1, "ON_THRESHOLD")).toBe(0);
    expect(thresholdAddition(11, 10, 1, "ON_THRESHOLD")).toBe(1);
  });
});

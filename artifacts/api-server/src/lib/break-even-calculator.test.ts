import { describe, expect, it } from "vitest";
import {
  calculateBreakEven,
  countConfiguredOpenDays,
  normalizeOpenDaysToMonth,
} from "./break-even-calculator";
import { projectEconomicActivity } from "./economic-activity";

describe("calculateBreakEven", () => {
  const base = {
    fixedCostsMonthly: 10_000,
    variableCostsPeriod: 40_000,
    netSalesPeriod: 100_000,
    grossSalesPeriod: 110_000,
    issuedTickets: 4_000,
    openDaysPeriod: 26,
    normalizedOpenDaysMonthly: 26,
    periodDays: 365.25 / 12,
  };

  it("calculates contribution, break-even, daily sales, tickets and safety margin", () => {
    const result = calculateBreakEven(base);

    expect(result.variableCostRatio).toBeCloseTo(0.4);
    expect(result.contributionMarginRatio).toBeCloseTo(0.6);
    expect(result.breakEvenMonthlyNet).toBeCloseTo(16_666.6667);
    expect(result.breakEvenMonthlyGross).toBeCloseTo(18_333.3333);
    expect(result.breakEvenWeeklyNet).toBeCloseTo(3_846.1538);
    expect(result.minimumDailySalesNet).toBeCloseTo(641.0256);
    expect(result.averageTicketNet).toBe(25);
    expect(result.requiredDailyTickets).toBeCloseTo(25.641);
    expect(result.safetyMarginAmount).toBeCloseTo(83_333.3333);
    expect(result.safetyMarginPct).toBeCloseTo(83.3333);
  });

  it("includes a monthly profit target without changing the break-even point", () => {
    const result = calculateBreakEven({ ...base, targetProfitMonthly: 5_000 });

    expect(result.breakEvenMonthlyNet).toBeCloseTo(16_666.6667);
    expect(result.targetRevenueMonthlyNet).toBe(25_000);
    expect(result.targetDailySalesNet).toBeCloseTo(961.5385);
    expect(result.targetDailyTickets).toBeCloseTo(38.4615);
  });

  it("supports scenario overrides for ticket average and operating days", () => {
    const unchanged = { ...base };
    const actual = calculateBreakEven(base);
    const simulated = calculateBreakEven({
      ...base,
      normalizedOpenDaysMonthly: 27,
      averageTicketNet: 27,
      averageTicketGross: 29.7,
    });

    expect(simulated.minimumDailySalesNet).toBeLessThan(actual.minimumDailySalesNet!);
    expect(simulated.requiredDailyTickets).toBeLessThan(actual.requiredDailyTickets!);
    expect(simulated.averageTicketNet).toBe(27);
    expect(base).toEqual(unchanged);
  });

  it("returns null targets rather than infinity with zero sales or ticket average", () => {
    const result = calculateBreakEven({
      ...base,
      netSalesPeriod: 0,
      grossSalesPeriod: 0,
      issuedTickets: 0,
    });

    expect(result.variableCostRatio).toBeNull();
    expect(result.breakEvenMonthlyNet).toBeNull();
    expect(result.requiredDailyTickets).toBeNull();
    expect(result.safetyMarginPct).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining(["NO_NET_SALES", "NO_AVERAGE_TICKET"]));
    expect(Object.values(result).some((value) => value === Infinity || Number.isNaN(value))).toBe(false);
  });

  it("rejects zero or negative contribution margin without inventing a target", () => {
    const zeroMargin = calculateBreakEven({ ...base, variableCostsPeriod: 100_000 });
    const negativeMargin = calculateBreakEven({ ...base, variableCostsPeriod: 120_000 });

    expect(zeroMargin.breakEvenMonthlyNet).toBeNull();
    expect(negativeMargin.breakEvenMonthlyNet).toBeNull();
    expect(zeroMargin.issues).toContain("NON_POSITIVE_CONTRIBUTION_MARGIN");
    expect(negativeMargin.issues).toContain("NON_POSITIVE_CONTRIBUTION_MARGIN");
  });

  it("handles zero fixed costs as a valid zero break-even point", () => {
    const result = calculateBreakEven({ ...base, fixedCostsMonthly: 0 });

    expect(result.breakEvenMonthlyNet).toBe(0);
    expect(result.minimumDailySalesNet).toBe(0);
    expect(result.requiredDailyTickets).toBe(0);
  });

  it("does not calculate daily targets when the restaurant has no open days", () => {
    const result = calculateBreakEven({ ...base, normalizedOpenDaysMonthly: 0 });

    expect(result.breakEvenMonthlyNet).not.toBeNull();
    expect(result.minimumDailySalesNet).toBeNull();
    expect(result.requiredDailyTickets).toBeNull();
    expect(result.issues).toContain("NO_OPEN_DAYS");
  });

  it("preserves historical variable costs supplied by snapshots", () => {
    const historical = calculateBreakEven(base);
    const currentIngredientPriceChanged = calculateBreakEven(base);

    expect(currentIngredientPriceChanged).toEqual(historical);
    expect(historical.estimatedProfitPeriod).toBeCloseTo(50_000);
  });

  it("uses the certified economic projection for partial and total returns", () => {
    const rows = projectEconomicActivity({
      sales: [
        {
          orderId: "partial",
          orderItemId: "partial-line",
          quantity: 2,
          recognisedGross: 22,
          recognisedNet: 20,
          cogs: 6,
          createdAt: new Date("2026-09-02T12:00:00Z"),
        },
        {
          orderId: "total",
          orderItemId: "total-line",
          quantity: 1,
          recognisedGross: 11,
          recognisedNet: 10,
          cogs: 3,
          createdAt: new Date("2026-09-03T12:00:00Z"),
        },
      ],
      adjustments: [
        {
          id: "partial-return",
          orderId: "partial",
          grossAmount: 11,
          occurredAt: new Date("2026-09-04T12:00:00Z"),
        },
        {
          id: "total-return",
          orderId: "total",
          grossAmount: 11,
          occurredAt: new Date("2026-09-05T12:00:00Z"),
        },
      ],
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T23:59:59Z"),
    });
    const netSales = rows.reduce((total, row) => total + row.recognisedNet, 0);
    const cogs = rows.reduce((total, row) => total + row.cogs, 0);
    const result = calculateBreakEven({
      ...base,
      netSalesPeriod: netSales,
      grossSalesPeriod: rows.reduce((total, row) => total + row.recognisedGross, 0),
      variableCostsPeriod: cogs,
      issuedTickets: 2,
    });

    expect(netSales).toBe(10);
    expect(cogs).toBe(3);
    expect(result.variableCostRatio).toBeCloseTo(0.3);
    expect(result.estimatedProfitPeriod).toBeCloseTo(-9_993);
  });
});

describe("opening days", () => {
  it("counts only configured weekdays and supports partially closed periods", () => {
    const days = countConfiguredOpenDays(
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-07T23:59:59.999Z"),
      { tue: { open: "09:00", close: "17:00" }, sat: { open: "10:00", close: "23:00" } },
    );

    expect(days).toBe(2);
    expect(normalizeOpenDaysToMonth(days, 7)).toBeCloseTo(8.6964);
  });

  it("returns zero for missing schedules or invalid periods", () => {
    expect(countConfiguredOpenDays(new Date("2026-09-01"), new Date("2026-09-30"), null)).toBe(0);
    expect(countConfiguredOpenDays(new Date("2026-10-01"), new Date("2026-09-01"), {})).toBe(0);
    expect(normalizeOpenDaysToMonth(10, 0)).toBe(0);
  });
});

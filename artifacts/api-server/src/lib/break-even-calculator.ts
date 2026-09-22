export type DataQuality = "REAL" | "CONFIGURED" | "ESTIMATED" | "NO_DATA";

export interface BreakEvenInput {
  fixedCostsMonthly: number;
  variableCostsPeriod: number;
  netSalesPeriod: number;
  grossSalesPeriod: number;
  issuedTickets: number;
  openDaysPeriod: number;
  normalizedOpenDaysMonthly: number;
  periodDays: number;
  targetProfitMonthly?: number;
  averageTicketNet?: number;
  averageTicketGross?: number;
}

export interface BreakEvenResult {
  variableCostRatio: number | null;
  contributionMarginRatio: number | null;
  breakEvenMonthlyNet: number | null;
  breakEvenMonthlyGross: number | null;
  breakEvenWeeklyNet: number | null;
  minimumDailySalesNet: number | null;
  minimumDailySalesGross: number | null;
  requiredDailyTickets: number | null;
  targetRevenueMonthlyNet: number | null;
  targetRevenueMonthlyGross: number | null;
  targetDailySalesNet: number | null;
  targetDailySalesGross: number | null;
  targetDailyTickets: number | null;
  periodBreakEvenNet: number | null;
  safetyMarginAmount: number | null;
  safetyMarginPct: number | null;
  estimatedProfitPeriod: number | null;
  averageTicketNet: number | null;
  averageTicketGross: number | null;
  issues: string[];
}

const MONTH_DAYS = 365.25 / 12;
const WEEKS_PER_MONTH = 52 / 12;

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

/**
 * Break-even values are calculated on tax-exclusive amounts. Gross equivalents
 * use the observed gross/net ratio for the selected period; no tax rate is
 * invented when there are no sales.
 */
export function calculateBreakEven(input: BreakEvenInput): BreakEvenResult {
  const issues: string[] = [];
  const periodDays = finiteNonNegative(input.periodDays) && input.periodDays > 0
    ? input.periodDays
    : 0;
  const fixedCostsMonthly = finiteNonNegative(input.fixedCostsMonthly)
    ? input.fixedCostsMonthly
    : 0;
  const variableCostsPeriod = finiteNonNegative(input.variableCostsPeriod)
    ? input.variableCostsPeriod
    : 0;
  const netSalesPeriod = finiteNonNegative(input.netSalesPeriod)
    ? input.netSalesPeriod
    : 0;
  const grossSalesPeriod = finiteNonNegative(input.grossSalesPeriod)
    ? input.grossSalesPeriod
    : 0;
  const targetProfitMonthly = finiteNonNegative(input.targetProfitMonthly ?? 0)
    ? (input.targetProfitMonthly ?? 0)
    : 0;

  if (input.fixedCostsMonthly < 0 || !Number.isFinite(input.fixedCostsMonthly)) {
    issues.push("INVALID_FIXED_COSTS");
  }
  if (input.variableCostsPeriod < 0 || !Number.isFinite(input.variableCostsPeriod)) {
    issues.push("INVALID_VARIABLE_COSTS");
  }
  if (input.netSalesPeriod <= 0 || !Number.isFinite(input.netSalesPeriod)) {
    issues.push("NO_NET_SALES");
  }
  if (periodDays === 0) issues.push("INVALID_PERIOD");

  const variableCostRatio = safeRatio(variableCostsPeriod, netSalesPeriod);
  const contributionMarginRatio = variableCostRatio == null
    ? null
    : 1 - variableCostRatio;
  if (contributionMarginRatio != null && contributionMarginRatio <= 0) {
    issues.push("NON_POSITIVE_CONTRIBUTION_MARGIN");
  }

  const canCalculateTarget = contributionMarginRatio != null
    && contributionMarginRatio > 0;
  const breakEvenMonthlyNet = canCalculateTarget
    ? fixedCostsMonthly / contributionMarginRatio
    : null;
  const grossToNetRatio = safeRatio(grossSalesPeriod, netSalesPeriod);
  const breakEvenMonthlyGross = breakEvenMonthlyNet != null && grossToNetRatio != null
    ? breakEvenMonthlyNet * grossToNetRatio
    : null;
  const breakEvenWeeklyNet = breakEvenMonthlyNet != null
    ? breakEvenMonthlyNet / WEEKS_PER_MONTH
    : null;
  const openDaysMonthly = finiteNonNegative(input.normalizedOpenDaysMonthly)
    ? input.normalizedOpenDaysMonthly
    : 0;
  if (openDaysMonthly <= 0) issues.push("NO_OPEN_DAYS");
  const minimumDailySalesNet = breakEvenMonthlyNet != null && openDaysMonthly > 0
    ? breakEvenMonthlyNet / openDaysMonthly
    : null;
  const minimumDailySalesGross = breakEvenMonthlyGross != null && openDaysMonthly > 0
    ? breakEvenMonthlyGross / openDaysMonthly
    : null;

  const calculatedAverageTicketNet = safeRatio(netSalesPeriod, input.issuedTickets);
  const calculatedAverageTicketGross = safeRatio(grossSalesPeriod, input.issuedTickets);
  const averageTicketNet = finiteNonNegative(input.averageTicketNet ?? -1)
    && (input.averageTicketNet ?? 0) > 0
    ? input.averageTicketNet!
    : calculatedAverageTicketNet;
  const averageTicketGross = finiteNonNegative(input.averageTicketGross ?? -1)
    && (input.averageTicketGross ?? 0) > 0
    ? input.averageTicketGross!
    : calculatedAverageTicketGross;
  if (averageTicketNet == null || averageTicketNet <= 0) issues.push("NO_AVERAGE_TICKET");
  const requiredDailyTickets = minimumDailySalesNet != null
    && averageTicketNet != null
    && averageTicketNet > 0
    ? minimumDailySalesNet / averageTicketNet
    : null;

  const targetRevenueMonthlyNet = canCalculateTarget
    ? (fixedCostsMonthly + targetProfitMonthly) / contributionMarginRatio
    : null;
  const targetRevenueMonthlyGross = targetRevenueMonthlyNet != null && grossToNetRatio != null
    ? targetRevenueMonthlyNet * grossToNetRatio
    : null;
  const targetDailySalesNet = targetRevenueMonthlyNet != null && openDaysMonthly > 0
    ? targetRevenueMonthlyNet / openDaysMonthly
    : null;
  const targetDailySalesGross = targetRevenueMonthlyGross != null && openDaysMonthly > 0
    ? targetRevenueMonthlyGross / openDaysMonthly
    : null;
  const targetDailyTickets = targetDailySalesNet != null
    && averageTicketNet != null
    && averageTicketNet > 0
    ? targetDailySalesNet / averageTicketNet
    : null;
  const periodBreakEvenNet = breakEvenMonthlyNet != null && periodDays > 0
    ? breakEvenMonthlyNet * periodDays / MONTH_DAYS
    : null;
  const safetyMarginAmount = periodBreakEvenNet == null
    ? null
    : netSalesPeriod - periodBreakEvenNet;
  const safetyMarginPct = safetyMarginAmount == null || netSalesPeriod <= 0
    ? null
    : safetyMarginAmount / netSalesPeriod * 100;
  const fixedCostsPeriod = periodDays > 0
    ? fixedCostsMonthly * periodDays / MONTH_DAYS
    : null;
  const estimatedProfitPeriod = fixedCostsPeriod == null
    ? null
    : netSalesPeriod - variableCostsPeriod - fixedCostsPeriod;

  return {
    variableCostRatio,
    contributionMarginRatio,
    breakEvenMonthlyNet,
    breakEvenMonthlyGross,
    breakEvenWeeklyNet,
    minimumDailySalesNet,
    minimumDailySalesGross,
    requiredDailyTickets,
    targetRevenueMonthlyNet,
    targetRevenueMonthlyGross,
    targetDailySalesNet,
    targetDailySalesGross,
    targetDailyTickets,
    periodBreakEvenNet,
    safetyMarginAmount,
    safetyMarginPct,
    estimatedProfitPeriod,
    averageTicketNet,
    averageTicketGross,
    issues: [...new Set(issues)],
  };
}

export function countConfiguredOpenDays(
  from: Date,
  to: Date,
  openingHours: Record<string, unknown> | null | undefined,
): number {
  if (!openingHours || Object.keys(openingHours).length === 0 || to < from) return 0;
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  let count = 0;
  const cursor = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  ));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= last) {
    if (openingHours[weekdayKeys[cursor.getUTCDay()]!]) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function normalizeOpenDaysToMonth(openDays: number, periodDays: number): number {
  if (!finiteNonNegative(openDays) || !finiteNonNegative(periodDays) || periodDays <= 0) {
    return 0;
  }
  return openDays * MONTH_DAYS / periodDays;
}

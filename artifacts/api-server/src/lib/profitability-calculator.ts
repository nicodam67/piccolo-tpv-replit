/**
 * Pure profitability formulas shared by recipes, reports and simulations.
 *
 * Percentages are margins over net sales (VAT excluded), never markup.
 * Ingredient purchase prices are normalized to the ingredient consumption unit
 * before recipe quantities and waste are applied.
 */

const UNIT_GROUPS: Record<string, Record<string, number>> = {
  mass: { kg: 1, g: 0.001, mg: 0.000001 },
  volume: { l: 1, ml: 0.001, cl: 0.01 },
  count: { ud: 1, unidad: 1, unidades: 1, docena: 12 },
};

export interface RecipeCostInput {
  purchaseCost: number;
  conversionFactor?: number;
  quantity: number;
  recipeUnit: string;
  consumptionUnit: string;
  wastePercent?: number;
}

export interface ProfitabilityInput {
  pvp: number;
  taxRate: number;
  productCost: number;
  commissionPercent?: number;
  commissionFixed?: number;
  allocatedOperatingCost?: number;
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) return quantity;

  for (const group of Object.values(UNIT_GROUPS)) {
    if (group[from] != null && group[to] != null) {
      return quantity * group[from] / group[to];
    }
  }
  throw new Error(`Conversión incompatible: ${fromUnit} → ${toUnit}`);
}

export function calculateRecipeLineCost(input: RecipeCostInput) {
  const conversionFactor = input.conversionFactor && input.conversionFactor > 0
    ? input.conversionFactor
    : 1;
  const normalizedQuantity = convertQuantity(
    Math.max(0, input.quantity),
    input.recipeUnit,
    input.consumptionUnit,
  );
  const unitCost = Math.max(0, input.purchaseCost) / conversionFactor;
  const ingredientCost = normalizedQuantity * unitCost;
  const wasteRate = Math.max(0, input.wastePercent ?? 0) / 100;
  const wasteCost = ingredientCost * wasteRate;
  return {
    normalizedQuantity,
    unitCost,
    ingredientCost,
    wasteCost,
    effectiveCost: ingredientCost + wasteCost,
  };
}

export function calculateProfitability(input: ProfitabilityInput) {
  const pvp = Number.isFinite(input.pvp) ? input.pvp : 0;
  const taxMultiplier = 1 + Math.max(0, input.taxRate) / 100;
  const netPrice = taxMultiplier > 0 ? pvp / taxMultiplier : 0;
  const productCost = Math.max(0, input.productCost);
  const commission = Math.max(0, netPrice * Math.max(0, input.commissionPercent ?? 0) / 100)
    + Math.max(0, input.commissionFixed ?? 0);
  const contribution = netPrice - productCost - commission;
  const contributionPct = netPrice > 0 ? contribution / netPrice * 100 : 0;
  const foodCostPct = netPrice > 0 ? productCost / netPrice * 100 : 0;
  const allocatedOperatingCost = Math.max(0, input.allocatedOperatingCost ?? 0);
  const estimatedProfit = contribution - allocatedOperatingCost;
  const estimatedProfitPct = netPrice > 0 ? estimatedProfit / netPrice * 100 : 0;
  return {
    pvp,
    netPrice,
    productCost,
    commission,
    contribution,
    contributionPct,
    foodCostPct,
    allocatedOperatingCost,
    estimatedProfit,
    estimatedProfitPct,
  };
}

export function recommendedPvp(input: {
  productCost: number;
  targetMarginPct: number;
  taxRate: number;
  commissionPercent?: number;
  commissionFixed?: number;
  allocatedOperatingCost?: number;
}): number | null {
  const target = input.targetMarginPct / 100;
  const commissionRate = Math.max(0, input.commissionPercent ?? 0) / 100;
  const denominator = 1 - target - commissionRate;
  if (denominator <= 0) return null;
  const requiredNet = (
    Math.max(0, input.productCost)
    + Math.max(0, input.commissionFixed ?? 0)
    + Math.max(0, input.allocatedOperatingCost ?? 0)
  ) / denominator;
  return requiredNet * (1 + Math.max(0, input.taxRate) / 100);
}

export function profitabilityStatus(
  contribution: number,
  contributionPct: number,
  targetMarginPct: number,
  warningGapPct: number,
): "green" | "orange" | "red" {
  if (contribution <= 0) return "red";
  if (contributionPct >= targetMarginPct) return "green";
  return contributionPct >= targetMarginPct - Math.max(0, warningGapPct)
    ? "orange"
    : "red";
}

export function allocateOperatingCost(input: {
  totalOperatingCost: number;
  method: "none" | "revenue" | "units";
  productRevenue: number;
  totalRevenue: number;
  productUnits: number;
  totalUnits: number;
}): number {
  if (input.method === "revenue" && input.totalRevenue > 0) {
    return input.totalOperatingCost * input.productRevenue / input.totalRevenue;
  }
  if (input.method === "units" && input.totalUnits > 0) {
    return input.totalOperatingCost * input.productUnits / input.totalUnits;
  }
  return 0;
}

export function recognisedLineRevenue(input: {
  gross: number;
  isInvitation?: boolean;
  lineDiscount?: number;
  orderDiscount?: number;
  orderGross?: number;
}): number {
  if (input.isInvitation) return 0;
  const allocatedOrderDiscount = input.orderGross && input.orderGross > 0
    ? Math.max(0, input.orderDiscount ?? 0) * Math.max(0, input.gross) / input.orderGross
    : 0;
  return Math.max(
    0,
    Math.max(0, input.gross)
      - Math.max(0, input.lineDiscount ?? 0)
      - allocatedOrderDiscount,
  );
}

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  productFormatsTable,
  categoriesTable,
  recipeItemsTable,
  ingredientsTable,
  subrecipesTable,
  ingredientCostHistoryTable,
  profitabilitySettingsTable,
  operatingExpensesTable,
  channelCommissionsTable,
  profitabilityTargetsTable,
  priceChangeProposalsTable,
  businessConfigTable,
  employeesTable,
  timeRecordsTable,
} from "@workspace/db";
import {
  eq,
  asc,
  desc,
  and,
  isNull,
  gte,
  lte,
} from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  allocateOperatingCost,
  calculateProfitability,
  calculateRecipeLineCost,
  profitabilityStatus,
  recommendedPvp,
  resolveTargetMargin,
} from "../lib/profitability-calculator";
import {
  loadProjectedEconomicActivity,
} from "../lib/profitability-economic-data";
import {
  calculateBreakEven,
  countConfiguredOpenDays,
  normalizeOpenDaysToMonth,
  type BreakEvenInput,
  type DataQuality,
} from "../lib/break-even-calculator";

const router: IRouter = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_TARGET_MARGIN = 65;
const DEFAULT_WARNING_GAP = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute cost for a single recipe line (ingredient or sub-recipe). */
function computeLineCost(
  unitCost: number,
  quantity: string,
  wastePercent: string,
): number {
  const qty = parseFloat(quantity) || 0;
  const waste = parseFloat(wastePercent) || 0;
  return unitCost * qty * (1 + waste / 100);
}

/** Compute all recipe lines for a product (base recipe, formatId IS NULL). */
async function computeProductCost(
  productId: string,
  formatId: string | null = null,
  ingredientMultipliers: Map<string, number> = new Map(),
): Promise<{
  theoreticalCost: number;
  wasteCost: number;
  packagingCost: number;
  additionalCost: number;
  totalCost: number;
}> {
  // Fetch base recipe items (formatId IS NULL unless a specific format is requested)
  const lines = await db
    .select({
      ingredientId: recipeItemsTable.ingredientId,
      subrecipeId: recipeItemsTable.subrecipeId,
      quantity: recipeItemsTable.quantity,
      unit: recipeItemsTable.unit,
      wastePercent: recipeItemsTable.wastePercent,
      packagingCost: recipeItemsTable.packagingCost,
      additionalCost: recipeItemsTable.additionalCost,
      ingredientCost: ingredientsTable.purchaseCost,
      ingredientConsumptionUnit: ingredientsTable.consumptionUnit,
      ingredientConversionFactor: ingredientsTable.conversionFactor,
      subrecipeCost: subrecipesTable.cost,
      subrecipeUnit: subrecipesTable.unit,
    })
    .from(recipeItemsTable)
    .leftJoin(
      ingredientsTable,
      eq(recipeItemsTable.ingredientId, ingredientsTable.id),
    )
    .leftJoin(
      subrecipesTable,
      eq(recipeItemsTable.subrecipeId, subrecipesTable.id),
    )
    .where(
      and(
        eq(recipeItemsTable.productId, productId),
        formatId ? eq(recipeItemsTable.formatId, formatId) : isNull(recipeItemsTable.formatId),
      ),
    );

  let theoreticalCost = 0;
  let wasteCost = 0;
  let packagingCostTotal = 0;
  let additionalCostTotal = 0;

  for (const line of lines) {
    const unitCost = line.ingredientId
      ? parseFloat(line.ingredientCost ?? "0") * (ingredientMultipliers.get(line.ingredientId) ?? 1)
      : parseFloat(line.subrecipeCost ?? "0");
    if (line.ingredientId) {
      try {
        const calculated = calculateRecipeLineCost({
          purchaseCost: unitCost,
          conversionFactor: parseFloat(line.ingredientConversionFactor ?? "1") || 1,
          quantity: parseFloat(line.quantity) || 0,
          recipeUnit: line.unit,
          consumptionUnit: line.ingredientConsumptionUnit ?? line.unit,
          wastePercent: parseFloat(line.wastePercent) || 0,
        });
        theoreticalCost += calculated.ingredientCost;
        wasteCost += calculated.wasteCost;
      } catch {
        const base = unitCost * (parseFloat(line.quantity) || 0);
        theoreticalCost += base;
        wasteCost += computeLineCost(unitCost, line.quantity, line.wastePercent) - base;
      }
    } else {
      try {
        const calculated = calculateRecipeLineCost({
          purchaseCost: unitCost,
          conversionFactor: 1,
          quantity: parseFloat(line.quantity) || 0,
          recipeUnit: line.unit,
          consumptionUnit: line.subrecipeUnit ?? line.unit,
          wastePercent: parseFloat(line.wastePercent) || 0,
        });
        theoreticalCost += calculated.ingredientCost;
        wasteCost += calculated.wasteCost;
      } catch {
        const base = unitCost * (parseFloat(line.quantity) || 0);
        theoreticalCost += base;
        wasteCost += computeLineCost(unitCost, line.quantity, line.wastePercent) - base;
      }
    }
    packagingCostTotal += parseFloat(line.packagingCost ?? "0");
    additionalCostTotal += parseFloat(line.additionalCost ?? "0");
  }

  const totalCost = theoreticalCost + wasteCost + packagingCostTotal + additionalCostTotal;
  return { theoreticalCost, wasteCost, packagingCost: packagingCostTotal, additionalCost: additionalCostTotal, totalCost };
}

/** Compute profitability metrics given price, taxRate, and cost. */
function computeMetrics(
  price: string,
  taxRate: number,
  totalCost: number,
): {
  pvp: number;
  basePrice: number;
  grossMargin: number;
  marginPct: number;
  foodCostPct: number;
} {
  const pvp = parseFloat(price);
  const basePrice = pvp / (1 + taxRate / 100);
  const grossMargin = basePrice - totalCost;
  const marginPct = basePrice > 0 ? (grossMargin / basePrice) * 100 : 0;
  const foodCostPct = basePrice > 0 ? (totalCost / basePrice) * 100 : 0;
  return { pvp, basePrice, grossMargin, marginPct, foodCostPct };
}

type ProfitabilityContext = {
  channel: string;
  targetMarginPct: number;
  warningGapPct: number;
  commissionPercent: number;
  commissionFixed: number;
};

async function getProfitabilityContext(
  productId: string,
  categoryId: string,
  channel: string,
): Promise<ProfitabilityContext> {
  const [settings] = await db.select().from(profitabilitySettingsTable)
    .where(eq(profitabilitySettingsTable.id, "global"));
  const [commission] = await db.select().from(channelCommissionsTable)
    .where(and(
      eq(channelCommissionsTable.channel, channel),
      eq(channelCommissionsTable.active, true),
    ));
  const targets = await db.select().from(profitabilityTargetsTable)
    .where(eq(profitabilityTargetsTable.active, true));
  const defaultTargetMarginPct = parseFloat(
    settings?.defaultTargetMarginPct ?? String(DEFAULT_TARGET_MARGIN),
  );
  return {
    channel,
    targetMarginPct: resolveTargetMargin({
      productId,
      categoryId,
      channel,
      defaultTargetMarginPct,
      targets: targets.map((target) => ({
        scopeType: target.scopeType as "global" | "category" | "product",
        categoryId: target.categoryId,
        productId: target.productId,
        channel: target.channel,
        targetMarginPct: parseFloat(target.targetMarginPct),
      })),
    }),
    warningGapPct: parseFloat(settings?.warningGapPct ?? String(DEFAULT_WARNING_GAP)),
    commissionPercent: parseFloat(commission?.percent ?? "0"),
    commissionFixed: parseFloat(commission?.fixedAmount ?? "0"),
  };
}

function monthlyExpenseAmount(expense: typeof operatingExpensesTable.$inferSelect): number {
  const months = Math.max(1, expense.periodMonths);
  return parseFloat(expense.amount) / months;
}

type BreakEvenScenario = {
  personnelPercent?: number;
  rawMaterialPercent?: number;
  electricityPercent?: number;
  averageTicketDelta?: number;
  openDaysDelta?: number;
  targetProfitDelta?: number;
  foodCostPct?: number;
  commissionPercent?: number;
};

function validScenarioNumber(value: unknown, min = -100, max = 10_000): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

async function buildBreakEvenAnalysis(input: {
  from: Date;
  to: Date;
  targetProfitMonthly: number;
  channel?: string;
  scenario?: BreakEvenScenario;
}) {
  const periodDays = Math.max(
    1,
    (input.to.getTime() - input.from.getTime()) / 86_400_000,
  );
  const [productCosts, expenses, commissions, businessConfigs, employees, timeRecords] =
    await Promise.all([
      db.select({ id: productsTable.id, cost: productsTable.cost })
        .from(productsTable)
        .where(eq(productsTable.active, true)),
      db.select().from(operatingExpensesTable)
        .where(eq(operatingExpensesTable.active, true)),
      db.select().from(channelCommissionsTable)
        .where(eq(channelCommissionsTable.active, true)),
      db.select({ openingHours: businessConfigTable.openingHours })
        .from(businessConfigTable)
        .where(eq(businessConfigTable.active, true)),
      db.select({
        id: employeesTable.id,
        hourlyRate: employeesTable.hourlyRate,
        monthlySalary: employeesTable.monthlySalary,
        employerCostRate: employeesTable.employerCostRate,
      }).from(employeesTable)
        .where(and(eq(employeesTable.active, true), eq(employeesTable.isDemo, false))),
      db.select({
        employeeId: timeRecordsTable.employeeId,
        clockIn: timeRecordsTable.clockIn,
        clockOut: timeRecordsTable.clockOut,
      }).from(timeRecordsTable)
        .where(and(
          gte(timeRecordsTable.clockIn, input.from),
          lte(timeRecordsTable.clockIn, input.to),
        )),
    ]);
  const currentCostByProduct = new Map(
    productCosts.map((product) => [product.id, parseFloat(product.cost ?? "0")]),
  );
  const economic = await loadProjectedEconomicActivity({
    from: input.from,
    to: input.to,
    channel: input.channel,
    currentCostByProduct,
  });
  const grossSales = economic.rows.reduce((total, row) => total + row.recognisedGross, 0);
  const netSales = economic.rows.reduce((total, row) => total + row.recognisedNet, 0);
  const cogs = economic.totalCogs;
  const commissionByChannel = new Map(
    commissions.map((commission) => [commission.channel, commission]),
  );
  let deliveryCommissionCost = 0;
  const commissionCost = economic.rows.reduce((total, row) => {
    const commission = commissionByChannel.get(row.effectiveChannel);
    const rowCost = row.recognisedNet * parseFloat(commission?.percent ?? "0") / 100
      + row.quantity * parseFloat(commission?.fixedAmount ?? "0");
    if (row.effectiveChannel === "delivery") deliveryCommissionCost += rowCost;
    return total + rowCost;
  }, 0);

  const manualPersonnel = expenses.filter((expense) => expense.category === "personal");
  let personnelPeriod = 0;
  let hasHrPersonnelData = false;
  for (const employee of employees) {
    const employerRate = parseFloat(employee.employerCostRate ?? "1.35");
    const monthlySalary = parseFloat(employee.monthlySalary ?? "0");
    if (monthlySalary > 0) {
      personnelPeriod += monthlySalary * employerRate * periodDays / 30.4375;
      hasHrPersonnelData = true;
      continue;
    }
    const hourlyRate = parseFloat(employee.hourlyRate ?? "0");
    if (hourlyRate <= 0) continue;
    const hours = timeRecords
      .filter((record) => record.employeeId === employee.id && record.clockOut)
      .reduce(
        (total, record) =>
          total
          + (record.clockOut!.getTime() - record.clockIn.getTime()) / 3_600_000,
        0,
      );
    if (hours > 0) {
      personnelPeriod += hours * hourlyRate * employerRate;
      hasHrPersonnelData = true;
    }
  }
  const manualPersonnelMonthly = manualPersonnel.reduce(
    (total, expense) => total + monthlyExpenseAmount(expense),
    0,
  );
  const personnelMonthly = hasHrPersonnelData
    ? personnelPeriod * 30.4375 / periodDays
    : manualPersonnelMonthly;
  const nonPersonnelExpenses = expenses.filter((expense) => expense.category !== "personal");
  const fixedExpensesMonthly = nonPersonnelExpenses
    .filter((expense) => expense.costType === "fixed")
    .reduce((total, expense) => total + monthlyExpenseAmount(expense), 0);
  const variableExpensesPeriod = nonPersonnelExpenses
    .filter((expense) => expense.costType === "variable")
    .reduce(
      (total, expense) =>
        total + monthlyExpenseAmount(expense) * periodDays / 30.4375,
      0,
    );
  const electricityFixedMonthly = nonPersonnelExpenses
    .filter((expense) => expense.category === "electricity" && expense.costType === "fixed")
    .reduce((total, expense) => total + monthlyExpenseAmount(expense), 0);
  const electricityVariablePeriod = nonPersonnelExpenses
    .filter((expense) => expense.category === "electricity" && expense.costType === "variable")
    .reduce(
      (total, expense) =>
        total + monthlyExpenseAmount(expense) * periodDays / 30.4375,
      0,
    );

  const configuredOpenDays = countConfiguredOpenDays(
    input.from,
    input.to,
    businessConfigs[0]?.openingHours,
  );
  const openDaysPeriod = configuredOpenDays || economic.actualOpenDays;
  const normalizedOpenDaysMonthly = normalizeOpenDaysToMonth(openDaysPeriod, periodDays);
  const scenario = input.scenario;
  const personnelMultiplier = 1 + validScenarioNumber(scenario?.personnelPercent) / 100;
  const electricityMultiplier = 1 + validScenarioNumber(scenario?.electricityPercent) / 100;
  const rawMaterialMultiplier = 1 + validScenarioNumber(scenario?.rawMaterialPercent) / 100;
  const commissionMultiplier = 1 + validScenarioNumber(scenario?.commissionPercent) / 100;
  const adjustedPersonnelMonthly = personnelMonthly * personnelMultiplier;
  const adjustedFixedMonthly = adjustedPersonnelMonthly
    + fixedExpensesMonthly
    + electricityFixedMonthly * (electricityMultiplier - 1);
  const adjustedCogs = scenario?.foodCostPct != null && Number.isFinite(scenario.foodCostPct)
    ? Math.max(0, netSales * Math.max(0, scenario.foodCostPct) / 100)
    : cogs * rawMaterialMultiplier;
  const adjustedVariableExpenses = variableExpensesPeriod
    + electricityVariablePeriod * (electricityMultiplier - 1);
  const variableCostsPeriod = adjustedCogs
    + commissionCost
    + deliveryCommissionCost * (commissionMultiplier - 1)
    + adjustedVariableExpenses;
  const adjustedOpenDaysMonthly = Math.max(
    0,
    normalizedOpenDaysMonthly + validScenarioNumber(scenario?.openDaysDelta, -31, 31),
  );
  const actualAverageTicketNet = economic.issuedTicketCount > 0
    ? netSales / economic.issuedTicketCount
    : 0;
  const actualAverageTicketGross = economic.issuedTicketCount > 0
    ? grossSales / economic.issuedTicketCount
    : 0;
  const netToGross = netSales > 0 ? grossSales / netSales : 1;
  const adjustedAverageTicketNet = Math.max(
    0,
    actualAverageTicketNet + validScenarioNumber(scenario?.averageTicketDelta, -10_000, 10_000),
  );
  const adjustedAverageTicketGross = adjustedAverageTicketNet * netToGross;
  const targetProfit = Math.max(
    0,
    input.targetProfitMonthly
      + validScenarioNumber(scenario?.targetProfitDelta, -1_000_000, 1_000_000),
  );
  const calculatorInput: BreakEvenInput = {
    fixedCostsMonthly: adjustedFixedMonthly,
    variableCostsPeriod,
    netSalesPeriod: Math.max(0, netSales),
    grossSalesPeriod: Math.max(0, grossSales),
    issuedTickets: economic.issuedTicketCount,
    openDaysPeriod,
    normalizedOpenDaysMonthly: adjustedOpenDaysMonthly,
    periodDays,
    targetProfitMonthly: targetProfit,
    averageTicketNet: scenario ? adjustedAverageTicketNet : undefined,
    averageTicketGross: scenario ? adjustedAverageTicketGross : undefined,
  };
  const metrics = calculateBreakEven(calculatorInput);
  const missingData: string[] = [];
  if (!hasHrPersonnelData && manualPersonnel.length === 0) missingData.push("PERSONNEL_COST");
  if (expenses.length === 0) missingData.push("OPERATING_EXPENSES");
  if (openDaysPeriod === 0) missingData.push("OPEN_DAYS");
  if (netSales <= 0) missingData.push("NET_SALES");
  const warnings: string[] = [];
  if (hasHrPersonnelData && manualPersonnel.length > 0) {
    warnings.push("El coste de personal de RR. HH. prevalece; el gasto manual de personal no se suma.");
  }
  if (configuredOpenDays === 0 && economic.actualOpenDays > 0) {
    warnings.push("Sin horario configurado: los días abiertos se estiman a partir de tickets emitidos.");
  }
  if (economic.historicalCogsCoveragePct < 100) {
    warnings.push("Parte del COGS histórico usa la receta actual porque no existe snapshot de venta.");
  }
  if (expenses.some((expense) => expense.category === "other")) {
    warnings.push("Los gastos sin clasificación se incluyen según su tipo fijo o variable.");
  }
  const personnelSource: DataQuality = hasHrPersonnelData
    ? "ESTIMATED"
    : manualPersonnel.length > 0 ? "CONFIGURED" : "NO_DATA";
  const openDaysSource: DataQuality = configuredOpenDays > 0
    ? "CONFIGURED"
    : economic.actualOpenDays > 0 ? "ESTIMATED" : "NO_DATA";
  const dailySales = new Map<string, number>();
  for (const row of economic.rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    dailySales.set(date, (dailySales.get(date) ?? 0) + row.recognisedNet);
  }
  const now = new Date();
  const selectedCurrentMonth = input.to.getUTCFullYear() === now.getUTCFullYear()
    && input.to.getUTCMonth() === now.getUTCMonth();
  const endOfCurrentMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  ));

  return {
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      days: periodDays,
      incomplete: selectedCurrentMonth && input.to < endOfCurrentMonth,
    },
    actual: {
      grossSales,
      netSales,
      issuedTickets: economic.issuedTicketCount,
      actualOpenDays: economic.actualOpenDays,
      configuredOpenDays,
      cogs,
      commissions: commissionCost,
      variableExpenses: variableExpensesPeriod,
      contributionMargin: netSales - cogs - commissionCost - variableExpensesPeriod,
      historicalCogsCoveragePct: economic.historicalCogsCoveragePct,
    },
    costs: {
      fixedMonthly: adjustedFixedMonthly,
      personnelMonthly: adjustedPersonnelMonthly,
      otherFixedMonthly: adjustedFixedMonthly - adjustedPersonnelMonthly,
      variablePeriod: variableCostsPeriod,
    },
    targetProfitMonthly: targetProfit,
    metrics,
    sources: {
      sales: netSales > 0 ? "REAL" as DataQuality : "NO_DATA" as DataQuality,
      cogs: economic.historicalCogsCoveragePct >= 100 ? "REAL" as DataQuality : "ESTIMATED" as DataQuality,
      expenses: expenses.length > 0 ? "CONFIGURED" as DataQuality : "NO_DATA" as DataQuality,
      personnel: personnelSource,
      commissions: commissions.length > 0 ? "CONFIGURED" as DataQuality : "NO_DATA" as DataQuality,
      openDays: openDaysSource,
    },
    missingData,
    warnings,
    complete: missingData.length === 0 && metrics.issues.length === 0,
    evolution: Array.from(dailySales.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, sales]) => ({
        date,
        netSales: sales,
        targetNet: metrics.minimumDailySalesNet,
      })),
  };
}

// ── GET /admin/profitability ──────────────────────────────────────────────────
router.get(
  "/admin/profitability",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const channel = typeof req.query.channel === "string" ? req.query.channel : "tpv";
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        cost: productsTable.cost,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
        department: productsTable.prepZone,
        active: productsTable.active,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(productsTable.name));

    const result = await Promise.all(
      products.map(async (p) => {
        const { theoreticalCost, wasteCost, packagingCost, additionalCost, totalCost } =
          await computeProductCost(p.id);
        const context = await getProfitabilityContext(p.id, p.categoryId, channel);
        const metrics = calculateProfitability({
          pvp: parseFloat(p.price),
          taxRate: p.taxRate,
          productCost: totalCost,
          commissionPercent: context.commissionPercent,
          commissionFixed: context.commissionFixed,
        });
        const recommended = recommendedPvp({
          productCost: totalCost,
          targetMarginPct: context.targetMarginPct,
          taxRate: p.taxRate,
          commissionPercent: context.commissionPercent,
          commissionFixed: context.commissionFixed,
        });

        const recordedCost = p.cost ? parseFloat(p.cost) : null;
        const costDeviation =
          recordedCost !== null ? totalCost - recordedCost : null;
        const status = profitabilityStatus(
          metrics.contribution,
          metrics.contributionPct,
          context.targetMarginPct,
          context.warningGapPct,
        );

        return {
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          department: p.department,
          pvp: metrics.pvp.toFixed(2),
          basePrice: metrics.netPrice.toFixed(4),
          theoreticalCost: theoreticalCost.toFixed(4),
          wasteCost: wasteCost.toFixed(4),
          packagingCost: packagingCost.toFixed(4),
          additionalCost: additionalCost.toFixed(4),
          totalCost: totalCost.toFixed(4),
          recordedCost: recordedCost !== null ? recordedCost.toFixed(4) : null,
          grossMargin: metrics.contribution.toFixed(4),
          marginPct: metrics.contributionPct.toFixed(2),
          foodCostPct: metrics.foodCostPct.toFixed(2),
          commission: metrics.commission.toFixed(4),
          contributionMargin: metrics.contribution.toFixed(4),
          contributionMarginPct: metrics.contributionPct.toFixed(2),
          allocatedOperatingCost: null,
          estimatedProfit: null,
          targetMarginPct: context.targetMarginPct.toFixed(2),
          recommendedPrice: recommended == null ? null : recommended.toFixed(2),
          status,
          channel,
          costDeviation:
            costDeviation !== null ? costDeviation.toFixed(4) : null,
          alert: status === "green" ? null : status === "orange" ? "review" : "margin_low",
          taxRate: p.taxRate,
        };
      }),
    );

    res.json(result);
  },
);

// ── GET /admin/profitability/by-category ─────────────────────────────────────
router.get(
  "/admin/profitability/by-category",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        cost: productsTable.cost,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(categoriesTable.name), asc(productsTable.name));

    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        products: any[];
        totalCost: number;
        totalBase: number;
      }
    >();

    for (const p of products) {
      const { totalCost } = await computeProductCost(p.id);
      const { basePrice, grossMargin, marginPct, foodCostPct } = computeMetrics(
        p.price,
        p.taxRate,
        totalCost,
      );

      if (!byCategory.has(p.categoryId)) {
        byCategory.set(p.categoryId, {
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          products: [],
          totalCost: 0,
          totalBase: 0,
        });
      }
      const cat = byCategory.get(p.categoryId)!;
      cat.products.push({
        id: p.id,
        name: p.name,
        pvp: parseFloat(p.price).toFixed(2),
        basePrice: basePrice.toFixed(4),
        totalCost: totalCost.toFixed(4),
        grossMargin: grossMargin.toFixed(4),
        marginPct: marginPct.toFixed(2),
        foodCostPct: foodCostPct.toFixed(2),
      });
      cat.totalCost += totalCost;
      cat.totalBase += basePrice;
    }

    const result = Array.from(byCategory.values()).map((cat) => ({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      avgFoodCostPct:
        cat.totalBase > 0
          ? ((cat.totalCost / cat.totalBase) * 100).toFixed(2)
          : "0.00",
      products: cat.products,
    }));

    res.json(result);
  },
);

// ── GET /admin/profitability/break-even ──────────────────────────────────────
router.get(
  "/admin/profitability/break-even",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : defaultFrom;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
      res.status(400).json({ error: "Periodo no válido" });
      return;
    }
    const targetProfitMonthly = Math.max(
      0,
      validScenarioNumber(req.query.targetProfit, 0, 1_000_000),
    );
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    res.json(await buildBreakEvenAnalysis({
      from,
      to,
      targetProfitMonthly,
      channel,
    }));
  },
);

// ── POST /admin/profitability/break-even/scenario ────────────────────────────
router.post(
  "/admin/profitability/break-even/scenario",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const now = new Date();
    const from = req.body?.from
      ? new Date(req.body.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.body?.to ? new Date(req.body.to) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
      res.status(400).json({ error: "Periodo no válido" });
      return;
    }
    const targetProfitMonthly = Math.max(
      0,
      validScenarioNumber(req.body?.targetProfitMonthly, 0, 1_000_000),
    );
    const scenario: BreakEvenScenario = {
      personnelPercent: validScenarioNumber(req.body?.scenario?.personnelPercent),
      rawMaterialPercent: validScenarioNumber(req.body?.scenario?.rawMaterialPercent),
      electricityPercent: validScenarioNumber(req.body?.scenario?.electricityPercent),
      averageTicketDelta: validScenarioNumber(req.body?.scenario?.averageTicketDelta, -10_000, 10_000),
      openDaysDelta: validScenarioNumber(req.body?.scenario?.openDaysDelta, -31, 31),
      targetProfitDelta: validScenarioNumber(req.body?.scenario?.targetProfitDelta, -1_000_000, 1_000_000),
      foodCostPct: req.body?.scenario?.foodCostPct == null
        ? undefined
        : validScenarioNumber(req.body.scenario.foodCostPct, 0, 1_000),
      commissionPercent: validScenarioNumber(req.body?.scenario?.commissionPercent),
    };
    const [actual, simulated] = await Promise.all([
      buildBreakEvenAnalysis({
        from,
        to,
        targetProfitMonthly,
        channel: typeof req.body?.channel === "string" ? req.body.channel : undefined,
      }),
      buildBreakEvenAnalysis({
        from,
        to,
        targetProfitMonthly,
        channel: typeof req.body?.channel === "string" ? req.body.channel : undefined,
        scenario,
      }),
    ]);
    const metricDifference = (
      current: number | null,
      next: number | null,
    ): number | null => current == null || next == null ? null : next - current;
    const difference = {
      breakEvenMonthlyNet: metricDifference(
        actual.metrics.breakEvenMonthlyNet,
        simulated.metrics.breakEvenMonthlyNet,
      ),
      minimumDailySalesNet: metricDifference(
        actual.metrics.minimumDailySalesNet,
        simulated.metrics.minimumDailySalesNet,
      ),
      requiredDailyTickets: metricDifference(
        actual.metrics.requiredDailyTickets,
        simulated.metrics.requiredDailyTickets,
      ),
      estimatedProfitPeriod: metricDifference(
        actual.metrics.estimatedProfitPeriod,
        simulated.metrics.estimatedProfitPeriod,
      ),
    };
    res.json({ actual, simulated, difference, persistent: false });
  },
);

// ── GET /admin/profitability/reports ─────────────────────────────────────────
router.get(
  "/admin/profitability/reports",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { from, to } = req.query as { from?: string; to?: string };
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 86400_000);

    // All active products with their recipe costs
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true))
      .orderBy(asc(productsTable.name));

    const ranked = await Promise.all(
      products.map(async (p) => {
        const { totalCost } = await computeProductCost(p.id);
        const { basePrice, marginPct, foodCostPct } = computeMetrics(
          p.price,
          p.taxRate,
          totalCost,
        );
        return {
          id: p.id,
          name: p.name,
          categoryName: p.categoryName,
          pvp: parseFloat(p.price).toFixed(2),
          totalCost: totalCost.toFixed(4),
          basePrice: basePrice.toFixed(4),
          marginPct: parseFloat(marginPct.toFixed(2)),
          foodCostPct: parseFloat(foodCostPct.toFixed(2)),
          unitCost: totalCost,
          taxRate: p.taxRate,
        };
      }),
    );

    // Top/bottom 5
    const sorted = [...ranked].sort((a, b) => b.marginPct - a.marginPct);
    const mostProfitable = sorted.slice(0, 5);
    const leastProfitable = [...sorted].reverse().slice(0, 5);

    // High food cost
    const highFoodCost = ranked
      .filter((p) => p.foodCostPct > 35)
      .sort((a, b) => b.foodCostPct - a.foodCostPct);

    const rankedCostById = new Map(ranked.map((product) => [product.id, product.unitCost]));
    const economicData = await loadProjectedEconomicActivity({
      from: fromDate,
      to: toDate,
      channel,
      currentCostByProduct: rankedCostById,
    });
    const recognisedSalesRows = economicData.rows;

    const soldByProduct = new Map<string, {
      units: number;
      grossSales: number;
      netSales: number;
      cogs: number;
      snapshotCogs: number;
      channels: Map<string, { units: number; netSales: number }>;
    }>();
    for (const sale of recognisedSalesRows) {
      const quantity = sale.quantity ?? 0;
      const current = soldByProduct.get(sale.productId) ?? {
        units: 0,
        grossSales: 0,
        netSales: 0,
        cogs: 0,
        snapshotCogs: 0,
        channels: new Map(),
      };
      current.units += quantity;
      current.grossSales += sale.recognisedGross;
      current.netSales += sale.recognisedNet;
      current.cogs += sale.cogs;
      if (sale.cogsSource === "stock_snapshot") current.snapshotCogs += sale.cogs;
      const channelSales = current.channels.get(sale.effectiveChannel) ?? { units: 0, netSales: 0 };
      channelSales.units += quantity;
      channelSales.netSales += sale.recognisedNet;
      current.channels.set(sale.effectiveChannel, channelSales);
      soldByProduct.set(sale.productId, current);
    }

    const expenses = await db.select().from(operatingExpensesTable)
      .where(eq(operatingExpensesTable.active, true));
    const [settings] = await db.select().from(profitabilitySettingsTable)
      .where(eq(profitabilitySettingsTable.id, "global"));
    const monthlyOperatingCost = expenses.reduce(
      (total, expense) => total + monthlyExpenseAmount(expense),
      0,
    );
    const periodDays = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 86_400_000);
    const periodOperatingCost = monthlyOperatingCost * periodDays / 30.4375;
    const totalRevenue = Array.from(soldByProduct.values())
      .reduce((total, sale) => total + sale.netSales, 0);
    const totalUnits = Array.from(soldByProduct.values())
      .reduce((total, sale) => total + sale.units, 0);
    const allocationMethod = (settings?.allocationMethod ?? "none") as "none" | "revenue" | "units";
    const activeCommissions = await db.select().from(channelCommissionsTable)
      .where(eq(channelCommissionsTable.active, true));
    const commissionByChannel = new Map(
      activeCommissions.map((commission) => [commission.channel, commission]),
    );

    const salesProducts = await Promise.all(ranked
      .filter((product) => soldByProduct.has(product.id))
      .map(async (product) => {
        const sale = soldByProduct.get(product.id)!;
        let commissions = 0;
        for (const [saleChannel, values] of sale.channels) {
          const commission = commissionByChannel.get(saleChannel);
          commissions += values.netSales * parseFloat(commission?.percent ?? "0") / 100
            + values.units * parseFloat(commission?.fixedAmount ?? "0");
        }
        const cogs = sale.cogs;
        const contribution = sale.netSales - cogs - commissions;
        const allocatedOperatingCost = allocateOperatingCost({
          totalOperatingCost: periodOperatingCost,
          method: allocationMethod,
          productRevenue: sale.netSales,
          totalRevenue,
          productUnits: sale.units,
          totalUnits,
        });
        return {
          ...product,
          unitsSold: sale.units,
          sales: sale.grossSales,
          netSales: sale.netSales,
          cogs,
          cogsSnapshotCoveragePct: Math.abs(cogs) > Number.EPSILON
            ? Math.abs(sale.snapshotCogs) / Math.abs(cogs) * 100
            : 100,
          commissions,
          contribution,
          allocatedOperatingCost,
          estimatedProfit: contribution - allocatedOperatingCost,
        };
      }));

    const totalCogs = salesProducts.reduce((total, product) => total + product.cogs, 0);
    const snapshotCogs = Array.from(soldByProduct.values())
      .reduce((total, product) => total + product.snapshotCogs, 0);
    const totalContribution = salesProducts.reduce((total, product) => total + product.contribution, 0);
    const avgFoodCostPct = Math.abs(totalRevenue) > Number.EPSILON
      ? totalCogs / totalRevenue * 100
      : 0;
    const avgMarginPct = Math.abs(totalRevenue) > Number.EPSILON
      ? totalContribution / totalRevenue * 100
      : 0;
    const soldAtLoss = salesProducts.filter((product) => product.contribution < 0);
    const topContribution = [...salesProducts]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5);
    const rankedById = new Map(ranked.map((product) => [product.id, product]));
    const dailyMap = new Map<string, { sales: number; netSales: number; cogs: number; contribution: number }>();
    for (const sale of recognisedSalesRows) {
      const product = rankedById.get(sale.productId);
      if (!product) continue;
      const day = sale.createdAt.toISOString().slice(0, 10);
      const quantity = sale.quantity ?? 0;
      const commission = commissionByChannel.get(sale.effectiveChannel);
      const commissionCost = sale.recognisedNet * parseFloat(commission?.percent ?? "0") / 100
        + quantity * parseFloat(commission?.fixedAmount ?? "0");
      const current = dailyMap.get(day) ?? { sales: 0, netSales: 0, cogs: 0, contribution: 0 };
      current.sales += sale.recognisedGross;
      current.netSales += sale.recognisedNet;
      current.cogs += sale.cogs;
      current.contribution += sale.recognisedNet - sale.cogs - commissionCost;
      dailyMap.set(day, current);
    }
    const marginEvolution = Array.from(dailyMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({
        date,
        ...values,
        marginPct: Math.abs(values.netSales) > Number.EPSILON
          ? values.contribution / values.netSales * 100
          : 0,
      }));
    const costEvolution = await db.select({
      ingredientId: ingredientCostHistoryTable.ingredientId,
      previousCost: ingredientCostHistoryTable.previousCost,
      newCost: ingredientCostHistoryTable.newCost,
      createdAt: ingredientCostHistoryTable.createdAt,
    }).from(ingredientCostHistoryTable)
      .where(and(
        gte(ingredientCostHistoryTable.createdAt, fromDate),
        lte(ingredientCostHistoryTable.createdAt, toDate),
      ))
      .orderBy(asc(ingredientCostHistoryTable.createdAt));

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      avgFoodCostPct: avgFoodCostPct.toFixed(2),
      avgMarginPct: avgMarginPct.toFixed(2),
      sales: salesProducts.reduce((total, product) => total + product.sales, 0).toFixed(2),
      netSales: totalRevenue.toFixed(2),
      costOfGoodsSold: totalCogs.toFixed(2),
      historicalCogsCoveragePct: (
        Math.abs(totalCogs) > Number.EPSILON
          ? Math.abs(snapshotCogs) / Math.abs(totalCogs) * 100
          : 100
      ).toFixed(2),
      revenueRecognition: "fiscal_ticket",
      revenueAdjustments: "invitations_discounts_voids_refunds_event_dated",
      contributionMargin: totalContribution.toFixed(2),
      operatingCost: periodOperatingCost.toFixed(2),
      allocationMethod,
      estimatedProfit: (totalContribution - (allocationMethod === "none" ? 0 : periodOperatingCost)).toFixed(2),
      soldAtLoss,
      topContribution,
      salesProducts,
      marginEvolution,
      costEvolution,
      mostProfitable,
      leastProfitable,
      highFoodCost,
      consumedByIngredient: {},
    });
  },
);

// ── GET /admin/cost-history ───────────────────────────────────────────────────
router.get(
  "/admin/cost-history",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      ingredientId,
      limit = "50",
    } = req.query as { ingredientId?: string; limit?: string };

    let query = db
      .select({
        id: ingredientCostHistoryTable.id,
        ingredientId: ingredientCostHistoryTable.ingredientId,
        ingredientName: ingredientsTable.name,
        previousCost: ingredientCostHistoryTable.previousCost,
        newCost: ingredientCostHistoryTable.newCost,
        supplierId: ingredientCostHistoryTable.supplierId,
        supplierName: ingredientCostHistoryTable.supplierName,
        reason: ingredientCostHistoryTable.reason,
        source: ingredientCostHistoryTable.source,
        sourceReference: ingredientCostHistoryTable.sourceReference,
        employeeId: ingredientCostHistoryTable.employeeId,
        createdAt: ingredientCostHistoryTable.createdAt,
      })
      .from(ingredientCostHistoryTable)
      .innerJoin(
        ingredientsTable,
        eq(ingredientCostHistoryTable.ingredientId, ingredientsTable.id),
      )
      .$dynamic();

    if (ingredientId) {
      query = query.where(
        eq(ingredientCostHistoryTable.ingredientId, ingredientId),
      );
    }

    const rows = await query
      .orderBy(desc(ingredientCostHistoryTable.createdAt))
      .limit(Math.min(parseInt(limit), 500));

    res.json(rows);
  },
);

// ── GET /admin/cost-alerts ────────────────────────────────────────────────────
router.get(
  "/admin/cost-alerts",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
      })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true));

    const alerts: any[] = [];
    const channel = typeof req.query.channel === "string" ? req.query.channel : "tpv";

    for (const p of products) {
      const { totalCost } = await computeProductCost(p.id);
      const context = await getProfitabilityContext(p.id, p.categoryId, channel);
      const metrics = calculateProfitability({
        pvp: parseFloat(p.price),
        taxRate: p.taxRate,
        productCost: totalCost,
        commissionPercent: context.commissionPercent,
        commissionFixed: context.commissionFixed,
      });
      if (metrics.netPrice === 0) continue;
      const status = profitabilityStatus(
        metrics.contribution,
        metrics.contributionPct,
        context.targetMarginPct,
        context.warningGapPct,
      );
      if (status !== "green") {
        alerts.push({
          type: status === "orange" ? "review" : "margin_low",
          productId: p.id,
          productName: p.name,
          categoryName: p.categoryName,
          metric: "marginPct",
          value: metrics.contributionPct.toFixed(2),
          threshold: context.targetMarginPct,
          pvp: parseFloat(p.price).toFixed(2),
          totalCost: totalCost.toFixed(4),
          contribution: metrics.contribution.toFixed(4),
          commission: metrics.commission.toFixed(4),
          status,
          channel,
        });
      }
    }

    res.json(alerts);
  },
);

// ── POST /admin/price-simulator ───────────────────────────────────────────────
router.post(
  "/admin/price-simulator",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      productId,
      targetMarginPct,
      maxFoodCostPct,
      channel = "tpv",
      roundTo = 0.05,
    } = req.body as {
      productId: string;
      targetMarginPct?: number;
      maxFoodCostPct?: number;
      roundTo?: number;
      channel?: string;
    };

    if (!productId) {
      res.status(400).json({ error: "productId es obligatorio" });
      return;
    }

    const [product] = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        taxRate: productsTable.taxRate,
        categoryId: productsTable.categoryId,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const { totalCost } = await computeProductCost(productId);
    const context = await getProfitabilityContext(product.id, product.categoryId, channel);
    const current = calculateProfitability({
      pvp: parseFloat(product.price),
      taxRate: product.taxRate,
      productCost: totalCost,
      commissionPercent: context.commissionPercent,
      commissionFixed: context.commissionFixed,
    });

    const vatMultiplier = 1 + product.taxRate / 100;
    let recommendedBase: number | null = null;

    // Compute recommended base price from desired margin
    if (targetMarginPct != null && targetMarginPct > 0 && targetMarginPct < 100) {
      const recommended = recommendedPvp({
        productCost: totalCost,
        targetMarginPct,
        taxRate: product.taxRate,
        commissionPercent: context.commissionPercent,
        commissionFixed: context.commissionFixed,
      });
      recommendedBase = recommended == null ? null : recommended / vatMultiplier;
    }
    // Compute recommended base price from max food cost %
    else if (maxFoodCostPct != null && maxFoodCostPct > 0 && maxFoodCostPct < 100) {
      recommendedBase = totalCost / (maxFoodCostPct / 100);
    }

    let recommendedPriceValue: number | null = null;
    let roundedOptions: { price: string; marginPct: string; foodCostPct: string }[] = [];

    if (recommendedBase !== null) {
      recommendedPriceValue = recommendedBase * vatMultiplier;

      // Generate rounded options around the recommended price
      const step = roundTo > 0 ? roundTo : 0.05;
      const candidates = [-2, -1, 0, 1, 2].map((offset) => {
        const rounded = Math.ceil(recommendedPriceValue! / step + offset) * step;
        const roundedMetrics = calculateProfitability({
          pvp: rounded,
          taxRate: product.taxRate,
          productCost: totalCost,
          commissionPercent: context.commissionPercent,
          commissionFixed: context.commissionFixed,
        });
        return {
          price: rounded.toFixed(2),
          marginPct: roundedMetrics.contributionPct.toFixed(2),
          foodCostPct: roundedMetrics.foodCostPct.toFixed(2),
        };
      });
      // Deduplicate
      roundedOptions = candidates.filter(
        (c, i, arr) => arr.findIndex((x) => x.price === c.price) === i,
      );
    }

    res.json({
      productId: product.id,
      productName: product.name,
      taxRate: product.taxRate,
      currentPrice: current.pvp.toFixed(2),
      currentBasePrice: current.netPrice.toFixed(4),
      currentTotalCost: totalCost.toFixed(4),
      currentMarginPct: current.contributionPct.toFixed(2),
      currentFoodCostPct: current.foodCostPct.toFixed(2),
      currentCommission: current.commission.toFixed(4),
      channel,
      recommendedPrice: recommendedPriceValue ? recommendedPriceValue.toFixed(2) : null,
      recommendedBase: recommendedBase ? recommendedBase.toFixed(4) : null,
      roundedOptions,
      inputTargetMarginPct: targetMarginPct ?? null,
      inputMaxFoodCostPct: maxFoodCostPct ?? null,
    });
  },
);

// ── GET/PATCH /admin/profitability/config ────────────────────────────────────
router.get(
  "/admin/profitability/config",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const [settings] = await db.select().from(profitabilitySettingsTable)
      .where(eq(profitabilitySettingsTable.id, "global"));
    const expenses = await db.select().from(operatingExpensesTable)
      .orderBy(asc(operatingExpensesTable.name));
    const commissions = await db.select().from(channelCommissionsTable)
      .orderBy(asc(channelCommissionsTable.channel));
    const targets = await db.select().from(profitabilityTargetsTable)
      .orderBy(desc(profitabilityTargetsTable.updatedAt));
    res.json({
      settings: settings ?? {
        id: "global",
        defaultTargetMarginPct: String(DEFAULT_TARGET_MARGIN),
        warningGapPct: String(DEFAULT_WARNING_GAP),
        allocationMethod: "none",
      },
      expenses,
      commissions,
      targets,
      targetPriority: [
        "product+channel",
        "product",
        "category+channel",
        "category",
        "global+channel",
        "global",
        "settings.default",
      ],
    });
  },
);

router.patch(
  "/admin/profitability/config",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { defaultTargetMarginPct, warningGapPct, allocationMethod } = req.body as {
      defaultTargetMarginPct?: number;
      warningGapPct?: number;
      allocationMethod?: "none" | "revenue" | "units";
    };
    if (allocationMethod && !["none", "revenue", "units"].includes(allocationMethod)) {
      res.status(400).json({ error: "Método de reparto no válido" });
      return;
    }
    const values = {
      id: "global",
      ...(defaultTargetMarginPct != null
        ? { defaultTargetMarginPct: String(defaultTargetMarginPct) }
        : {}),
      ...(warningGapPct != null ? { warningGapPct: String(warningGapPct) } : {}),
      ...(allocationMethod ? { allocationMethod } : {}),
      updatedBy: req.user?.id ?? null,
      updatedAt: new Date(),
    };
    const [settings] = await db.insert(profitabilitySettingsTable)
      .values(values)
      .onConflictDoUpdate({
        target: profitabilitySettingsTable.id,
        set: values,
      })
      .returning();
    res.json(settings);
  },
);

router.post(
  "/admin/profitability/expenses",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { name, category, costType = "fixed", frequency = "monthly", periodMonths = 1, amount } = req.body;
    if (!name?.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      res.status(400).json({ error: "Nombre e importe válido son obligatorios" });
      return;
    }
    const [expense] = await db.insert(operatingExpensesTable).values({
      name: name.trim(),
      category,
      costType,
      frequency,
      periodMonths: Math.max(1, Number(periodMonths)),
      amount: String(amount),
      createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(expense);
  },
);

router.delete(
  "/admin/profitability/expenses/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    await db.update(operatingExpensesTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(operatingExpensesTable.id, req.params.id as string));
    res.json({ ok: true });
  },
);

router.put(
  "/admin/profitability/commissions/:channel",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const channel = req.params.channel as string;
    const { name = channel, percent = 0, fixedAmount = 0, active = true } = req.body;
    if (Number(percent) < 0 || Number(percent) >= 100 || Number(fixedAmount) < 0) {
      res.status(400).json({ error: "Comisión no válida" });
      return;
    }
    const values = {
      channel,
      name,
      percent: String(percent),
      fixedAmount: String(fixedAmount),
      active: Boolean(active),
      updatedBy: req.user?.id ?? null,
      updatedAt: new Date(),
    };
    const [commission] = await db.insert(channelCommissionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: channelCommissionsTable.channel,
        set: values,
      })
      .returning();
    res.json(commission);
  },
);

router.post(
  "/admin/profitability/targets",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { scopeType = "global", categoryId, productId, channel, targetMarginPct } = req.body;
    if (!["global", "category", "product"].includes(scopeType)
      || Number(targetMarginPct) < 0 || Number(targetMarginPct) >= 100) {
      res.status(400).json({ error: "Objetivo no válido" });
      return;
    }
    const normalizedCategoryId = scopeType === "category" ? categoryId : null;
    const normalizedProductId = scopeType === "product" ? productId : null;
    const normalizedChannel = channel || null;
    const conditions = and(
      eq(profitabilityTargetsTable.scopeType, scopeType),
      normalizedCategoryId
        ? eq(profitabilityTargetsTable.categoryId, normalizedCategoryId)
        : isNull(profitabilityTargetsTable.categoryId),
      normalizedProductId
        ? eq(profitabilityTargetsTable.productId, normalizedProductId)
        : isNull(profitabilityTargetsTable.productId),
      normalizedChannel
        ? eq(profitabilityTargetsTable.channel, normalizedChannel)
        : isNull(profitabilityTargetsTable.channel),
    );
    const [existing] = await db.select().from(profitabilityTargetsTable).where(conditions);
    const values = {
      scopeType,
      categoryId: normalizedCategoryId,
      productId: normalizedProductId,
      channel: normalizedChannel,
      targetMarginPct: String(targetMarginPct),
      active: true,
      updatedBy: req.user?.id ?? null,
      updatedAt: new Date(),
    };
    const [target] = existing
      ? await db.update(profitabilityTargetsTable)
          .set(values)
          .where(eq(profitabilityTargetsTable.id, existing.id))
          .returning()
      : await db.insert(profitabilityTargetsTable).values(values).returning();
    res.status(201).json(target);
  },
);

// Scenario calculations are read-only: no mutation is performed here.
router.post(
  "/admin/profitability/scenario",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const {
      ingredientChanges = [],
      operatingExpensePercent = 0,
      channel = "tpv",
      commissionPercent,
      commissionFixed,
    } = req.body as {
      ingredientChanges?: { ingredientId: string; percent: number }[];
      operatingExpensePercent?: number;
      channel?: string;
      commissionPercent?: number;
      commissionFixed?: number;
    };
    const multipliers = new Map(
      ingredientChanges.map((change) => [
        change.ingredientId,
        1 + Number(change.percent) / 100,
      ]),
    );
    const products = await db.select({
      id: productsTable.id,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      price: productsTable.price,
      taxRate: productsTable.taxRate,
    }).from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.active, true));
    const results = [];
    for (const product of products) {
      const oldCost = (await computeProductCost(product.id)).totalCost;
      const newCost = (await computeProductCost(product.id, null, multipliers)).totalCost;
      const context = await getProfitabilityContext(product.id, product.categoryId, channel);
      const percent = commissionPercent ?? context.commissionPercent;
      const fixed = commissionFixed ?? context.commissionFixed;
      if (Math.abs(newCost - oldCost) < 0.000001
        && commissionPercent == null && commissionFixed == null) continue;
      const before = calculateProfitability({
        pvp: parseFloat(product.price),
        taxRate: product.taxRate,
        productCost: oldCost,
        commissionPercent: context.commissionPercent,
        commissionFixed: context.commissionFixed,
      });
      const after = calculateProfitability({
        pvp: parseFloat(product.price),
        taxRate: product.taxRate,
        productCost: newCost,
        commissionPercent: percent,
        commissionFixed: fixed,
      });
      const recommended = recommendedPvp({
        productCost: newCost,
        targetMarginPct: context.targetMarginPct,
        taxRate: product.taxRate,
        commissionPercent: percent,
        commissionFixed: fixed,
      });
      results.push({
        productId: product.id,
        productName: product.name,
        categoryName: product.categoryName,
        oldCost: oldCost.toFixed(4),
        newCost: newCost.toFixed(4),
        oldMargin: before.contribution.toFixed(4),
        newMargin: after.contribution.toFixed(4),
        oldMarginPct: before.contributionPct.toFixed(2),
        newMarginPct: after.contributionPct.toFixed(2),
        currentPrice: product.price,
        recommendedPrice: recommended?.toFixed(2) ?? null,
      });
    }
    const expenses = await db.select().from(operatingExpensesTable)
      .where(eq(operatingExpensesTable.active, true));
    const oldMonthlyOperatingCost = expenses.reduce(
      (total, expense) => total + monthlyExpenseAmount(expense),
      0,
    );
    res.json({
      channel,
      products: results,
      oldMonthlyOperatingCost: oldMonthlyOperatingCost.toFixed(2),
      newMonthlyOperatingCost: (oldMonthlyOperatingCost * (1 + operatingExpensePercent / 100)).toFixed(2),
      operatingCostAllocationNote: "El impacto por producto se reparte en informes con el método configurado y las ventas reales del periodo.",
      persisted: false,
    });
  },
);

router.post(
  "/admin/profitability/price-proposals",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { productId, proposedPrice, reason } = req.body;
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId));
    if (!product || !reason?.trim() || Number(proposedPrice) < 0) {
      res.status(400).json({ error: "Producto, precio y motivo son obligatorios" });
      return;
    }
    const [proposal] = await db.insert(priceChangeProposalsTable).values({
      productId,
      oldPrice: product.price,
      proposedPrice: String(proposedPrice),
      reason: reason.trim(),
      requestedBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(proposal);
  },
);

router.get(
  "/admin/profitability/price-proposals",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const proposals = await db.select({
      id: priceChangeProposalsTable.id,
      productId: priceChangeProposalsTable.productId,
      productName: productsTable.name,
      oldPrice: priceChangeProposalsTable.oldPrice,
      proposedPrice: priceChangeProposalsTable.proposedPrice,
      reason: priceChangeProposalsTable.reason,
      status: priceChangeProposalsTable.status,
      requestedBy: priceChangeProposalsTable.requestedBy,
      reviewedBy: priceChangeProposalsTable.reviewedBy,
      createdAt: priceChangeProposalsTable.createdAt,
      reviewedAt: priceChangeProposalsTable.reviewedAt,
      appliedAt: priceChangeProposalsTable.appliedAt,
    }).from(priceChangeProposalsTable)
      .innerJoin(productsTable, eq(priceChangeProposalsTable.productId, productsTable.id))
      .orderBy(desc(priceChangeProposalsTable.createdAt));
    res.json(proposals);
  },
);

router.post(
  "/admin/profitability/price-proposals/:id/approve",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    try {
      const result = await db.transaction(async (tx) => {
        const [proposal] = await tx.select().from(priceChangeProposalsTable)
          .where(eq(priceChangeProposalsTable.id, req.params.id as string));
        if (!proposal || proposal.status !== "pending") throw new Error("proposal_not_pending");
        const [updatedProduct] = await tx.update(productsTable)
          .set({ price: proposal.proposedPrice })
          .where(and(
            eq(productsTable.id, proposal.productId),
            eq(productsTable.price, proposal.oldPrice),
          ))
          .returning();
        if (!updatedProduct) throw new Error("price_changed_concurrently");
        const [updatedProposal] = await tx.update(priceChangeProposalsTable)
          .set({
            status: "applied",
            reviewedBy: req.user?.id ?? null,
            reviewedAt: new Date(),
            appliedAt: new Date(),
          })
          .where(and(
            eq(priceChangeProposalsTable.id, proposal.id),
            eq(priceChangeProposalsTable.status, "pending"),
          ))
          .returning();
        if (!updatedProposal) throw new Error("proposal_changed_concurrently");
        return { proposal: updatedProposal, product: updatedProduct };
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "conflict";
      res.status(409).json({ error: message });
    }
  },
);

router.post(
  "/admin/profitability/price-proposals/:id/reject",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const [proposal] = await db.update(priceChangeProposalsTable)
      .set({
        status: "rejected",
        reviewedBy: req.user?.id ?? null,
        reviewedAt: new Date(),
      })
      .where(and(
        eq(priceChangeProposalsTable.id, req.params.id as string),
        eq(priceChangeProposalsTable.status, "pending"),
      ))
      .returning();
    if (!proposal) {
      res.status(409).json({ error: "proposal_not_pending" });
      return;
    }
    res.json(proposal);
  },
);

export default router;
export { computeProductCost, computeMetrics };

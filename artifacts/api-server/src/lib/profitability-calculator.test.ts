import { describe, expect, it } from "vitest";
import {
  allocateOperatingCost,
  calculateProfitability,
  calculateRecipeLineCost,
  convertQuantity,
  profitabilityStatus,
  recognisedLineRevenue,
  recommendedPvp,
  resolveTargetMargin,
} from "./profitability-calculator";

describe("profitability calculator", () => {
  it("converts compatible mass, volume and count units", () => {
    expect(convertQuantity(500, "g", "kg")).toBe(0.5);
    expect(convertQuantity(250, "ml", "l")).toBe(0.25);
    expect(convertQuantity(2, "docena", "ud")).toBe(24);
  });

  it("rejects incompatible unit conversions", () => {
    expect(() => convertQuantity(1, "kg", "l")).toThrow("Conversión incompatible");
  });

  it("normalizes purchase packs and separates waste cost", () => {
    const result = calculateRecipeLineCost({
      purchaseCost: 24,
      conversionFactor: 12,
      quantity: 500,
      recipeUnit: "g",
      consumptionUnit: "kg",
      wastePercent: 10,
    });
    expect(result.unitCost).toBe(2);
    expect(result.ingredientCost).toBe(1);
    expect(result.wasteCost).toBeCloseTo(0.1);
    expect(result.effectiveCost).toBeCloseTo(1.1);
  });

  it("normalizes direct ingredients and cached subrecipes to their cost units", () => {
    const flour = calculateRecipeLineCost({
      purchaseCost: 4,
      conversionFactor: 1,
      quantity: 500,
      recipeUnit: "g",
      consumptionUnit: "kg",
      wastePercent: 10,
    });
    const oilSubrecipe = calculateRecipeLineCost({
      purchaseCost: 2,
      conversionFactor: 1,
      quantity: 250,
      recipeUnit: "ml",
      consumptionUnit: "l",
      wastePercent: 0,
    });

    expect(flour.effectiveCost).toBeCloseTo(2.2);
    expect(oilSubrecipe.effectiveCost).toBeCloseTo(0.5);
    expect(flour.effectiveCost + oilSubrecipe.effectiveCost).toBeCloseTo(2.7);
  });

  it("calculates food cost, commission and contribution over net sales", () => {
    const result = calculateProfitability({
      pvp: 11,
      taxRate: 10,
      productCost: 3,
      commissionPercent: 10,
      commissionFixed: 0.5,
    });
    expect(result.netPrice).toBeCloseTo(10);
    expect(result.foodCostPct).toBeCloseTo(30);
    expect(result.commission).toBeCloseTo(1.5);
    expect(result.contribution).toBeCloseTo(5.5);
    expect(result.contributionPct).toBeCloseTo(55);
  });

  it("handles zero price, zero cost and negative margin safely", () => {
    expect(calculateProfitability({ pvp: 0, taxRate: 10, productCost: 0 }).foodCostPct).toBe(0);
    expect(calculateProfitability({ pvp: 1, taxRate: 0, productCost: 2 }).contribution).toBe(-1);
  });

  it("calculates recommended price including commissions and indirect costs", () => {
    const pvp = recommendedPvp({
      productCost: 3,
      targetMarginPct: 50,
      taxRate: 10,
      commissionPercent: 10,
      commissionFixed: 0.5,
      allocatedOperatingCost: 0.5,
    });
    expect(pvp).toBeCloseTo(11);
  });

  it("returns no recommendation for an impossible target", () => {
    expect(recommendedPvp({
      productCost: 1,
      targetMarginPct: 80,
      taxRate: 10,
      commissionPercent: 25,
    })).toBeNull();
  });

  it("uses configurable traffic-light thresholds", () => {
    expect(profitabilityStatus(-1, -10, 60, 10)).toBe("red");
    expect(profitabilityStatus(4, 52, 60, 10)).toBe("orange");
    expect(profitabilityStatus(5, 60, 60, 10)).toBe("green");
  });

  it("allocates operating costs by visible methods", () => {
    expect(allocateOperatingCost({
      totalOperatingCost: 1000,
      method: "revenue",
      productRevenue: 100,
      totalRevenue: 1000,
      productUnits: 0,
      totalUnits: 0,
    })).toBe(100);
    expect(allocateOperatingCost({
      totalOperatingCost: 1000,
      method: "units",
      productRevenue: 0,
      totalRevenue: 0,
      productUnits: 5,
      totalUnits: 100,
    })).toBe(50);
    expect(allocateOperatingCost({
      totalOperatingCost: 1000,
      method: "none",
      productRevenue: 100,
      totalRevenue: 1000,
      productUnits: 5,
      totalUnits: 100,
    })).toBe(0);
  });

  it("recognises discounted revenue without counting invitations", () => {
    expect(recognisedLineRevenue({
      gross: 20,
      lineDiscount: 2,
      orderDiscount: 9,
      orderGross: 90,
    })).toBe(16);
    expect(recognisedLineRevenue({
      gross: 20,
      isInvitation: true,
    })).toBe(0);
  });

  it("matches the deterministic FoodCost certification case", () => {
    const recipe = calculateRecipeLineCost({
      purchaseCost: 24,
      conversionFactor: 12,
      quantity: 500,
      recipeUnit: "g",
      consumptionUnit: "kg",
      wastePercent: 10,
    });
    const metrics = calculateProfitability({
      pvp: 11,
      taxRate: 10,
      productCost: recipe.effectiveCost,
      commissionPercent: 10,
      commissionFixed: 0.5,
      allocatedOperatingCost: 0.5,
    });
    const recommended = recommendedPvp({
      productCost: recipe.effectiveCost,
      targetMarginPct: 50,
      taxRate: 10,
      commissionPercent: 10,
      commissionFixed: 0.5,
      allocatedOperatingCost: 0.5,
    });

    expect(recipe.ingredientCost).toBeCloseTo(1);
    expect(recipe.wasteCost).toBeCloseTo(0.1);
    expect(recipe.effectiveCost).toBeCloseTo(1.1);
    expect(metrics.foodCostPct).toBeCloseTo(11);
    expect(metrics.commission).toBeCloseTo(1.5);
    expect(metrics.contribution).toBeCloseTo(7.4);
    expect(metrics.contributionPct).toBeCloseTo(74);
    expect(metrics.estimatedProfit).toBeCloseTo(6.9);
    expect(metrics.estimatedProfitPct).toBeCloseTo(69);
    expect(recommended).toBeCloseTo(5.775);
    expect(profitabilityStatus(metrics.contribution, metrics.contributionPct, 70, 10)).toBe("green");
  });

  it("resolves margin targets by documented hierarchy", () => {
    const targets = [
      { scopeType: "global" as const, targetMarginPct: 55 },
      { scopeType: "global" as const, channel: "delivery", targetMarginPct: 56 },
      { scopeType: "category" as const, categoryId: "cat", targetMarginPct: 60 },
      { scopeType: "category" as const, categoryId: "cat", channel: "delivery", targetMarginPct: 62 },
      { scopeType: "product" as const, productId: "product", targetMarginPct: 65 },
      { scopeType: "product" as const, productId: "product", channel: "delivery", targetMarginPct: 68 },
    ];
    expect(resolveTargetMargin({
      productId: "product",
      categoryId: "cat",
      channel: "delivery",
      defaultTargetMarginPct: 50,
      targets,
    })).toBe(68);
    expect(resolveTargetMargin({
      productId: "other",
      categoryId: "cat",
      channel: "delivery",
      defaultTargetMarginPct: 50,
      targets,
    })).toBe(62);
    expect(resolveTargetMargin({
      productId: "other",
      categoryId: "other",
      channel: "tpv",
      defaultTargetMarginPct: 50,
      targets,
    })).toBe(55);
  });
});

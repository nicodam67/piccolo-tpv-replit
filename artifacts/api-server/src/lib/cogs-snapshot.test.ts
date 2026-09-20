import { describe, expect, it } from "vitest";
import {
  expandRecipeConsumption,
  type IngredientCostBasis,
  type SubrecipeDefinition,
} from "./cogs-snapshot";

function ingredient(
  id: string,
  consumptionUnit: string,
  averageCost: number,
  overrides: Partial<IngredientCostBasis> = {},
): IngredientCostBasis {
  return {
    id,
    consumptionUnit,
    averageCost,
    purchaseCost: averageCost,
    conversionFactor: 1,
    ...overrides,
  };
}

describe("historical COGS snapshot expansion", () => {
  it("normalizes kg/g and applies sold quantity plus waste", () => {
    const result = expandRecipeConsumption({
      lines: [{ ingredientId: "flour", quantity: 500, unit: "g", wastePercent: 10 }],
      orderQuantity: 2,
      ingredients: new Map([["flour", ingredient("flour", "kg", 2)]]),
      subrecipes: new Map(),
    });
    expect(result).toEqual([{ ingredientId: "flour", quantity: 1.1, unitCost: 2 }]);
    expect(result[0]!.quantity * result[0]!.unitCost).toBeCloseTo(2.2);
  });

  it("normalizes litres/millilitres and count units", () => {
    const result = expandRecipeConsumption({
      lines: [
        { ingredientId: "oil", quantity: 250, unit: "ml" },
        { ingredientId: "egg", quantity: 0.5, unit: "docena" },
      ],
      orderQuantity: 2,
      ingredients: new Map([
        ["oil", ingredient("oil", "l", 4)],
        ["egg", ingredient("egg", "ud", 0.25)],
      ]),
      subrecipes: new Map(),
    });
    expect(result).toEqual([
      { ingredientId: "oil", quantity: 0.5, unitCost: 4 },
      { ingredientId: "egg", quantity: 12, unitCost: 0.25 },
    ]);
  });

  it("uses purchase cost divided by conversion factor when average cost is unavailable", () => {
    const result = expandRecipeConsumption({
      lines: [{ ingredientId: "cheese", quantity: 250, unit: "g" }],
      orderQuantity: 1,
      ingredients: new Map([[
        "cheese",
        ingredient("cheese", "kg", 0, { purchaseCost: 20, conversionFactor: 2 }),
      ]]),
      subrecipes: new Map(),
    });
    expect(result).toEqual([{ ingredientId: "cheese", quantity: 0.25, unitCost: 10 }]);
  });

  it("expands a subrecipe according to its yield", () => {
    const subrecipes = new Map<string, SubrecipeDefinition>([[
      "sauce",
      {
        id: "sauce",
        unit: "kg",
        yieldQuantity: 1,
        items: [{ ingredientId: "tomato", quantity: 2, unit: "kg" }],
      },
    ]]);
    const result = expandRecipeConsumption({
      lines: [{ subrecipeId: "sauce", quantity: 250, unit: "g" }],
      orderQuantity: 2,
      ingredients: new Map([["tomato", ingredient("tomato", "kg", 3)]]),
      subrecipes,
    });
    expect(result).toEqual([{ ingredientId: "tomato", quantity: 1, unitCost: 3 }]);
  });

  it("supports recursive multi-level composition and detects cycles", () => {
    const ingredients = new Map([["flour", ingredient("flour", "kg", 1)]]);
    const subrecipes = new Map<string, SubrecipeDefinition>([
      ["dough", {
        id: "dough",
        unit: "kg",
        yieldQuantity: 2,
        items: [{ ingredientId: "flour", quantity: 1, unit: "kg" }],
      }],
      ["pizza-base", {
        id: "pizza-base",
        unit: "kg",
        yieldQuantity: 1,
        items: [{ subrecipeId: "dough", quantity: 1, unit: "kg" }],
      }],
    ]);
    expect(expandRecipeConsumption({
      lines: [{ subrecipeId: "pizza-base", quantity: 0.5, unit: "kg" }],
      orderQuantity: 2,
      ingredients,
      subrecipes,
    })).toEqual([{ ingredientId: "flour", quantity: 0.5, unitCost: 1 }]);

    subrecipes.get("dough")!.items = [{ subrecipeId: "pizza-base", quantity: 1, unit: "kg" }];
    expect(() => expandRecipeConsumption({
      lines: [{ subrecipeId: "pizza-base", quantity: 1, unit: "kg" }],
      orderQuantity: 1,
      ingredients,
      subrecipes,
    })).toThrow(/Referencia circular/);
  });

  it.each([
    {
      name: "missing subrecipe",
      lines: [{ subrecipeId: "missing", quantity: 1, unit: "kg" }],
      subrecipes: new Map<string, SubrecipeDefinition>(),
      error: /Subreceta inexistente/,
    },
    {
      name: "incompatible unit",
      lines: [{ ingredientId: "flour", quantity: 1, unit: "l" }],
      subrecipes: new Map<string, SubrecipeDefinition>(),
      error: /Conversión incompatible/,
    },
    {
      name: "invalid quantity",
      lines: [{ ingredientId: "flour", quantity: 0, unit: "kg" }],
      subrecipes: new Map<string, SubrecipeDefinition>(),
      error: /cantidad de receta/,
    },
    {
      name: "zero yield",
      lines: [{ subrecipeId: "broken", quantity: 1, unit: "kg" }],
      subrecipes: new Map<string, SubrecipeDefinition>([[
        "broken",
        { id: "broken", unit: "kg", yieldQuantity: 0, items: [] },
      ]]),
      error: /rendimiento/,
    },
    {
      name: "empty subrecipe",
      lines: [{ subrecipeId: "empty", quantity: 1, unit: "kg" }],
      subrecipes: new Map<string, SubrecipeDefinition>([[
        "empty",
        { id: "empty", unit: "kg", yieldQuantity: 1, items: [] },
      ]]),
      error: /sin composición/,
    },
  ])("rejects $name instead of silently snapshotting zero", ({ lines, subrecipes, error }) => {
    expect(() => expandRecipeConsumption({
      lines,
      orderQuantity: 1,
      ingredients: new Map([["flour", ingredient("flour", "kg", 1)]]),
      subrecipes,
    })).toThrow(error);
  });

  it("keeps recognised COGS immutable after a later ingredient price change", () => {
    const costBasis = ingredient("mozzarella", "kg", 8);
    const snapshot = expandRecipeConsumption({
      lines: [{ ingredientId: "mozzarella", quantity: 250, unit: "g" }],
      orderQuantity: 2,
      ingredients: new Map([["mozzarella", costBasis]]),
      subrecipes: new Map(),
    })[0]!;
    const recognisedCogs = snapshot.quantity * snapshot.unitCost;

    costBasis.averageCost = 12;
    expect(recognisedCogs).toBe(4);
    expect(snapshot.quantity * snapshot.unitCost).toBe(4);
  });
});

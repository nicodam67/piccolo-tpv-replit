import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    updateSets: [] as Record<string, unknown>[],
  };
  const chain = (result: unknown) => {
    const value: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "innerJoin", "where", "orderBy", "limit"]) {
      value[method] = () => value;
    }
    value.then = (
      resolve: (rows: unknown) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return value;
  };
  const db = {
    select: vi.fn(() => chain(state.selectResults.shift() ?? [])),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        state.updateSets.push(values);
        return { where: () => Promise.resolve([]) };
      },
    })),
  };
  return { state, db };
});

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mocks.db };
});

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("./allergens", () => ({
  recalculateProductAllergens: vi.fn(),
}));

const { default: recipesRouter, syncProductCost } = await import("./recipes");

const recipeLines = [
  {
    id: "flour-line",
    productId: "product-1",
    formatId: null,
    ingredientId: "flour",
    subrecipeId: null,
    quantity: "500.0000",
    unit: "g",
    wastePercent: "10.00",
    packagingCost: "0",
    additionalCost: "0",
    ingredientName: "Harina",
    ingredientUnit: "kg",
    ingredientCost: "4.0000",
    ingredientConsumptionUnit: "kg",
    ingredientConversionFactor: "1",
    subrecipeName: null,
    subrecipeUnit: null,
    subrecipeCost: null,
  },
  {
    id: "oil-subrecipe-line",
    productId: "product-1",
    formatId: null,
    ingredientId: null,
    subrecipeId: "oil-subrecipe",
    quantity: "250.0000",
    unit: "ml",
    wastePercent: "0",
    packagingCost: "0",
    additionalCost: "0",
    ingredientName: null,
    ingredientUnit: null,
    ingredientCost: null,
    ingredientConsumptionUnit: null,
    ingredientConversionFactor: null,
    subrecipeName: "Aceite preparado",
    subrecipeUnit: "l",
    subrecipeCost: "2.0000",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.selectResults = [];
  mocks.state.updateSets = [];
});

describe("recipe unit cost normalization", () => {
  it("persists 2.7000 for g→kg ingredient plus ml→l subrecipe", async () => {
    mocks.state.selectResults = [recipeLines];

    await syncProductCost("product-1");

    expect(mocks.state.updateSets).toContainEqual({ cost: "2.7000" });
  });

  it("returns normalized line and summary costs from the recipe endpoint", async () => {
    mocks.state.selectResults = [
      [{ id: "product-1", name: "Producto", price: "11.00", taxRate: 10 }],
      recipeLines,
    ];
    const app = express();
    app.use(recipesRouter);

    const response = await request(app).get("/admin/products/product-1/recipe");

    expect(response.status).toBe(200);
    expect(response.body.totalCost).toBe("2.7000");
    expect(response.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "flour-line", lineCost: "2.2000" }),
      expect.objectContaining({ id: "oil-subrecipe-line", lineCost: "0.5000" }),
    ]));
  });
});

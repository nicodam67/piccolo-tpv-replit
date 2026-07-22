import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown) => Promise<unknown>;
  } = { then: (resolve) => Promise.resolve(value).then(resolve) };
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

const {
  decimalToCents,
  loadQrMenuCatalogV1,
  safePublicImageUrl,
} = await import("./qr-menu-catalog");

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select
    .mockReturnValueOnce(makeChain([{
      id: "cat-1", name: "Entrantes", icon: null, color: null, sortOrder: 1,
      translations: { en: { name: "Starters" } },
    }]))
    .mockReturnValueOnce(makeChain([{ currency: "EUR" }]))
    .mockReturnValueOnce(makeChain([{
      id: "sub-1", categoryId: "cat-1", name: "Frios", sortOrder: 1,
    }]))
    .mockReturnValueOnce(makeChain([{
      id: "prod-1", categoryId: "cat-1", subcategoryId: "sub-1",
      name: "Ensalada", description: "Fresca", price: "12.30",
      halfPortionPrice: "7.05", outOfStock: true,
      allergens: "gluten, nuts,gluten", imageUrl: "https://cdn.example.com/a.jpg",
      isVegetariano: true, isVegano: false, isSinGluten: false, isPicante: false,
      sortOrder: 1, translations: { en: { name: "Salad" } },
      cost: "1.00", internalCode: "SECRET",
    }]))
    .mockReturnValueOnce(makeChain([{
      id: "fmt-1", productId: "prod-1", name: "Grande", price: "15.00", sortOrder: 1,
    }]));
});

describe("QR catalog mapping", () => {
  it("converts decimal money to integer cents without floating point", () => {
    expect(decimalToCents("12.30")).toBe(1230);
    expect(decimalToCents("0.05")).toBe(5);
    expect(() => decimalToCents("12.345")).toThrow();
  });

  it("allows only externally consumable HTTPS image URLs", () => {
    expect(safePublicImageUrl("https://cdn.example.com/a.jpg"))
      .toBe("https://cdn.example.com/a.jpg");
    expect(safePublicImageUrl("file:///tmp/a.jpg")).toBeNull();
    expect(safePublicImageUrl("https://user:pass@cdn.example.com/a.jpg")).toBeNull();
  });

  it("returns an ordered allowlisted snapshot", async () => {
    const result = await loadQrMenuCatalogV1();
    const product = result.categories[0]!.products[0]!;
    expect(result.availableLocales).toEqual(["en", "es"]);
    expect(product).toMatchObject({
      priceCents: 1230,
      halfPortionPriceCents: 705,
      visible: true,
      outOfStock: true,
      tags: ["vegetarian"],
      allergens: ["gluten", "nuts"],
      imageUrl: "https://cdn.example.com/a.jpg",
      updatedAt: null,
    });
    expect(product.name).toEqual({
      default: "Ensalada",
      translations: { en: "Salad" },
    });
    expect(product.description).toEqual({
      default: "Fresca",
      translations: {},
    });
    expect(product.formats[0]!.priceCents).toBe(1500);
    expect(product).not.toHaveProperty("cost");
    expect(product).not.toHaveProperty("internalCode");
    expect(product).not.toHaveProperty("taxRate");
  });
});

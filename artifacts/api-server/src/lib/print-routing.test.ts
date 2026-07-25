import { describe, expect, it } from "vitest";
import { resolvePrintersForItem } from "./print-dispatch";

type Printer = Parameters<typeof resolvePrintersForItem>[3][number];

function printer(
  id: string,
  type: string,
  active = true,
  isPrimary = true,
): Printer {
  return { id, type, active, isPrimary } as Printer;
}

const printers = [
  printer("kitchen-primary", "cocina"),
  printer("pizza-primary", "pizza"),
  printer("bar-primary", "barra"),
  printer("kitchen-secondary", "cocina", true, false),
  printer("inactive", "pizza", false),
];

describe("software-only printer routing", () => {
  it("prefers a product override over category and prep zone", async () => {
    const routing = new Map([
      ["product:product-1", ["bar-primary"]],
      ["category:category-1", ["pizza-primary"]],
    ]);
    const result = await resolvePrintersForItem(
      "product-1", "category-1", "cocina", printers, routing,
    );
    expect(result.map((row) => row.id)).toEqual(["bar-primary"]);
  });

  it("uses the category override when no product override exists", async () => {
    const routing = new Map([["category:category-1", ["pizza-primary"]]]);
    const result = await resolvePrintersForItem(
      "product-1", "category-1", "barra", printers, routing,
    );
    expect(result.map((row) => row.id)).toEqual(["pizza-primary"]);
  });

  it("filters inactive printers from explicit routes", async () => {
    const routing = new Map([["product:product-1", ["inactive", "pizza-primary"]]]);
    const result = await resolvePrintersForItem(
      "product-1", "category-1", "cocina", printers, routing,
    );
    expect(result.map((row) => row.id)).toEqual(["pizza-primary"]);
  });

  it("falls back to the active primary printer for the prep zone", async () => {
    const result = await resolvePrintersForItem(
      "product-1", "category-1", "pizza", printers, new Map(),
    );
    expect(result.map((row) => row.id)).toEqual(["pizza-primary"]);
  });

  it("uses the department printer order before the legacy type fallback", async () => {
    const result = await resolvePrintersForItem(
      "product-1",
      "category-1",
      "cocina",
      printers,
      new Map(),
      ["bar-primary", "kitchen-primary"],
    );
    expect(result.map((row) => row.id)).toEqual(["bar-primary", "kitchen-primary"]);
  });

  it("does not route an unknown department to an unrelated printer", async () => {
    const result = await resolvePrintersForItem(
      "product-1", "category-1", "unknown-zone", printers, new Map(),
    );
    expect(result).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  projectEconomicActivity,
  type EconomicAdjustment,
  type EconomicSaleLine,
} from "./economic-activity";

const saleDate = new Date("2026-09-01T12:00:00Z");
const refundDate = new Date("2026-09-02T12:00:00Z");
const from = new Date("2026-09-01T00:00:00Z");
const to = new Date("2026-09-30T23:59:59Z");

function sale(overrides: Partial<EconomicSaleLine> = {}): EconomicSaleLine {
  return {
    orderId: "order-1",
    orderItemId: "item-1",
    productId: "product-1",
    quantity: 2,
    recognisedGross: 22,
    recognisedNet: 20,
    cogs: 6,
    createdAt: saleDate,
    ...overrides,
  };
}

function adjustment(overrides: Partial<EconomicAdjustment> = {}): EconomicAdjustment {
  return {
    id: "void:void-1",
    orderId: "order-1",
    grossAmount: 22,
    occurredAt: refundDate,
    ...overrides,
  };
}

function totals(rows: ReturnType<typeof projectEconomicActivity>) {
  return rows.reduce(
    (sum, row) => ({
      gross: sum.gross + row.recognisedGross,
      net: sum.net + row.recognisedNet,
      units: sum.units + row.quantity,
      cogs: sum.cogs + row.cogs,
    }),
    { gross: 0, net: 0, units: 0, cogs: 0 },
  );
}

describe("economic activity projection", () => {
  it("keeps an unadjusted sale unchanged", () => {
    expect(totals(projectEconomicActivity({ sales: [sale()], adjustments: [], from, to })))
      .toEqual({ gross: 22, net: 20, units: 2, cogs: 6 });
  });

  it("nets a payment cancellation and a total return to zero", () => {
    for (const id of ["void:void-1", "cash_refund:refund-1"]) {
      expect(totals(projectEconomicActivity({
        sales: [sale()],
        adjustments: [adjustment({ id })],
        from,
        to,
      }))).toEqual({ gross: 0, net: 0, units: 0, cogs: 0 });
    }
  });

  it("prorates revenue, units and COGS for a partial return", () => {
    expect(totals(projectEconomicActivity({
      sales: [sale()],
      adjustments: [adjustment({ grossAmount: 11 })],
      from,
      to,
    }))).toEqual({ gross: 11, net: 10, units: 1, cogs: 3 });
  });

  it("returns only the item identified by an existing split scope", () => {
    const rows = projectEconomicActivity({
      sales: [
        sale({ orderItemId: "item-1", productId: "pizza", quantity: 1, recognisedGross: 11, recognisedNet: 10, cogs: 3 }),
        sale({ orderItemId: "item-2", productId: "drink", quantity: 1, recognisedGross: 3.3, recognisedNet: 3, cogs: 1 }),
      ],
      adjustments: [adjustment({
        grossAmount: 3.3,
        scopedItems: [{ orderItemId: "item-2", quantity: 1 }],
      })],
      from,
      to,
    });
    const drink = rows.filter((row) => row.productId === "drink");
    const pizza = rows.filter((row) => row.productId === "pizza");
    expect(totals(drink)).toEqual({ gross: 0, net: 0, units: 0, cogs: 0 });
    expect(totals(pizza)).toEqual({ gross: 11, net: 10, units: 1, cogs: 3 });
  });

  it("handles multiple payments and caps duplicate/over-refunds idempotently", () => {
    const result = totals(projectEconomicActivity({
      sales: [sale()],
      adjustments: [
        adjustment({ id: "void:payment-1", grossAmount: 10 }),
        adjustment({ id: "void:payment-2", grossAmount: 12 }),
        adjustment({ id: "void:payment-2", grossAmount: 12 }),
        adjustment({ id: "cash_refund:extra", grossAmount: 22 }),
      ],
      from,
      to,
    }));
    expect(result).toEqual({ gross: 0, net: 0, units: 0, cogs: 0 });
  });

  it("books a later return in its own period without rewriting the sale period", () => {
    const octoberRefund = adjustment({ occurredAt: new Date("2026-10-02T12:00:00Z") });
    const september = totals(projectEconomicActivity({
      sales: [sale()],
      adjustments: [octoberRefund],
      from,
      to,
    }));
    const october = totals(projectEconomicActivity({
      sales: [sale()],
      adjustments: [octoberRefund],
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-31T23:59:59Z"),
    }));
    expect(september).toEqual({ gross: 22, net: 20, units: 2, cogs: 6 });
    expect(october).toEqual({ gross: -22, net: -20, units: -2, cogs: -6 });
  });
});

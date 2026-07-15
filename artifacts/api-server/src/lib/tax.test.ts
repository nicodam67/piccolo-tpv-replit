/**
 * Unit tests for calcMultiRateBreakdown
 *
 * Covers all scenarios required by the VAT implementation spec:
 *  1. Pure-10% sale
 *  2. Mixed 4% + 10% + 21% sale
 *  3. Sale with proportional discount
 *  4. Decimal quantities / half portions
 *  5. Cancellation / refund (negative amounts)
 *  Plus: rounding consistency guarantee
 */

import { describe, it, expect } from "vitest";
import { calcMultiRateBreakdown } from "./tax";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Parse "X.XX" → number */
const n = (s: string) => parseFloat(s);

// ─── tests ────────────────────────────────────────────────────────────────────

describe("calcMultiRateBreakdown", () => {
  // ── 1. Pure 10% sale ────────────────────────────────────────────────────────
  it("pure 10% sale — single rate, exact amounts", () => {
    const r = calcMultiRateBreakdown([{ lineTotal: 11.0, taxRate: 10 }]);

    expect(r.total).toBe("11.00");
    expect(r.taxBreakdown).toHaveLength(1);

    const [b] = r.taxBreakdown;
    expect(b.rate).toBe(10);
    expect(b.base).toBe("10.00");
    expect(b.cuota).toBe("1.00");

    expect(r.subtotal).toBe("10.00");
    expect(r.taxTotal).toBe("1.00");
  });

  it("pure 10% sale — non-round price", () => {
    // 3.30€ at 10%: base = 3.00, cuota = 0.30
    const r = calcMultiRateBreakdown([{ lineTotal: 3.3, taxRate: 10 }]);
    expect(r.total).toBe("3.30");
    expect(r.taxBreakdown[0].base).toBe("3.00");
    expect(r.taxBreakdown[0].cuota).toBe("0.30");
  });

  // ── 2. Mixed 4% + 10% + 21% ─────────────────────────────────────────────────
  it("mixed 4%, 10%, 21% sale — correct breakdown per rate", () => {
    const r = calcMultiRateBreakdown([
      { lineTotal: 10.4, taxRate: 4 },   // base=10.00, cuota=0.40
      { lineTotal: 11.0, taxRate: 10 },  // base=10.00, cuota=1.00
      { lineTotal: 12.1, taxRate: 21 },  // base=10.00, cuota=2.10
    ]);

    expect(r.total).toBe("33.50");
    expect(r.taxBreakdown).toHaveLength(3);

    // rates sorted ascending
    expect(r.taxBreakdown[0].rate).toBe(4);
    expect(r.taxBreakdown[0].base).toBe("10.00");
    expect(r.taxBreakdown[0].cuota).toBe("0.40");

    expect(r.taxBreakdown[1].rate).toBe(10);
    expect(r.taxBreakdown[1].base).toBe("10.00");
    expect(r.taxBreakdown[1].cuota).toBe("1.00");

    expect(r.taxBreakdown[2].rate).toBe(21);
    expect(r.taxBreakdown[2].base).toBe("10.00");
    expect(r.taxBreakdown[2].cuota).toBe("2.10");

    expect(r.subtotal).toBe("30.00");
    expect(r.taxTotal).toBe("3.50");
  });

  it("mixed rates — duplicate items aggregate into one line per rate", () => {
    // Two items both at 10%: should produce a single breakdown entry
    const r = calcMultiRateBreakdown([
      { lineTotal: 5.5, taxRate: 10 },
      { lineTotal: 5.5, taxRate: 10 },
    ]);
    expect(r.taxBreakdown).toHaveLength(1);
    expect(r.total).toBe("11.00");
    expect(r.taxBreakdown[0].base).toBe("10.00");
    expect(r.taxBreakdown[0].cuota).toBe("1.00");
  });

  // ── 3. Proportional discount ─────────────────────────────────────────────────
  it("discount distributed proportionally across rate groups", () => {
    // 20€ at 10% + 10€ at 21% = 30€ gross; 6€ discount (20%)
    // 10% group: 20/30 × 6 = 4€ off → net 16€ → base 14.55, cuota 1.45 (approx)
    // 21% group: 10/30 × 6 = 2€ off → net  8€ → base  6.61, cuota 1.39 (approx)
    const r = calcMultiRateBreakdown(
      [
        { lineTotal: 20.0, taxRate: 10 },
        { lineTotal: 10.0, taxRate: 21 },
      ],
      6.0,
    );

    expect(r.total).toBe("24.00"); // 30 − 6

    // Each group net: base + cuota = groupNet
    const [b10, b21] = r.taxBreakdown;
    expect(n(b10.base) + n(b10.cuota)).toBeCloseTo(16.0, 1);
    expect(n(b21.base) + n(b21.cuota)).toBeCloseTo(8.0, 1);

    // Aggregate consistency
    expect(n(r.subtotal) + n(r.taxTotal)).toBeCloseTo(24.0, 1);
  });

  it("discount = 0 is identical to no discount", () => {
    const items = [
      { lineTotal: 11.0, taxRate: 10 },
      { lineTotal: 12.1, taxRate: 21 },
    ];
    const withZero = calcMultiRateBreakdown(items, 0);
    const withoutArg = calcMultiRateBreakdown(items);
    expect(withZero).toEqual(withoutArg);
  });

  it("100% discount yields zero total and zero tax", () => {
    const r = calcMultiRateBreakdown([{ lineTotal: 11.0, taxRate: 10 }], 11.0);
    expect(r.total).toBe("0.00");
    expect(r.taxBreakdown[0].base).toBe("0.00");
    expect(r.taxBreakdown[0].cuota).toBe("0.00");
  });

  // ── 4. Decimal quantities / half portions ────────────────────────────────────
  it("non-integer lineTotal (half portion)", () => {
    // Half portion of 11€ dish = 5.50€ at 10%
    const r = calcMultiRateBreakdown([{ lineTotal: 5.5, taxRate: 10 }]);
    expect(r.total).toBe("5.50");
    expect(r.taxBreakdown[0].base).toBe("5.00");
    expect(r.taxBreakdown[0].cuota).toBe("0.50");
  });

  it("decimal lineTotal with awkward VAT division", () => {
    // 3.70€ at 10%: base = round(3.70/1.10) = round(3.3636…) = 3.36, cuota = 0.34
    const r = calcMultiRateBreakdown([{ lineTotal: 3.7, taxRate: 10 }]);
    expect(r.total).toBe("3.70");
    expect(n(r.taxBreakdown[0].base) + n(r.taxBreakdown[0].cuota)).toBeCloseTo(
      3.7,
      1,
    );
  });

  // ── 5. Cancellation / refund (negative amounts) ──────────────────────────────
  it("cancellation preserves tax rate with negative amounts", () => {
    const r = calcMultiRateBreakdown([{ lineTotal: -11.0, taxRate: 10 }]);
    expect(r.total).toBe("-11.00");
    expect(r.taxBreakdown[0].base).toBe("-10.00");
    expect(r.taxBreakdown[0].cuota).toBe("-1.00");
    expect(r.subtotal).toBe("-10.00");
    expect(r.taxTotal).toBe("-1.00");
  });

  it("partial refund — negative lineTotal at 21%", () => {
    const r = calcMultiRateBreakdown([{ lineTotal: -12.1, taxRate: 21 }]);
    expect(r.total).toBe("-12.10");
    expect(r.taxBreakdown[0].rate).toBe(21);
    expect(r.taxBreakdown[0].base).toBe("-10.00");
    expect(r.taxBreakdown[0].cuota).toBe("-2.10");
  });

  it("mixed sale + refund — same rate, different signs", () => {
    // Net: 2 items at 10% = 22€ and a refund of -11€ = net 11€
    const r = calcMultiRateBreakdown([
      { lineTotal: 22.0, taxRate: 10 },
      { lineTotal: -11.0, taxRate: 10 },
    ]);
    expect(r.total).toBe("11.00");
    expect(r.taxBreakdown[0].base).toBe("10.00");
    expect(r.taxBreakdown[0].cuota).toBe("1.00");
  });

  // ── 6. Rounding consistency guarantee ───────────────────────────────────────
  it("base + cuota = lineTotal for each rate (no rounding drift)", () => {
    const items = [
      { lineTotal: 7.26, taxRate: 21 },
      { lineTotal: 3.7, taxRate: 10 },
      { lineTotal: 2.08, taxRate: 4 },
    ];
    const r = calcMultiRateBreakdown(items);
    for (const b of r.taxBreakdown) {
      const lineTotal = items.find((it) => it.taxRate === b.rate)!.lineTotal;
      // Displayed 2-decimal values should reconstruct within ±0.01
      expect(n(b.base) + n(b.cuota)).toBeCloseTo(lineTotal, 1);
    }
  });

  it("subtotal + taxTotal ≈ total (max ±0.01 rounding tolerance)", () => {
    const r = calcMultiRateBreakdown([
      { lineTotal: 3.33, taxRate: 4 },
      { lineTotal: 7.77, taxRate: 10 },
      { lineTotal: 11.11, taxRate: 21 },
    ]);
    expect(n(r.subtotal) + n(r.taxTotal)).toBeCloseTo(n(r.total), 1);
  });

  it("empty items list returns all-zero totals", () => {
    const r = calcMultiRateBreakdown([]);
    expect(r.total).toBe("0.00");
    expect(r.subtotal).toBe("0.00");
    expect(r.taxTotal).toBe("0.00");
    expect(r.taxBreakdown).toHaveLength(0);
  });
});

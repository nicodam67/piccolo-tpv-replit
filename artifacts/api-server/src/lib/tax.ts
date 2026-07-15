/**
 * IVA (VAT) utilities for Spain.
 * Prices in this system are VAT-inclusive (IVA incluido).
 */

export const VALID_TAX_RATES = [4, 10, 21] as const;
export type TaxRate = (typeof VALID_TAX_RATES)[number];

export interface TaxBreakdownItem {
  rate: number;
  base: string;
  cuota: string;
}

export interface TaxTotals {
  taxBreakdown: TaxBreakdownItem[];
  subtotal: string;
  taxTotal: string;
  total: string;
}

/** Validate that a value is one of the allowed Spanish VAT rates. */
export function isValidTaxRate(v: unknown): v is TaxRate {
  return VALID_TAX_RATES.includes(v as TaxRate);
}

/**
 * Given a list of {lineTotal (VAT-inclusive), taxRate} items, compute:
 *  - taxBreakdown: one entry per rate with base imponible + cuota
 *  - aggregate subtotal (sum of bases), taxTotal (sum of cuotas), total
 *
 * Formula: base = priceWithVAT / (1 + rate/100), cuota = priceWithVAT − base
 *
 * Rounding strategy (cent-level):
 *   • baseCents  = round(groupNet / (1 + r/100) × 100)
 *   • cuotaCents = round(groupNet × 100) − baseCents
 *   This guarantees base + cuota = groupNet exactly (to the cent).
 *
 * Discount distribution:
 *   When discountTotal > 0 each rate-group's gross is reduced proportionally:
 *   groupDiscount = discountTotal × (groupGross / grossTotal)
 *   Negative lineTotals (refunds/cancellations) are handled transparently.
 *
 * Zero-amount lines are returned; callers that "must not show zero IVA lines"
 * should filter `b => parseFloat(b.base) !== 0 || parseFloat(b.cuota) !== 0`.
 */
export function calcMultiRateBreakdown(
  items: { lineTotal: number; taxRate: number }[],
  discountTotal = 0,
): TaxTotals {
  const byRate = new Map<number, number>();
  let grossTotal = 0;

  for (const item of items) {
    byRate.set(item.taxRate, (byRate.get(item.taxRate) ?? 0) + item.lineTotal);
    grossTotal += item.lineTotal;
  }

  const breakdown: TaxBreakdownItem[] = [];
  let subtotalCents = 0;
  let taxTotalCents = 0;

  for (const [rate, groupGross] of Array.from(byRate.entries()).sort(
    (a, b) => a[0] - b[0],
  )) {
    // Distribute discount proportionally (no intermediate rounding to preserve precision)
    const proportion = grossTotal !== 0 ? groupGross / grossTotal : 0;
    const groupNet = groupGross - discountTotal * proportion;

    // Cents-based: cuotaCents = groupNetCents − baseCents guarantees base + cuota = groupNet
    const groupNetCents = Math.round(groupNet * 100);
    const baseCents = Math.round((groupNet / (1 + rate / 100)) * 100);
    const cuotaCents = groupNetCents - baseCents;

    subtotalCents += baseCents;
    taxTotalCents += cuotaCents;

    breakdown.push({
      rate,
      base: (baseCents / 100).toFixed(2),
      cuota: (cuotaCents / 100).toFixed(2),
    });
  }

  // Effective total = gross − discount; computed from inputs (not from accumulated cents)
  // to match the amount actually charged, avoiding proportional distribution drift.
  const effectiveTotalCents = Math.round((grossTotal - discountTotal) * 100);

  return {
    taxBreakdown: breakdown,
    subtotal: (subtotalCents / 100).toFixed(2),
    taxTotal: (taxTotalCents / 100).toFixed(2),
    total: (effectiveTotalCents / 100).toFixed(2),
  };
}

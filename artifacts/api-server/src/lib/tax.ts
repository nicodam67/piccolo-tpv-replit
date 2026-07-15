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
 *  - aggregate subtotal, taxTotal, total
 *
 * Formula: base = priceWithVAT / (1 + rate/100), cuota = priceWithVAT - base
 */
export function calcMultiRateBreakdown(
  items: { lineTotal: number; taxRate: number }[]
): TaxTotals {
  const byRate = new Map<number, number>();
  let totalWithVat = 0;

  for (const item of items) {
    const existing = byRate.get(item.taxRate) ?? 0;
    byRate.set(item.taxRate, existing + item.lineTotal);
    totalWithVat += item.lineTotal;
  }

  const breakdown: TaxBreakdownItem[] = [];
  let subtotalSum = 0;
  let taxTotalSum = 0;

  for (const [rate, lineTotal] of Array.from(byRate.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const base = lineTotal / (1 + rate / 100);
    const cuota = lineTotal - base;
    subtotalSum += base;
    taxTotalSum += cuota;
    breakdown.push({ rate, base: base.toFixed(4), cuota: cuota.toFixed(4) });
  }

  return {
    taxBreakdown: breakdown.map((b) => ({
      ...b,
      base: parseFloat(b.base).toFixed(2),
      cuota: parseFloat(b.cuota).toFixed(2),
    })),
    subtotal: subtotalSum.toFixed(2),
    taxTotal: taxTotalSum.toFixed(2),
    total: totalWithVat.toFixed(2),
  };
}

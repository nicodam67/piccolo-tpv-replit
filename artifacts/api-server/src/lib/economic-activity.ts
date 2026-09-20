export interface EconomicSaleLine {
  orderId: string;
  orderItemId: string;
  quantity: number;
  recognisedGross: number;
  recognisedNet: number;
  cogs: number;
  createdAt: Date;
  [key: string]: unknown;
}

export interface EconomicAdjustment {
  id: string;
  orderId: string;
  grossAmount: number;
  occurredAt: Date;
  scopedItems?: Array<{ orderItemId: string; quantity: number }>;
}

export type ProjectedEconomicLine<T extends EconomicSaleLine = EconomicSaleLine> = T & {
  economicEventId: string;
  economicEventType: "sale" | "adjustment";
};

/**
 * Projects immutable sales and subsequent reversals as dated economic events.
 * Adjustments are capped by each line's still-recognised gross value, so a
 * retried/full duplicate reversal can never make an order economically negative.
 */
export function projectEconomicActivity<T extends EconomicSaleLine>(input: {
  sales: T[];
  adjustments: EconomicAdjustment[];
  from: Date;
  to: Date;
}): ProjectedEconomicLine<T>[] {
  const byOrder = new Map<string, T[]>();
  for (const sale of input.sales) {
    const lines = byOrder.get(sale.orderId) ?? [];
    lines.push(sale);
    byOrder.set(sale.orderId, lines);
  }

  const projected: ProjectedEconomicLine<T>[] = input.sales
    .filter((sale) => sale.createdAt >= input.from && sale.createdAt <= input.to)
    .map((sale) => ({
      ...sale,
      economicEventId: `sale:${sale.orderItemId}`,
      economicEventType: "sale",
    }));

  const reversedGross = new Map<string, number>();
  const seenAdjustments = new Set<string>();
  const adjustments = [...input.adjustments]
    .filter((adjustment) => adjustment.occurredAt <= input.to)
    .sort((left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime()
      || left.id.localeCompare(right.id),
    );

  for (const adjustment of adjustments) {
    if (seenAdjustments.has(adjustment.id)) continue;
    seenAdjustments.add(adjustment.id);
    if (!Number.isFinite(adjustment.grossAmount) || adjustment.grossAmount <= 0) continue;

    const orderLines = byOrder.get(adjustment.orderId) ?? [];
    const scope = new Map(
      adjustment.scopedItems?.map((item) => [item.orderItemId, item.quantity]) ?? [],
    );
    const candidates = orderLines
      .filter((line) => scope.size === 0 || scope.has(line.orderItemId))
      .map((line) => {
        const scopedQuantity = scope.get(line.orderItemId);
        const scopedFraction = scopedQuantity == null
          ? 1
          : Math.min(1, Math.max(0, scopedQuantity) / Math.max(line.quantity, Number.EPSILON));
        const lineLimit = Math.max(0, line.recognisedGross) * scopedFraction;
        const remaining = Math.max(
          0,
          lineLimit - (reversedGross.get(line.orderItemId) ?? 0),
        );
        return { line, remaining };
      })
      .filter(({ remaining }) => remaining > 0);

    const available = candidates.reduce((total, candidate) => total + candidate.remaining, 0);
    const appliedAmount = Math.min(adjustment.grossAmount, available);
    if (appliedAmount <= 0) continue;

    let amountLeft = appliedAmount;
    candidates.forEach(({ line, remaining }, index) => {
      const allocated = index === candidates.length - 1
        ? amountLeft
        : appliedAmount * remaining / available;
      amountLeft -= allocated;
      reversedGross.set(
        line.orderItemId,
        (reversedGross.get(line.orderItemId) ?? 0) + allocated,
      );

      if (adjustment.occurredAt < input.from || adjustment.occurredAt > input.to) return;
      const fraction = line.recognisedGross > 0 ? allocated / line.recognisedGross : 0;
      projected.push({
        ...line,
        quantity: -line.quantity * fraction,
        recognisedGross: -allocated,
        recognisedNet: -line.recognisedNet * fraction,
        cogs: -line.cogs * fraction,
        createdAt: adjustment.occurredAt,
        economicEventId: adjustment.id,
        economicEventType: "adjustment",
      });
    });
  }

  return projected.sort((left, right) =>
    left.createdAt.getTime() - right.createdAt.getTime()
    || left.economicEventId.localeCompare(right.economicEventId),
  );
}

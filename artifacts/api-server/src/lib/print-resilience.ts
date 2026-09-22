export interface RoutablePrinter {
  id: string;
  type: string;
  departmentCode?: string | null;
  active: boolean;
  isPrimary: boolean;
}

export function resolvePrinterTargets<T extends RoutablePrinter>(
  productId: string,
  categoryId: string,
  departmentCode: string,
  printers: T[],
  routing: ReadonlyMap<string, string[]>,
): T[] {
  const productKey = `product:${productId}`;
  if (routing.has(productKey)) {
    const ids = routing.get(productKey) ?? [];
    return printers.filter(printer => ids.includes(printer.id) && printer.active);
  }
  const categoryKey = `category:${categoryId}`;
  if (routing.has(categoryKey)) {
    const ids = routing.get(categoryKey) ?? [];
    return printers.filter(printer => ids.includes(printer.id) && printer.active);
  }
  return printers.filter(printer =>
    (printer.departmentCode ?? printer.type) === departmentCode
    && printer.active
    && printer.isPrimary,
  );
}

export function buildPrintDedupeKey(input: {
  documentType: string;
  orderId: string;
  printerId: string;
  operationIds: string[];
}): string {
  return [
    input.documentType,
    input.orderId,
    input.printerId,
    ...[...input.operationIds].sort(),
  ].join(":");
}

export function nextPrintRetryAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + 5_000 * 2 ** Math.max(0, attempts - 1));
}

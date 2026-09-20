import { db } from "@workspace/db";
import {
  orderItemModifiersTable,
  orderItemsTable,
  ordersTable,
  productFormatsTable,
  productsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

type OrderItemDb = Pick<typeof db, "select" | "insert">;

export interface AddOrderItemInput {
  productId: string;
  quantity?: number;
  notes?: string;
  formatId?: string;
  isInvitation?: boolean;
  modifiers?: { modifierId?: string; modifierName: string; priceDelta: string }[];
}

export class OrderItemServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function createOrderItem(
  executor: OrderItemDb,
  orderId: string,
  input: AddOrderItemInput,
) {
  const [currentOrder] = await executor
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!currentOrder) throw new OrderItemServiceError(404, "Pedido no encontrado");
  if (["bill_requested", "paid", "completed"].includes(currentOrder.status)) {
    throw new OrderItemServiceError(409, "No se pueden añadir productos: el pedido no está abierto");
  }

  const [product] = await executor
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, input.productId));
  if (!product) throw new OrderItemServiceError(404, "Producto no encontrado");

  let unitPrice = product.price;
  let resolvedFormatId: string | null = null;
  let resolvedFormatName: string | null = null;
  let taxRate: number = product.taxRate ?? 10;
  if (input.formatId) {
    const [format] = await executor
      .select()
      .from(productFormatsTable)
      .where(and(
        eq(productFormatsTable.id, input.formatId),
        eq(productFormatsTable.productId, input.productId),
      ));
    if (!format) throw new OrderItemServiceError(409, "El formato ya no está disponible");
    unitPrice = format.price;
    resolvedFormatId = format.id;
    resolvedFormatName = format.name;
    if (format.taxRate != null) taxRate = format.taxRate;
  }

  if (input.modifiers?.length) {
    const delta = input.modifiers.reduce(
      (total, modifier) => total + parseFloat(modifier.priceDelta || "0"),
      0,
    );
    unitPrice = String(parseFloat(unitPrice) + delta);
  }

  const [item] = await executor
    .insert(orderItemsTable)
    .values({
      orderId,
      productId: input.productId,
      formatId: resolvedFormatId,
      formatName: resolvedFormatName,
      quantity: Math.max(1, Number(input.quantity ?? 1)),
      unitPrice,
      taxRate,
      status: "draft",
      notes: input.notes ?? "",
      allergyNote: "",
      hasAllergy: false,
      isInvitation: input.isInvitation ?? false,
    })
    .returning();

  if (input.modifiers?.length) {
    await executor.insert(orderItemModifiersTable).values(
      input.modifiers.map((modifier) => ({
        orderItemId: item.id,
        modifierId: modifier.modifierId ?? null,
        modifierName: modifier.modifierName,
        priceDelta: modifier.priceDelta,
      })),
    );
  }
  const itemModifiers = input.modifiers?.length
    ? await executor.select().from(orderItemModifiersTable)
        .where(eq(orderItemModifiersTable.orderItemId, item.id))
    : [];

  return { item, product, itemModifiers, resolvedFormatName };
}

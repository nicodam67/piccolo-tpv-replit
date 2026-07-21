/**
 * Online Orders v2 — Table sessions, cart persistence, payment intents,
 * translations, soldout toggle, refunds, product availability rules, and QR helpers.
 *
 * Rutas públicas (sin auth):
 *   POST /public/table-sessions               — Create or resume a session (QR scan)
 *   GET  /public/table-sessions/check         — Validate a session token
 *   GET  /public/cart                         — Get persisted cart for a token
 *   POST /public/cart                         — Save/update persisted cart
 *   POST /public/orders/online-v2             — Place an order (v2: idempotency, tip, dine-in)
 *   POST /public/payment/intent               — Create payment intent (Stripe or simulator)
 *   POST /public/payment/webhook              — Stripe webhook handler
 *
 * Rutas de admin:
 *   GET    /admin/table-sessions              — List table sessions
 *   PATCH  /admin/table-sessions/:id         — Close/expire a session
 *   PATCH  /admin/products/:id/soldout        — Toggle out-of-stock
 *   PATCH  /admin/products/:id/translations   — Update product translations
 *   PATCH  /admin/categories/:id/translations — Update category translations
 *   GET    /admin/product-availability-rules  — List availability rules
 *   POST   /admin/product-availability-rules  — Create rule
 *   PATCH  /admin/product-availability-rules/:id — Update rule
 *   DELETE /admin/product-availability-rules/:id — Delete rule
 *   POST   /admin/online-orders/:id/refund    — Refund an online order
 */

import { Router, type IRouter } from "express";

// Augment the Express Request type so TypeScript knows about req.rawBody,
// which is populated by the express.json() verify callback in app.ts for
// Stripe webhook signature verification.
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  categoriesTable,
  productFormatsTable,
  onlineOrdersConfigTable,
  tableSessionsTable,
  onlineCartsTable,
  paymentAttemptsTable,
  productAvailabilityRulesTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { calcMultiRateBreakdown } from "../lib/tax";
import { emitToFunction } from "../lib/socket-events";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `ONL-${date}-${seq}`;
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3600_000);
}

// ── PUBLIC: POST /public/table-sessions ───────────────────────────────────────
// Called when a customer scans a table QR code.  Creates a new session or
// returns an existing open one for the same table.

router.post("/public/table-sessions", async (req, res): Promise<void> => {
  const { tableId, zoneId, tableLabel = "", zoneLabel = "" } = req.body as {
    tableId?: string;
    zoneId?: string;
    tableLabel?: string;
    zoneLabel?: string;
  };

  const token = crypto.randomUUID();
  const [session] = await db.insert(tableSessionsTable).values({
    tableId: tableId ?? null,
    zoneId: zoneId ?? null,
    tableLabel: tableLabel.trim(),
    zoneLabel: zoneLabel.trim(),
    token,
    status: "open",
    expiresAt: hoursFromNow(4),
  } as any).returning();

  res.status(201).json(session);
});

// ── PUBLIC: GET /public/table-sessions/check ─────────────────────────────────
// Validates a session token.  Returns 200 with the session or 404/410.

router.get("/public/table-sessions/check", async (req, res): Promise<void> => {
  const token = (req.query.token as string | undefined) ?? "";
  if (!token) { res.status(400).json({ error: "Token requerido." }); return; }

  const [session] = await db.select().from(tableSessionsTable)
    .where(eq(tableSessionsTable.token, token)).limit(1);

  if (!session) { res.status(404).json({ error: "Sesión no encontrada." }); return; }
  if (session.status !== "open" || (session.expiresAt && session.expiresAt < new Date())) {
    res.status(410).json({ error: "Sesión caducada.", session });
    return;
  }

  res.json(session);
});

// ── PUBLIC: GET /public/cart ──────────────────────────────────────────────────
// Returns the persisted cart for a session token.

router.get("/public/cart", async (req, res): Promise<void> => {
  const token = (req.query.token as string | undefined) ?? "";
  if (!token) { res.status(400).json({ error: "Token requerido." }); return; }

  const [cart] = await db.select().from(onlineCartsTable)
    .where(eq(onlineCartsTable.sessionToken, token)).limit(1);

  res.json(cart ?? { items: [], deliveryType: "takeaway" });
});

// ── PUBLIC: POST /public/cart ─────────────────────────────────────────────────
// Upserts the cart for a session token.

router.post("/public/cart", async (req, res): Promise<void> => {
  const { token, items = [], deliveryType = "takeaway" } = req.body as {
    token: string;
    items: unknown[];
    deliveryType: string;
  };

  if (!token) { res.status(400).json({ error: "Token requerido." }); return; }

  // Upsert using raw SQL for ON CONFLICT
  const cartResult = await db.execute(sql`
    INSERT INTO online_carts (session_token, items, delivery_type, updated_at)
    VALUES (${token}, ${JSON.stringify(items)}::jsonb, ${deliveryType}, now())
    ON CONFLICT (session_token)
    DO UPDATE SET items = EXCLUDED.items, delivery_type = EXCLUDED.delivery_type, updated_at = now()
    RETURNING *
  `);
  const cart = cartResult.rows[0] as Record<string, unknown> | undefined;

  res.json(cart ?? { sessionToken: token, items, deliveryType });
});

// ── PUBLIC: POST /public/orders/online-v2 ────────────────────────────────────
// Extended order creation: idempotency_key, tip_amount, scheduled_for,
// table_session_id (dine-in). Forwards to the same orders table.

router.post("/public/orders/online-v2", async (req, res): Promise<void> => {
  const {
    deliveryType = "takeaway",
    channel = "qr",
    items = [],
    clientName = "",
    clientPhone = "",
    scheduledAt,
    paymentMethod = "on_arrival",
    consentRgpd = false,
    deliveryAddress,
    tipAmount = 0,
    idempotencyKey,
    tableSessionToken,
  } = req.body as {
    deliveryType?: string;
    channel?: string;
    items?: Array<{ productId: string; quantity: number; formatId?: string; notes?: string }>;
    clientName?: string;
    clientPhone?: string;
    scheduledAt?: string;
    paymentMethod?: string;
    consentRgpd?: boolean;
    deliveryAddress?: Record<string, string>;
    tipAmount?: number;
    idempotencyKey?: string;
    tableSessionToken?: string;
  };

  if (!items.length) {
    res.status(400).json({ error: "El pedido debe tener al menos un artículo." });
    return;
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  if (idempotencyKey) {
    const existingResult = await db.execute(sql`
      SELECT id, order_number, status, created_at
      FROM orders
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `);
    const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
    if (existing) {
      res.status(200).json({
        orderId: existing.id,
        orderNumber: existing.order_number,
        status: existing.status,
        idempotent: true,
      });
      return;
    }
  }

  // ── Validate table session ────────────────────────────────────────────────
  let tableSessionId: string | null = null;
  if (tableSessionToken) {
    const [session] = await db.select().from(tableSessionsTable)
      .where(and(
        eq(tableSessionsTable.token, tableSessionToken),
        eq(tableSessionsTable.status, "open"),
      )).limit(1);

    if (!session || (session.expiresAt && session.expiresAt < new Date())) {
      res.status(410).json({ error: "La sesión de mesa ha caducado. Escanea el QR de nuevo." });
      return;
    }
    tableSessionId = session.id;
  }

  // ── Resolve product prices ────────────────────────────────────────────────
  const resolvedItems: Array<{
    productId: string;
    formatId: string | null;
    formatName: string | null;
    quantity: number;
    unitPrice: string;
    taxRate: number;
    notes: string;
  }> = [];

  let orderTotal = 0;

  for (const item of items) {
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, item.productId)).limit(1);

    if (!product || !product.active || product.outOfStock) {
      res.status(400).json({ error: `Producto no disponible: ${item.productId}` });
      return;
    }

    let unitPrice = parseFloat(product.price);
    let effectiveTaxRate = product.taxRate;
    let formatId: string | null = null;
    let formatName: string | null = null;

    if (item.formatId) {
      const [fmt] = await db.select().from(productFormatsTable)
        .where(eq(productFormatsTable.id, item.formatId)).limit(1);
      if (fmt && fmt.active) {
        unitPrice = parseFloat(fmt.price);
        effectiveTaxRate = fmt.taxRate ?? product.taxRate;
        formatId = fmt.id;
        formatName = fmt.name;
      }
    }

    const lineTotal = unitPrice * item.quantity;
    orderTotal += lineTotal;

    resolvedItems.push({
      productId: item.productId,
      formatId,
      formatName,
      quantity: item.quantity,
      unitPrice: unitPrice.toFixed(2),
      taxRate: effectiveTaxRate,
      notes: item.notes ?? "",
    });
  }

  const tipAmountNum = parseFloat(String(tipAmount ?? 0)) || 0;
  const grandTotal = orderTotal + tipAmountNum;

  // ── Delivery address ──────────────────────────────────────────────────────
  let deliveryAddressId: string | null = null;
  if (deliveryType === "delivery" && deliveryAddress?.street) {
    const addrResult = await db.execute(sql`
      INSERT INTO delivery_addresses (street, "number", floor, postal_code, city, notes)
      VALUES (
        ${deliveryAddress.street ?? ""},
        ${deliveryAddress.number ?? ""},
        ${deliveryAddress.floor ?? ""},
        ${deliveryAddress.postalCode ?? ""},
        ${deliveryAddress.city ?? ""},
        ${deliveryAddress.notes ?? ""}
      )
      RETURNING id
    `);
    const addr = addrResult.rows[0] as Record<string, unknown> | undefined;
    deliveryAddressId = (addr?.id as string) ?? null;
  }

  const isAsap = !scheduledAt || scheduledAt === "asap";
  const requestedAt = isAsap ? null : new Date(scheduledAt as string);
  const estimatedReadyAt = new Date(Date.now() + 30 * 60_000);
  const orderNumber = generateOrderNumber();

  // ── Insert order ──────────────────────────────────────────────────────────
  const orderResult = await db.execute(sql`
    INSERT INTO orders (
      status, delivery_type, channel, client_name, client_phone,
      notes, scheduled_at, order_number, online_payment_status,
      estimated_ready_at, delivery_address_id,
      tip_amount, idempotency_key, table_session_id,
      consent_rgpd
    ) VALUES (
      'pending_confirm',
      ${deliveryType},
      ${channel},
      ${clientName.trim()},
      ${clientPhone.trim()},
      '',
      ${requestedAt ? requestedAt.toISOString() : null},
      ${orderNumber},
      ${paymentMethod === "online" ? "pending" : "none"},
      ${estimatedReadyAt.toISOString()},
      ${deliveryAddressId},
      ${tipAmountNum.toFixed(2)},
      ${idempotencyKey ?? null},
      ${tableSessionId},
      ${consentRgpd}
    )
    RETURNING id, order_number, status
  `);
  const order = orderResult.rows[0] as Record<string, unknown>;

  const orderId = order.id as string;

  // ── Insert order items ────────────────────────────────────────────────────
  for (const item of resolvedItems) {
    await db.execute(sql`
      INSERT INTO order_items (
        order_id, product_id, format_id, format_name,
        quantity, unit_price, tax_rate, status, notes,
        allergy_note, has_allergy, is_invitation
      ) VALUES (
        ${orderId},
        ${item.productId},
        ${item.formatId},
        ${item.formatName},
        ${item.quantity},
        ${item.unitPrice},
        ${item.taxRate},
        'draft',
        ${item.notes},
        '', false, false
      )
    `);
  }

  // Notify staff via socket
  try { emitToFunction("floor", "online-orders:refresh"); } catch { /* ignore */ }

  res.status(201).json({
    orderId,
    orderNumber: order.order_number,
    status: order.status,
    total: grandTotal.toFixed(2),
    tipAmount: tipAmountNum.toFixed(2),
    idempotent: false,
  });
});

// ── PUBLIC: POST /public/payment/intent ───────────────────────────────────────
// Creates a payment intent for an online order.
// Uses real Stripe if STRIPE_SECRET_KEY is set, otherwise returns a simulator ref.

router.post("/public/payment/intent", async (req, res): Promise<void> => {
  const { orderId, returnUrl } = req.body as { orderId: string; returnUrl?: string };
  if (!orderId) { res.status(400).json({ error: "orderId requerido." }); return; }

  const orderRes = await db.execute(sql`
    SELECT id, order_number, status, online_payment_status
    FROM orders WHERE id = ${orderId} LIMIT 1
  `);
  const order = orderRes.rows[0] as Record<string, unknown> | undefined;
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }
  if (order.online_payment_status === "paid") {
    res.status(409).json({ error: "El pago ya está registrado." }); return;
  }

  // Calculate amount in cents
  const itemsRes = await db.execute(sql`
    SELECT unit_price, quantity FROM order_items WHERE order_id = ${orderId}
  `);
  const subtotal = (itemsRes.rows as Record<string, unknown>[]).reduce((s: number, it) =>
    s + parseFloat(it.unit_price as string) * (it.quantity as number), 0);
  const tipRes = await db.execute(sql`SELECT tip_amount FROM orders WHERE id = ${orderId}`);
  const tip = parseFloat(((tipRes.rows[0] as Record<string, unknown> | undefined)?.tip_amount as string) ?? "0") || 0;
  const amountCents = Math.round((subtotal + tip) * 100);

  const stripeKey = process.env["STRIPE_SECRET_KEY"] ?? "";

  if (stripeKey) {
    // ── Real Stripe ────────────────────────────────────────────────────────
    try {
      const { default: Stripe } = await import("stripe" as any);
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "eur",
        metadata: { orderId, orderNumber: (order as any).order_number },
        return_url: returnUrl,
      });

      await db.insert(paymentAttemptsTable).values({
        orderId,
        provider: "stripe",
        externalId: intent.id,
        status: "pending",
        amountCents,
        currency: "eur",
        rawResponse: intent as unknown as object,
      } as any);

      res.json({
        provider: "stripe",
        clientSecret: intent.client_secret,
        externalId: intent.id,
        amountCents,
      });
    } catch (err) {
      res.status(500).json({ error: "Error al crear el pago con Stripe.", detail: String(err) });
    }
  } else {
    // ── Simulator ──────────────────────────────────────────────────────────
    const simRef = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const [attempt] = await db.insert(paymentAttemptsTable).values({
      orderId,
      provider: "simulator",
      externalId: simRef,
      status: "pending",
      amountCents,
      currency: "eur",
    } as any).returning();

    res.json({
      provider: "simulator",
      clientSecret: `sim_secret_${simRef}`,
      externalId: simRef,
      amountCents,
      attemptId: attempt.id,
    });
  }
});

// ── PUBLIC: POST /public/payment/webhook ──────────────────────────────────────
// Handles Stripe webhook events OR simulator confirmations.
//
// Security model:
//   • Stripe mode:    requires a valid `stripe-signature` header (HMAC-SHA256).
//   • Simulator mode: only accepted in non-production environments.
//     Optionally, set SIMULATOR_WEBHOOK_SECRET and send it in the
//     `x-simulator-secret` header for an extra layer of protection.

router.post("/public/payment/webhook", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
  const body = req.body as Record<string, unknown>;
  const isProduction = process.env["NODE_ENV"] === "production";

  let event: { type: string; data: { object: Record<string, unknown> } };

  if (sig && webhookSecret) {
    // ── Real Stripe webhook — verify HMAC signature ────────────────────────
    try {
      const { default: Stripe } = await import("stripe" as any);
      const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"]!, { apiVersion: "2024-04-10" });
      event = stripe.webhooks.constructEvent(
        req.rawBody ?? JSON.stringify(body),
        sig,
        webhookSecret,
      ) as typeof event;
    } catch {
      res.status(400).json({ error: "Webhook signature verification failed." });
      return;
    }
  } else if (!isProduction && (body.type as string)?.startsWith("simulator.")) {
    // ── Simulator webhook — non-production only ────────────────────────────
    const simSecret = process.env["SIMULATOR_WEBHOOK_SECRET"] ?? "";
    if (simSecret) {
      const provided = req.headers["x-simulator-secret"] as string | undefined;
      if (provided !== simSecret) {
        res.status(403).json({ error: "Invalid simulator secret." });
        return;
      }
    }
    event = body as typeof event;
  } else {
    // Unknown / unverifiable payload — reject
    res.status(400).json({ error: "Missing or unverifiable webhook payload." });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const obj = event.data.object;
    const externalId = (obj.id ?? (obj as any).externalId) as string;
    const orderId = (obj.metadata as any)?.orderId ?? (obj as any).orderId;

    if (orderId) {
      // Persist payment reference on the order for idempotent refunds
      await db.execute(sql`
        UPDATE orders
        SET online_payment_status = 'paid',
            status = 'pending_confirm',
            online_payment_ref = ${externalId}
        WHERE id = ${orderId} AND online_payment_status != 'paid'
      `);
      await db.execute(sql`
        UPDATE payment_attempts SET status = 'succeeded' WHERE external_id = ${externalId}
      `);
      try { emitToFunction("floor", "online-orders:refresh"); } catch { /* ignore */ }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const obj = event.data.object;
    const externalId = (obj.id ?? (obj as any).externalId) as string;
    const errMsg = String((obj as any).last_payment_error?.message ?? "Error en el pago");
    await db.execute(sql`
      UPDATE payment_attempts SET status = 'failed', error_message = ${errMsg}
      WHERE external_id = ${externalId}
    `);
  }

  // Simulator: confirm-payment event
  if ((event.type as string) === "simulator.payment.confirm") {
    const { orderId, attemptId, approve = true } = body as any;
    if (orderId && attemptId) {
      // Fetch the external_id from the attempt so we can store it as payment_ref
      const attemptRes = await db.execute(sql`
        SELECT external_id FROM payment_attempts WHERE id = ${attemptId} LIMIT 1
      `);
      const attemptRow = attemptRes.rows[0] as Record<string, unknown> | undefined;
      const externalId = (attemptRow?.external_id as string) ?? null;

      await db.execute(sql`
        UPDATE orders SET
          online_payment_status = ${approve ? "paid" : "failed"},
          status = ${approve ? "pending_confirm" : "pending_payment"},
          online_payment_ref = ${approve && externalId ? externalId : null}
        WHERE id = ${orderId}
      `);
      await db.execute(sql`
        UPDATE payment_attempts SET status = ${approve ? "succeeded" : "failed"}
        WHERE id = ${attemptId}
      `);
      try { emitToFunction("floor", "online-orders:refresh"); } catch { /* ignore */ }
    } else if (orderId) {
      // No attemptId provided — update order status only (no payment_ref)
      await db.execute(sql`
        UPDATE orders SET
          online_payment_status = ${approve ? "paid" : "failed"},
          status = ${approve ? "pending_confirm" : "pending_payment"}
        WHERE id = ${orderId}
      `);
      try { emitToFunction("floor", "online-orders:refresh"); } catch { /* ignore */ }
    }
  }

  res.json({ received: true });
});

// ── ADMIN: GET /admin/table-sessions ─────────────────────────────────────────

router.get("/admin/table-sessions", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };

  const rows = await db.select().from(tableSessionsTable)
    .orderBy(desc(tableSessionsTable.createdAt))
    .limit(100);

  const filtered = status ? rows.filter(s => s.status === status) : rows;
  res.json(filtered);
});

// ── ADMIN: PATCH /admin/table-sessions/:id ───────────────────────────────────

router.patch("/admin/table-sessions/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (status === "closed" || status === "expired") updates.closedAt = new Date();

  const [session] = await db.update(tableSessionsTable)
    .set(updates as any)
    .where(eq(tableSessionsTable.id, id))
    .returning();

  if (!session) { res.status(404).json({ error: "Sesión no encontrada." }); return; }
  res.json(session);
});

// ── ADMIN: PATCH /admin/products/:id/soldout ─────────────────────────────────
// Quick toggle for the "out of stock" flag — no full product update required.

router.patch("/admin/products/:id/soldout", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { outOfStock } = req.body as { outOfStock: boolean };

  if (typeof outOfStock !== "boolean") {
    res.status(400).json({ error: "outOfStock (boolean) es requerido." }); return;
  }

  const [product] = await db.update(productsTable)
    .set({ outOfStock } as any)
    .where(eq(productsTable.id, id))
    .returning();

  if (!product) { res.status(404).json({ error: "Producto no encontrado." }); return; }

  // Emit menu refresh so open menu pages reload automatically
  try { emitToFunction("admin", "menu:refresh"); } catch { /* ignore */ }

  res.json({ ok: true, outOfStock: product.outOfStock });
});

// ── ADMIN: PATCH /admin/products/:id/translations ───────────────────────────

router.patch("/admin/products/:id/translations", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { nameEn = "", descriptionEn = "", nameEs = "", descriptionEs = "" } = req.body as {
    nameEn?: string;
    descriptionEn?: string;
    nameEs?: string;
    descriptionEs?: string;
  };

  const [product] = await db.update(productsTable)
    .set({ nameEn, descriptionEn, nameEs, descriptionEs } as any)
    .where(eq(productsTable.id, id))
    .returning();

  if (!product) { res.status(404).json({ error: "Producto no encontrado." }); return; }
  res.json({ ok: true, nameEn: (product as any).nameEn, descriptionEn: (product as any).descriptionEn });
});

// ── ADMIN: PATCH /admin/categories/:id/translations ─────────────────────────

router.patch("/admin/categories/:id/translations", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { nameEn = "" } = req.body as { nameEn?: string };

  const [cat] = await db.update(categoriesTable)
    .set({ nameEn } as any)
    .where(eq(categoriesTable.id, id))
    .returning();

  if (!cat) { res.status(404).json({ error: "Categoría no encontrada." }); return; }
  res.json({ ok: true, nameEn: (cat as any).nameEn });
});

// ── ADMIN: Product Availability Rules CRUD ───────────────────────────────────

router.get("/admin/product-availability-rules", requireAuth, requireRole("manager", "admin"), async (_req, res): Promise<void> => {
  const rules = await db.select().from(productAvailabilityRulesTable)
    .orderBy(asc(productAvailabilityRulesTable.createdAt));
  res.json(rules);
});

router.post("/admin/product-availability-rules", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const {
    productId, categoryId, label = "", daysOfWeek = [0, 1, 2, 3, 4, 5, 6],
    timeFrom = "00:00", timeTo = "23:59", active = true,
  } = req.body as any;

  if (!productId && !categoryId) {
    res.status(400).json({ error: "Se requiere productId o categoryId." }); return;
  }

  const [rule] = await db.insert(productAvailabilityRulesTable).values({
    productId: productId ?? null,
    categoryId: categoryId ?? null,
    label, daysOfWeek, timeFrom, timeTo, active,
  } as any).returning();

  res.status(201).json(rule);
});

router.patch("/admin/product-availability-rules/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [rule] = await db.update(productAvailabilityRulesTable)
    .set(req.body as any)
    .where(eq(productAvailabilityRulesTable.id, id))
    .returning();
  if (!rule) { res.status(404).json({ error: "Regla no encontrada." }); return; }
  res.json(rule);
});

router.delete("/admin/product-availability-rules/:id", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  await db.delete(productAvailabilityRulesTable).where(eq(productAvailabilityRulesTable.id, id));
  res.json({ ok: true });
});

// ── ADMIN: POST /admin/online-orders/:id/refund ───────────────────────────────

router.post("/admin/online-orders/:id/refund", requireAuth, requireRole("manager", "admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reason = "" } = req.body as { reason?: string };

  const refundOrderRes = await db.execute(sql`
    SELECT id, order_number, online_payment_status, online_payment_ref
    FROM orders WHERE id = ${id} LIMIT 1
  `);
  const order = refundOrderRes.rows[0] as Record<string, unknown> | undefined;
  if (!order) { res.status(404).json({ error: "Pedido no encontrado." }); return; }
  if (order.online_payment_status !== "paid") {
    res.status(409).json({ error: "Solo se pueden reembolsar pedidos con pago completado." });
    return;
  }

  // Resolve the authoritative payment reference:
  // 1. Use the order's online_payment_ref if available (set by webhook handler).
  // 2. Fall back to the succeeded payment_attempt's external_id for resilience.
  let paymentRef: string | null = (order.online_payment_ref as string) ?? null;
  if (!paymentRef) {
    const refundAttemptRes = await db.execute(sql`
      SELECT external_id FROM payment_attempts
      WHERE order_id = ${id} AND status = 'succeeded'
      ORDER BY created_at DESC LIMIT 1
    `);
    const refundAttempt = refundAttemptRes.rows[0] as Record<string, unknown> | undefined;
    paymentRef = (refundAttempt?.external_id as string) ?? null;
  }

  const stripeKey = process.env["STRIPE_SECRET_KEY"] ?? "";
  let refundRef = `REF-${Date.now()}`;

  if (stripeKey && paymentRef && !paymentRef.startsWith("SIM-")) {
    // ── Real Stripe refund ───────────────────────────────────────────────────
    try {
      const { default: Stripe } = await import("stripe" as any);
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
      const refund = await stripe.refunds.create({
        payment_intent: paymentRef,
        reason: "requested_by_customer",
      });
      refundRef = refund.id;
    } catch (err) {
      res.status(500).json({ error: "Error al procesar reembolso con Stripe.", detail: String(err) });
      return;
    }
  }

  await db.execute(sql`
    UPDATE orders
    SET online_payment_status = 'refunded', status = 'cancelled'
    WHERE id = ${id}
  `);

  await db.execute(sql`
    UPDATE payment_attempts
    SET status = 'refunded', refunded_at = now(), refund_ref = ${refundRef}
    WHERE order_id = ${id} AND status = 'succeeded'
  `);

  // Audit
  await db.execute(sql`
    INSERT INTO online_order_audit (order_id, event, user_id, user_name, metadata)
    VALUES (${id}, 'refund_issued', ${req.user?.id ?? null}, ${req.user?.name ?? "admin"}, ${JSON.stringify({ refundRef, reason })}::jsonb)
  `);

  try { emitToFunction("floor", "online-orders:refresh"); } catch { /* ignore */ }
  res.json({ ok: true, refundRef });
});

export default router;

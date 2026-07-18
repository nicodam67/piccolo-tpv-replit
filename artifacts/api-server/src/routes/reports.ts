/**
 * Reports Module — Informes
 * Comprehensive analytics endpoints for the Piccolo TPV reports dashboard.
 * All endpoints: requireAuth + requireRole("admin","manager").
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql, and, gte, lte, eq, desc, not } from "drizzle-orm";
import {
  ticketsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  paymentMethodsTable,
  cashSessionsTable,
  cashMovementsTable,
  discountsTable,
  paymentVoidsTable,
  tipsTable,
  employeesTable,
  restaurantTablesTable,
  roomZonesTable,
  productsTable,
  categoriesTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import ExcelJS from "exceljs";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager")];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateRange(q: Record<string, string>) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const fromStr = q.from ?? todayStr;
  const toStr   = q.to   ?? todayStr;
  return {
    from: new Date(`${fromStr}T00:00:00.000Z`),
    to:   new Date(`${toStr}T23:59:59.999Z`),
  };
}

const f2 = (v: string | number | null | undefined) =>
  parseFloat(String(v ?? "0"));

// ─── 1. Summary KPIs ─────────────────────────────────────────────────────────

router.get("/reports/summary", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const [ticket] = await db
    .select({
      gross:      sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      net:        sql<string>`COALESCE(SUM(${ticketsTable.subtotal}),0)`,
      tax:        sql<string>`COALESCE(SUM(${ticketsTable.taxTotal}),0)`,
      count:      sql<string>`COUNT(*)`,
      avgTicket:  sql<string>`COALESCE(AVG(${ticketsTable.total}),0)`,
    })
    .from(ticketsTable)
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)));

  const [tipRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${tipsTable.amount}),0)` })
    .from(tipsTable)
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, tipsTable.orderId))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)));

  const [discRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${discountsTable.discountAmount}),0)`, count: sql<string>`COUNT(*)` })
    .from(discountsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, discountsTable.orderId))
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, ordersTable.id))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)));

  const [voidRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}),0)`, count: sql<string>`COUNT(*)` })
    .from(paymentVoidsTable)
    .innerJoin(paymentsTable, eq(paymentsTable.id, paymentVoidsTable.originalPaymentId))
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, paymentsTable.orderId))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)));

  res.json({
    gross:          f2(ticket?.gross),
    net:            f2(ticket?.net),
    tax:            f2(ticket?.tax),
    ticketCount:    parseInt(ticket?.count ?? "0", 10),
    avgTicket:      f2(ticket?.avgTicket),
    tips:           f2(tipRow?.total),
    discountTotal:  f2(discRow?.total),
    discountCount:  parseInt(discRow?.count ?? "0", 10),
    voidTotal:      f2(voidRow?.total),
    voidCount:      parseInt(voidRow?.count ?? "0", 10),
  });
});

// ─── 2. Sales Trend ───────────────────────────────────────────────────────────

router.get("/reports/sales-trend", guard, async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const { from, to } = parseDateRange(q);
  const groupBy = ["day", "week", "month", "year"].includes(q.group_by)
    ? q.group_by
    : "day";

  const rows = await db
    .select({
      period: sql<string>`DATE_TRUNC(${groupBy}, ${ticketsTable.issuedAt})::text`,
      total:  sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      net:    sql<string>`COALESCE(SUM(${ticketsTable.subtotal}),0)`,
      count:  sql<string>`COUNT(*)`,
    })
    .from(ticketsTable)
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .groupBy(sql`DATE_TRUNC(${groupBy}, ${ticketsTable.issuedAt})`)
    .orderBy(sql`DATE_TRUNC(${groupBy}, ${ticketsTable.issuedAt})`);

  res.json(
    rows.map(r => ({
      period: r.period?.slice(0, 10) ?? "",
      total:  f2(r.total),
      net:    f2(r.net),
      count:  parseInt(r.count, 10),
    }))
  );
});

// ─── 3. Sales by Waiter ───────────────────────────────────────────────────────

router.get("/reports/by-waiter", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const rows = await db
    .select({
      employeeId: employeesTable.id,
      name:       employeesTable.name,
      total:      sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      net:        sql<string>`COALESCE(SUM(${ticketsTable.subtotal}),0)`,
      count:      sql<string>`COUNT(${ticketsTable.id})`,
      avgTicket:  sql<string>`COALESCE(AVG(${ticketsTable.total}),0)`,
    })
    .from(ticketsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, ticketsTable.employeeId))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .groupBy(employeesTable.id, employeesTable.name)
    .orderBy(desc(sql`SUM(${ticketsTable.total})`));

  res.json(
    rows.map(r => ({
      id:        r.employeeId,
      name:      r.name,
      total:     f2(r.total),
      net:       f2(r.net),
      count:     parseInt(r.count, 10),
      avgTicket: f2(r.avgTicket),
    }))
  );
});

// ─── 4. Sales by Zone / Table ─────────────────────────────────────────────────

router.get("/reports/by-zone", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const rows = await db
    .select({
      zoneId:    roomZonesTable.id,
      zoneName:  roomZonesTable.name,
      tableId:   restaurantTablesTable.id,
      tableName: restaurantTablesTable.name,
      total:     sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      count:     sql<string>`COUNT(${ticketsTable.id})`,
    })
    .from(ticketsTable)
    .innerJoin(ordersTable,           eq(ordersTable.id,          ticketsTable.orderId))
    .innerJoin(restaurantTablesTable, eq(restaurantTablesTable.id, ordersTable.tableId))
    .innerJoin(roomZonesTable,        eq(roomZonesTable.id,        restaurantTablesTable.zoneId))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .groupBy(roomZonesTable.id, roomZonesTable.name, restaurantTablesTable.id, restaurantTablesTable.name)
    .orderBy(desc(sql`SUM(${ticketsTable.total})`));

  // Group by zone
  const zones: Record<string, { zoneId: string; zoneName: string; total: number; count: number; tables: unknown[] }> = {};
  for (const r of rows) {
    if (!zones[r.zoneId]) zones[r.zoneId] = { zoneId: r.zoneId, zoneName: r.zoneName, total: 0, count: 0, tables: [] };
    const t = f2(r.total);
    const c = parseInt(r.count, 10);
    zones[r.zoneId].total  += t;
    zones[r.zoneId].count  += c;
    zones[r.zoneId].tables.push({ id: r.tableId, name: r.tableName, total: t, count: c });
  }

  res.json(Object.values(zones).sort((a, b) => b.total - a.total));
});

// ─── 5. Sales by Category & Product ──────────────────────────────────────────

router.get("/reports/by-product", guard, async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const { from, to } = parseDateRange(q);
  const limit = Math.min(parseInt(q.limit ?? "100", 10), 200);

  const rows = await db
    .select({
      categoryId:   categoriesTable.id,
      categoryName: categoriesTable.name,
      productId:    productsTable.id,
      productName:  productsTable.name,
      qty:          sql<string>`COALESCE(SUM(${orderItemsTable.quantity}),0)`,
      revenue:      sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice}),0)`,
    })
    .from(orderItemsTable)
    .innerJoin(ticketsTable,   eq(ticketsTable.orderId,  orderItemsTable.orderId))
    .innerJoin(productsTable,  eq(productsTable.id,      orderItemsTable.productId))
    .innerJoin(categoriesTable, eq(categoriesTable.id,   productsTable.categoryId))
    .where(
      and(
        gte(ticketsTable.issuedAt, from),
        lte(ticketsTable.issuedAt, to),
        eq(orderItemsTable.isInvitation, false),
      )
    )
    .groupBy(categoriesTable.id, categoriesTable.name, productsTable.id, productsTable.name)
    .orderBy(desc(sql`SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice})`))
    .limit(limit);

  // Aggregate by category
  const catMap: Record<string, { id: string; name: string; revenue: number; qty: number }> = {};
  for (const r of rows) {
    if (!catMap[r.categoryId]) catMap[r.categoryId] = { id: r.categoryId, name: r.categoryName, revenue: 0, qty: 0 };
    catMap[r.categoryId].revenue += f2(r.revenue);
    catMap[r.categoryId].qty     += parseInt(r.qty, 10);
  }

  res.json({
    products: rows.map(r => ({
      categoryId:   r.categoryId,
      categoryName: r.categoryName,
      productId:    r.productId,
      productName:  r.productName,
      qty:          parseInt(r.qty, 10),
      revenue:      f2(r.revenue),
    })),
    categories: Object.values(catMap).sort((a, b) => b.revenue - a.revenue),
  });
});

// ─── 6. VAT Breakdown ────────────────────────────────────────────────────────

router.get("/reports/vat", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const rows = await db
    .select({
      rate:  orderItemsTable.taxRate,
      base:  sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice}),0)`,
      cuota: sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice} * ${orderItemsTable.taxRate} / 100),0)`,
      qty:   sql<string>`COALESCE(SUM(${orderItemsTable.quantity}),0)`,
    })
    .from(orderItemsTable)
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, orderItemsTable.orderId))
    .where(
      and(
        gte(ticketsTable.issuedAt, from),
        lte(ticketsTable.issuedAt, to),
        eq(orderItemsTable.isInvitation, false),
      )
    )
    .groupBy(orderItemsTable.taxRate)
    .orderBy(orderItemsTable.taxRate);

  res.json(
    rows.map(r => ({
      rate:  r.rate,
      base:  f2(r.base),
      cuota: f2(r.cuota),
      total: f2(r.base) + f2(r.cuota),
      qty:   parseInt(r.qty, 10),
    }))
  );
});

// ─── 7. Payment Methods ───────────────────────────────────────────────────────

router.get("/reports/payments", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const rows = await db
    .select({
      methodId:   paymentMethodsTable.id,
      name:       paymentMethodsTable.name,
      code:       paymentMethodsTable.code,
      total:      sql<string>`COALESCE(SUM(${paymentsTable.amount}),0)`,
      count:      sql<string>`COUNT(${paymentsTable.id})`,
    })
    .from(paymentsTable)
    .innerJoin(paymentMethodsTable, eq(paymentMethodsTable.id, paymentsTable.paymentMethodId))
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, paymentsTable.orderId))
    .where(
      and(
        gte(ticketsTable.issuedAt, from),
        lte(ticketsTable.issuedAt, to),
        eq(paymentsTable.status, "completed"),
      )
    )
    .groupBy(paymentMethodsTable.id, paymentMethodsTable.name, paymentMethodsTable.code)
    .orderBy(desc(sql`SUM(${paymentsTable.amount})`));

  res.json(
    rows.map(r => ({
      methodId: r.methodId,
      name:     r.name,
      code:     r.code,
      total:    f2(r.total),
      count:    parseInt(r.count, 10),
    }))
  );
});

// ─── 8. Cash Sessions ─────────────────────────────────────────────────────────

router.get("/reports/cash", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const sessions = await db
    .select({
      id:           cashSessionsTable.id,
      terminalName: cashSessionsTable.terminalName,
      employeeName: employeesTable.name,
      openedAt:     cashSessionsTable.openedAt,
      closedAt:     cashSessionsTable.closedAt,
      status:       cashSessionsTable.status,
      openingFloat: cashSessionsTable.openingFloat,
      expectedCash: cashSessionsTable.expectedCash,
      countedCash:  cashSessionsTable.countedCash,
      difference:   cashSessionsTable.difference,
      inMovements:  sql<string>`COALESCE(SUM(CASE WHEN cm.movement_type='in' THEN cm.amount::numeric ELSE 0 END),0)`,
      outMovements: sql<string>`COALESCE(SUM(CASE WHEN cm.movement_type='out' THEN cm.amount::numeric ELSE 0 END),0)`,
    })
    .from(cashSessionsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, cashSessionsTable.employeeId))
    .leftJoin(cashMovementsTable, eq(cashMovementsTable.cashSessionId, cashSessionsTable.id))
    .where(
      and(
        gte(cashSessionsTable.openedAt, from),
        lte(cashSessionsTable.openedAt, to),
      )
    )
    .groupBy(
      cashSessionsTable.id, cashSessionsTable.terminalName, cashSessionsTable.openedAt,
      cashSessionsTable.closedAt, cashSessionsTable.status, cashSessionsTable.openingFloat,
      cashSessionsTable.expectedCash, cashSessionsTable.countedCash, cashSessionsTable.difference,
      employeesTable.name,
    )
    .orderBy(desc(cashSessionsTable.openedAt));

  res.json(
    sessions.map(s => ({
      id:           s.id,
      terminalName: s.terminalName,
      employeeName: s.employeeName,
      openedAt:     s.openedAt,
      closedAt:     s.closedAt,
      status:       s.status,
      openingFloat: f2(s.openingFloat),
      expectedCash: s.expectedCash != null ? f2(s.expectedCash) : null,
      countedCash:  s.countedCash  != null ? f2(s.countedCash)  : null,
      difference:   s.difference   != null ? f2(s.difference)   : null,
      inMovements:  f2(s.inMovements),
      outMovements: f2(s.outMovements),
    }))
  );
});

// ─── 9. Discounts & Voids ────────────────────────────────────────────────────

router.get("/reports/voids", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const discounts = await db
    .select({
      id:             discountsTable.id,
      orderId:        discountsTable.orderId,
      type:           discountsTable.type,
      value:          discountsTable.value,
      discountAmount: discountsTable.discountAmount,
      reason:         discountsTable.reason,
      authorizedBy:   employeesTable.name,
      createdAt:      discountsTable.createdAt,
    })
    .from(discountsTable)
    .innerJoin(ticketsTable, eq(ticketsTable.orderId, discountsTable.orderId))
    .leftJoin(employeesTable, eq(employeesTable.id, discountsTable.authorizedBy))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .orderBy(desc(discountsTable.createdAt));

  const voids = await db
    .select({
      id:           paymentVoidsTable.id,
      orderId:      paymentsTable.orderId,
      amount:       paymentsTable.amount,
      reason:       paymentVoidsTable.reason,
      authorizedBy: employeesTable.name,
      createdAt:    paymentVoidsTable.createdAt,
    })
    .from(paymentVoidsTable)
    .innerJoin(paymentsTable,   eq(paymentsTable.id,   paymentVoidsTable.originalPaymentId))
    .innerJoin(ticketsTable,    eq(ticketsTable.orderId, paymentsTable.orderId))
    .leftJoin(employeesTable,   eq(employeesTable.id,  paymentVoidsTable.authorizedBy))
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .orderBy(desc(paymentVoidsTable.createdAt));

  res.json({
    discounts: discounts.map(d => ({
      id:             d.id,
      orderId:        d.orderId,
      type:           d.type,
      value:          f2(d.value),
      discountAmount: f2(d.discountAmount),
      reason:         d.reason,
      authorizedBy:   d.authorizedBy,
      createdAt:      d.createdAt,
    })),
    voids: voids.map(v => ({
      id:           v.id,
      orderId:      v.orderId,
      amount:       f2(v.amount),
      reason:       v.reason,
      authorizedBy: v.authorizedBy,
      createdAt:    v.createdAt,
    })),
  });
});

// ─── 10. Peak Hours ───────────────────────────────────────────────────────────

router.get("/reports/peak-hours", guard, async (req: Request, res: Response): Promise<void> => {
  const { from, to } = parseDateRange(req.query as Record<string, string>);

  const rows = await db
    .select({
      hour:  sql<string>`EXTRACT(HOUR FROM ${ticketsTable.issuedAt})::int`,
      total: sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(ticketsTable)
    .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
    .groupBy(sql`EXTRACT(HOUR FROM ${ticketsTable.issuedAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ticketsTable.issuedAt})`);

  // Fill all 24 hours
  const byHour = new Array(24).fill(null).map((_, h) => ({ hour: h, total: 0, count: 0 }));
  for (const r of rows) {
    const h = parseInt(r.hour as unknown as string, 10);
    if (h >= 0 && h < 24) {
      byHour[h].total = f2(r.total);
      byHour[h].count = parseInt(r.count, 10);
    }
  }

  res.json(byHour);
});

// ─── 11. Top Products ─────────────────────────────────────────────────────────

router.get("/reports/top-products", guard, async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const { from, to } = parseDateRange(q);
  const limit = Math.min(parseInt(q.limit ?? "20", 10), 100);

  const rows = await db
    .select({
      productId:    productsTable.id,
      productName:  productsTable.name,
      categoryName: categoriesTable.name,
      qty:          sql<string>`COALESCE(SUM(${orderItemsTable.quantity}),0)`,
      revenue:      sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice}),0)`,
    })
    .from(orderItemsTable)
    .innerJoin(ticketsTable,    eq(ticketsTable.orderId, orderItemsTable.orderId))
    .innerJoin(productsTable,   eq(productsTable.id,     orderItemsTable.productId))
    .innerJoin(categoriesTable, eq(categoriesTable.id,   productsTable.categoryId))
    .where(
      and(
        gte(ticketsTable.issuedAt, from),
        lte(ticketsTable.issuedAt, to),
        eq(orderItemsTable.isInvitation, false),
      )
    )
    .groupBy(productsTable.id, productsTable.name, categoriesTable.name)
    .orderBy(desc(sql`SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice})`))
    .limit(limit);

  res.json(
    rows.map((r, i) => ({
      rank:         i + 1,
      productId:    r.productId,
      productName:  r.productName,
      categoryName: r.categoryName,
      qty:          parseInt(r.qty, 10),
      revenue:      f2(r.revenue),
    }))
  );
});

// ─── 12. Excel Export ────────────────────────────────────────────────────────

router.get("/reports/export/excel", guard, async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const { from, to } = parseDateRange(q);
  const label = `${q.from ?? "hoy"}_${q.to ?? "hoy"}`;

  // Fetch all data in parallel
  const [summaryRows, trendRows, waiterRows, productRows, vatRows, paymentRows] = await Promise.all([
    db.select({
      gross: sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      net:   sql<string>`COALESCE(SUM(${ticketsTable.subtotal}),0)`,
      tax:   sql<string>`COALESCE(SUM(${ticketsTable.taxTotal}),0)`,
      count: sql<string>`COUNT(*)`,
      avg:   sql<string>`COALESCE(AVG(${ticketsTable.total}),0)`,
    }).from(ticketsTable).where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to))),

    db.select({
      period: sql<string>`DATE_TRUNC('day', ${ticketsTable.issuedAt})::text`,
      total:  sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      count:  sql<string>`COUNT(*)`,
    }).from(ticketsTable)
      .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
      .groupBy(sql`DATE_TRUNC('day', ${ticketsTable.issuedAt})`)
      .orderBy(sql`DATE_TRUNC('day', ${ticketsTable.issuedAt})`),

    db.select({
      name:  employeesTable.name,
      total: sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      count: sql<string>`COUNT(*)`,
    }).from(ticketsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, ticketsTable.employeeId))
      .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to)))
      .groupBy(employeesTable.name)
      .orderBy(desc(sql`SUM(${ticketsTable.total})`)),

    db.select({
      categoryName: categoriesTable.name,
      productName:  productsTable.name,
      qty:          sql<string>`COALESCE(SUM(${orderItemsTable.quantity}),0)`,
      revenue:      sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice}),0)`,
    }).from(orderItemsTable)
      .innerJoin(ticketsTable,    eq(ticketsTable.orderId, orderItemsTable.orderId))
      .innerJoin(productsTable,   eq(productsTable.id,    orderItemsTable.productId))
      .innerJoin(categoriesTable, eq(categoriesTable.id,  productsTable.categoryId))
      .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to), eq(orderItemsTable.isInvitation, false)))
      .groupBy(categoriesTable.name, productsTable.name)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice})`))
      .limit(200),

    db.select({
      rate:  orderItemsTable.taxRate,
      base:  sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice}),0)`,
      cuota: sql<string>`COALESCE(SUM(${orderItemsTable.quantity} * ${orderItemsTable.unitPrice} * ${orderItemsTable.taxRate} / 100),0)`,
    }).from(orderItemsTable)
      .innerJoin(ticketsTable, eq(ticketsTable.orderId, orderItemsTable.orderId))
      .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to), eq(orderItemsTable.isInvitation, false)))
      .groupBy(orderItemsTable.taxRate)
      .orderBy(orderItemsTable.taxRate),

    db.select({
      name:  paymentMethodsTable.name,
      total: sql<string>`COALESCE(SUM(${paymentsTable.amount}),0)`,
      count: sql<string>`COUNT(*)`,
    }).from(paymentsTable)
      .innerJoin(paymentMethodsTable, eq(paymentMethodsTable.id, paymentsTable.paymentMethodId))
      .innerJoin(ticketsTable, eq(ticketsTable.orderId, paymentsTable.orderId))
      .where(and(gte(ticketsTable.issuedAt, from), lte(ticketsTable.issuedAt, to), eq(paymentsTable.status, "completed")))
      .groupBy(paymentMethodsTable.name)
      .orderBy(desc(sql`SUM(${paymentsTable.amount})`)),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Piccolo TPV";
  wb.created = new Date();

  const hStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5F74" } },
    alignment: { horizontal: "center" },
  };

  function addSheet(name: string, headers: string[], data: (string | number)[][]) {
    const ws = wb.addWorksheet(name);
    const hRow = ws.addRow(headers);
    hRow.eachCell(c => { Object.assign(c, hStyle); });
    data.forEach(row => ws.addRow(row));
    ws.columns.forEach(col => { col.width = 18; });
    return ws;
  }

  const s = summaryRows[0]!;
  addSheet("Resumen", ["Concepto", "Valor"], [
    ["Ventas brutas (€)", f2(s.gross)],
    ["Base imponible (€)", f2(s.net)],
    ["IVA total (€)", f2(s.tax)],
    ["Número de tickets", parseInt(s.count, 10)],
    ["Ticket medio (€)", f2(s.avg)],
  ]);

  addSheet("Ventas por día", ["Fecha", "Total (€)", "Tickets"],
    trendRows.map(r => [r.period?.slice(0, 10) ?? "", f2(r.total), parseInt(r.count, 10)]));

  addSheet("Por camarero", ["Camarero", "Total (€)", "Tickets"],
    waiterRows.map(r => [r.name, f2(r.total), parseInt(r.count, 10)]));

  addSheet("Por producto", ["Familia", "Producto", "Unidades", "Ingresos (€)"],
    productRows.map(r => [r.categoryName, r.productName, parseInt(r.qty, 10), f2(r.revenue)]));

  addSheet("IVA", ["Tipo IVA (%)", "Base (€)", "Cuota (€)", "Total (€)"],
    vatRows.map(r => [r.rate, f2(r.base), f2(r.cuota), f2(r.base) + f2(r.cuota)]));

  addSheet("Métodos de pago", ["Método", "Total (€)", "Transacciones"],
    paymentRows.map(r => [r.name, f2(r.total), parseInt(r.count, 10)]));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="informes-${label}.xlsx"`);
  const buf = await wb.xlsx.writeBuffer();
  res.end(buf);
});

export default router;

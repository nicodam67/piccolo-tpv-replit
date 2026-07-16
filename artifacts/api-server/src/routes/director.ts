/**
 * Director Module — Management Dashboard Metrics
 * All endpoints require admin|manager|encargado role.
 * Read-only aggregate queries over existing module tables — no data duplication.
 *
 * Routes:
 *   GET /director/kpis            — KPIs for period with comparisons
 *   GET /director/sales           — Sales breakdown with filters
 *   GET /director/profitability   — P&L estimation
 *   GET /director/cash            — Cash sessions summary
 *   GET /director/staff           — Staff overview
 *   GET /director/stock           — Stock overview
 *   GET /director/reservations    — Reservations overview
 *   GET /director/kitchen         — KDS overview
 *   GET /director/delivery        — Delivery overview
 *   GET /director/crm             — CRM overview
 *   GET /director/forecast        — 7-day sales forecast
 *   GET /director/daily-summary/:date — Snapshot of a closed day
 *   POST /director/snapshots/generate  — Pre-aggregate a day into director_daily_snapshots
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  ticketsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  cashSessionsTable,
  cashMovementsTable,
  employeesTable,
  timeRecordsTable,
  ingredientsTable,
  wasteRecordsTable,
  reservationsTable,
  kitchenTasksTable,
  crmClientsTable,
  crmLoyaltyPointsTable,
  crmGiftCardsTable,
  directorDailySnapshotsTable,
  directorCostsTable,
  directorGoalsTable,
  directorAlertsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, isNotNull, not, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import * as XLSX from "xlsx";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a date-range from query params. Defaults to today (local midnight). */
function parseDateRange(query: Record<string, string>): { from: Date; to: Date } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const fromStr = query.from ?? todayStr;
  const toStr = query.to ?? todayStr;

  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  return { from, to };
}

/** Shift a date range back by N days */
function shiftRange(from: Date, to: Date, days: number): { from: Date; to: Date } {
  const f = new Date(from); f.setDate(f.getDate() - days);
  const t = new Date(to);   t.setDate(t.getDate() - days);
  return { from: f, to: t };
}

/** Get ISO date string (YYYY-MM-DD) for a Date */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Aggregate ticket sales for a date range */
async function fetchTicketAggregates(from: Date, to: Date) {
  const rows = await db
    .select({
      total:         sql<string>`COALESCE(SUM(${ticketsTable.total}),0)`,
      subtotal:      sql<string>`COALESCE(SUM(${ticketsTable.subtotal}),0)`,
      taxTotal:      sql<string>`COALESCE(SUM(${ticketsTable.taxTotal}),0)`,
      count:         sql<string>`COUNT(*)`,
    })
    .from(ticketsTable)
    .where(
      and(
        gte(ticketsTable.issuedAt, from),
        lte(ticketsTable.issuedAt, to),
      )
    );
  const r = rows[0]!;
  return {
    gross:    parseFloat(r.total  ?? "0"),
    net:      parseFloat(r.subtotal ?? "0"),
    tax:      parseFloat(r.taxTotal ?? "0"),
    count:    parseInt(r.count ?? "0", 10),
  };
}

/** Aggregate order-level metrics (guests, channel) for a date range */
async function fetchOrderAggregates(from: Date, to: Date, filters: Record<string, string> = {}) {
  const conditions = [
    gte(ordersTable.createdAt, from),
    lte(ordersTable.createdAt, to),
    not(eq(ordersTable.status, "cancelled")),
  ];
  if (filters.zone)    conditions.push(sql`${ordersTable}.zone_id = ${filters.zone}`);
  if (filters.channel) conditions.push(eq(ordersTable.channel, filters.channel));

  const rows = await db
    .select({
      guests:        sql<string>`COALESCE(SUM(${ordersTable.guestCount}),0)`,
      total_orders:  sql<string>`COUNT(*)`,
      delivery_cnt:  sql<string>`COUNT(*) FILTER (WHERE ${ordersTable.deliveryType}='delivery')`,
      takeaway_cnt:  sql<string>`COUNT(*) FILTER (WHERE ${ordersTable.deliveryType}='takeaway')`,
    })
    .from(ordersTable)
    .where(and(...conditions));

  const r = rows[0]!;
  return {
    guests:      parseInt(r.guests ?? "0", 10),
    totalOrders: parseInt(r.total_orders ?? "0", 10),
    deliveryCnt: parseInt(r.delivery_cnt ?? "0", 10),
    takeawayCnt: parseInt(r.takeaway_cnt ?? "0", 10),
  };
}

/** Aggregate invitation (comanda gratis) totals */
async function fetchInvitationTotal(from: Date, to: Date): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${orderItemsTable.unitPrice} * ${orderItemsTable.quantity}), 0)` })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(orderItemsTable.isInvitation, true),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      )
    );
  return parseFloat(rows[0]?.total ?? "0");
}

/** Estimate labor cost from time_records + hourly_rate for the period */
async function fetchLaborCost(from: Date, to: Date): Promise<number> {
  const records = await db
    .select({
      clockIn:         timeRecordsTable.clockIn,
      clockOut:        timeRecordsTable.clockOut,
      hourlyRate:      employeesTable.hourlyRate,
      monthlySalary:   employeesTable.monthlySalary,
      employerCostRate: employeesTable.employerCostRate,
    })
    .from(timeRecordsTable)
    .innerJoin(employeesTable, eq(timeRecordsTable.employeeId, employeesTable.id))
    .where(
      and(
        gte(timeRecordsTable.clockIn, from),
        lte(timeRecordsTable.clockIn, to),
        isNotNull(timeRecordsTable.clockOut),
      )
    );

  let total = 0;
  for (const r of records) {
    const hours = (r.clockOut!.getTime() - r.clockIn.getTime()) / 3_600_000;
    const rate = r.hourlyRate
      ? parseFloat(r.hourlyRate)
      : r.monthlySalary
        ? parseFloat(r.monthlySalary) / (30 * 8)
        : 0;
    const employer = parseFloat(r.employerCostRate ?? "1.35");
    total += hours * rate * employer;
  }
  return Math.round(total * 100) / 100;
}

/** Estimate COGS for the period from order items × product cost */
async function fetchCogsEst(from: Date, to: Date): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(oi.quantity * COALESCE(pf.cost, p.cost, 0)), 0)::numeric AS cogs
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN product_formats pf ON pf.id = oi.format_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= ${from}
      AND o.created_at <= ${to}
      AND o.status <> 'cancelled'
      AND oi.is_invitation = false
  `);
  return parseFloat((rows.rows[0] as any)?.cogs ?? "0");
}

/** Get overhead cost allocated to a period */
async function fetchOverheadForPeriod(from: Date, to: Date): Promise<number> {
  const dayCount = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const costs = await db
    .select()
    .from(directorCostsTable)
    .where(
      and(
        not(eq(directorCostsTable.isDemo, true)),
        lte(directorCostsTable.effectiveDate, isoDate(to) as any),
        sql`(${directorCostsTable.endDate} IS NULL OR ${directorCostsTable.endDate} >= ${isoDate(from)})`
      )
    );

  let total = 0;
  for (const c of costs) {
    const amount = parseFloat(c.amount);
    switch (c.periodicity) {
      case "once":      total += amount; break;
      case "daily":     total += amount * dayCount; break;
      case "weekly":    total += amount * (dayCount / 7); break;
      case "monthly":   total += amount * (dayCount / 30); break;
      case "quarterly": total += amount * (dayCount / 91); break;
      case "yearly":    total += amount * (dayCount / 365); break;
    }
  }
  return Math.round(total * 100) / 100;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

router.get("/director/kpis", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

    // Comparison ranges
    const prev1  = shiftRange(from, to, days);       // same period previous
    const prevW  = shiftRange(from, to, 7);           // same days one week ago
    const prevY  = shiftRange(from, to, 365);         // same period last year

    // Parallel data fetch
    const [tickets, prevTickets, weekTickets, yearTickets,
           orderAgg, prevOrderAgg,
           laborCost, cogsEst, invitations,
           openAlerts, openTables, reservations] = await Promise.all([
      fetchTicketAggregates(from, to),
      fetchTicketAggregates(prev1.from, prev1.to),
      fetchTicketAggregates(prevW.from, prevW.to),
      fetchTicketAggregates(prevY.from, prevY.to),
      fetchOrderAggregates(from, to, q),
      fetchOrderAggregates(prev1.from, prev1.to),
      fetchLaborCost(from, to),
      fetchCogsEst(from, to),
      fetchInvitationTotal(from, to),
      // Open alerts count
      db.select({ cnt: sql<string>`COUNT(*)` })
        .from(directorAlertsTable as any)
        .where(eq((directorAlertsTable as any).status, "open")),
      // Open tables
      db.execute(sql`SELECT COUNT(*) AS cnt FROM restaurant_tables WHERE status='occupied'`),
      // Today's reservations
      db.select({ cnt: sql<string>`COUNT(*)` })
        .from(reservationsTable)
        .where(eq(reservationsTable.fecha, isoDate(from) as any)),
    ]);

    const gross   = tickets.gross;
    const net     = tickets.net;
    const guests  = orderAgg.guests;
    const count   = tickets.count;
    const avgTicket   = count > 0 ? Math.round((gross / count) * 100) / 100 : 0;
    const avgPerGuest = guests > 0 ? Math.round((gross / guests) * 100) / 100 : 0;
    const overhead    = await fetchOverheadForPeriod(from, to);

    const grossMargin = gross - cogsEst - laborCost;
    const operatingProfit = grossMargin - overhead;

    function delta(curr: number, prev: number) {
      if (prev === 0) return null;
      return { amount: Math.round((curr - prev) * 100) / 100, pct: Math.round(((curr - prev) / prev) * 1000) / 10 };
    }

    res.json({
      period: { from: isoDate(from), to: isoDate(to), days },
      sales: {
        gross, net, tax: tickets.tax, invitations,
        count, avgTicket, guests, avgPerGuest,
        deliveryOrders: orderAgg.deliveryCnt,
        takeawayOrders: orderAgg.takeawayCnt,
      },
      costs: {
        cogs:     cogsEst,
        labor:    laborCost,
        overhead,
        cogsEst:  true,
        laborEst: true,
      },
      margins: {
        grossMargin,
        grossMarginPct: gross > 0 ? Math.round((grossMargin / gross) * 1000) / 10 : 0,
        operatingProfit,
        allEstimated: true,
      },
      operations: {
        openTables:    parseInt((openTables.rows[0] as any)?.cnt ?? "0", 10),
        openAlerts:    parseInt((openAlerts[0] as any)?.cnt ?? "0", 10),
        reservations:  parseInt((reservations[0] as any)?.cnt ?? "0", 10),
      },
      comparisons: {
        prevPeriod: {
          gross: prevTickets.gross, count: prevTickets.count,
          guests: prevOrderAgg.guests,
          delta: delta(gross, prevTickets.gross),
          deltaCount: delta(count, prevTickets.count),
        },
        prevWeek: {
          gross: weekTickets.gross, count: weekTickets.count,
          delta: delta(gross, weekTickets.gross),
        },
        prevYear: {
          gross: yearTickets.gross, count: yearTickets.count,
          delta: delta(gross, yearTickets.gross),
          hasData: yearTickets.count > 0,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al calcular KPIs" });
  }
});

// ─── SALES BREAKDOWN ──────────────────────────────────────────────────────────

router.get("/director/sales", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);

    // Sales by hour
    const byHour = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM t.issued_at)::int AS hour,
        COUNT(*) AS ticket_count,
        COALESCE(SUM(t.total), 0) AS gross,
        COALESCE(SUM(t.subtotal), 0) AS net
      FROM tickets t
      WHERE t.issued_at >= ${from} AND t.issued_at <= ${to}
      GROUP BY hour ORDER BY hour
    `);

    // Sales by channel
    const byChannel = await db.execute(sql`
      SELECT
        COALESCE(o.channel, 'tpv') AS channel,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(t.total), 0) AS gross
      FROM orders o
      JOIN tickets t ON t.order_id = o.id
      WHERE t.issued_at >= ${from} AND t.issued_at <= ${to}
        AND o.status <> 'cancelled'
      GROUP BY channel
    `);

    // Sales by category
    const byCategory = await db.execute(sql`
      SELECT
        c.name AS category,
        COUNT(DISTINCT oi.id) AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS gross
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE o.created_at >= ${from} AND o.created_at <= ${to}
        AND o.status <> 'cancelled'
        AND oi.is_invitation = false
      GROUP BY c.id, c.name ORDER BY gross DESC
    `);

    // Sales by product (top 20)
    const byProduct = await db.execute(sql`
      SELECT
        p.name AS product,
        c.name AS category,
        SUM(oi.quantity) AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS gross,
        COALESCE(AVG(oi.unit_price), 0) AS avg_price,
        COALESCE(p.cost, 0) AS cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE o.created_at >= ${from} AND o.created_at <= ${to}
        AND o.status <> 'cancelled'
        AND oi.is_invitation = false
      GROUP BY p.id, p.name, c.name, p.cost
      ORDER BY gross DESC LIMIT 20
    `);

    // Sales by employee (waiter)
    const byEmployee = await db.execute(sql`
      SELECT
        e.name AS employee,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(t.total), 0) AS gross,
        COALESCE(SUM(o.guest_count), 0) AS guests
      FROM orders o
      JOIN employees e ON e.id = o.employee_id
      JOIN tickets t ON t.order_id = o.id
      WHERE t.issued_at >= ${from} AND t.issued_at <= ${to}
        AND o.status <> 'cancelled'
      GROUP BY e.id, e.name ORDER BY gross DESC
    `);

    // Payment method breakdown
    const byPayment = await db.execute(sql`
      SELECT
        pm.name AS method,
        pm.code AS code,
        COUNT(*) AS count,
        COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      JOIN payment_methods pm ON pm.id = p.payment_method_id
      JOIN tickets t ON t.order_id = p.order_id
      WHERE t.issued_at >= ${from} AND t.issued_at <= ${to}
        AND p.status = 'completed'
      GROUP BY pm.id, pm.name, pm.code ORDER BY total DESC
    `);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      byHour:     byHour.rows,
      byChannel:  byChannel.rows,
      byCategory: byCategory.rows,
      byProduct:  byProduct.rows,
      byEmployee: byEmployee.rows,
      byPayment:  byPayment.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener ventas" });
  }
});

// ─── PROFITABILITY ────────────────────────────────────────────────────────────

router.get("/director/profitability", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);
    const role = req.user!.role;
    const isManager = ["admin", "manager"].includes(role);

    const [tickets, laborCost, cogsEst, invitations, overhead] = await Promise.all([
      fetchTicketAggregates(from, to),
      fetchLaborCost(from, to),
      fetchCogsEst(from, to),
      fetchInvitationTotal(from, to),
      fetchOverheadForPeriod(from, to),
    ]);

    // Waste cost
    const waste = await db.execute(sql`
      SELECT COALESCE(SUM(total_cost), 0) AS total FROM waste_records
      WHERE created_at >= ${from} AND created_at <= ${to}
    `);
    const wasteCost = parseFloat((waste.rows[0] as any)?.total ?? "0");

    const gross  = tickets.gross;
    const net    = tickets.net;
    const cogs   = cogsEst + wasteCost;
    const grossMarginAmt = gross - cogs;
    const grossMarginPct = gross > 0 ? (grossMarginAmt / gross) * 100 : 0;
    const ebitdaEst = grossMarginAmt - (isManager ? laborCost : 0) - overhead;

    // By product (profitability matrix)
    const productMatrix = await db.execute(sql`
      SELECT
        p.name, c.name AS category,
        SUM(oi.quantity) AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS gross,
        COALESCE(p.cost, 0) AS unit_cost,
        COALESCE(SUM(oi.quantity * COALESCE(pf.cost, p.cost, 0)), 0) AS total_cost,
        COALESCE(SUM((oi.unit_price - COALESCE(pf.cost, p.cost, 0)) * oi.quantity), 0) AS margin_total
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_formats pf ON pf.id = oi.format_id
      WHERE o.created_at >= ${from} AND o.created_at <= ${to}
        AND o.status <> 'cancelled' AND oi.is_invitation = false
      GROUP BY p.id, p.name, c.name, p.cost
      ORDER BY gross DESC LIMIT 50
    `);

    const allProducts = (productMatrix.rows as any[]).map((r) => {
      const g = parseFloat(r.gross ?? "0");
      const mc = parseFloat(r.total_cost ?? "0");
      const mt = parseFloat(r.margin_total ?? "0");
      const units = parseFloat(r.units ?? "0");
      const avgUnits = productMatrix.rows.length > 0
        ? (productMatrix.rows as any[]).reduce((s, x) => s + parseFloat(x.units ?? "0"), 0) / productMatrix.rows.length
        : 0;
      const avgMarginPct = g > 0 ? (mt / g) * 100 : 0;
      return {
        ...r,
        gross: g, totalCost: mc, marginTotal: mt,
        marginPct: Math.round(avgMarginPct * 10) / 10,
        foodCostPct: g > 0 ? Math.round((mc / g) * 1000) / 10 : 0,
        // Matrix quadrant
        quadrant: units >= avgUnits
          ? (avgMarginPct >= 50 ? "star" : "plow")   // high sales
          : (avgMarginPct >= 50 ? "puzzle" : "dog"),  // low sales
      };
    });

    const response: Record<string, unknown> = {
      period: { from: isoDate(from), to: isoDate(to) },
      income: { gross, net, tax: tickets.tax, invitations },
      costs: {
        cogs: { value: cogsEst, estimated: true },
        waste: { value: wasteCost, estimated: false },
        overhead: { value: overhead, estimated: false },
      },
      margins: {
        grossMarginAmt: Math.round(grossMarginAmt * 100) / 100,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        ebitdaEst: Math.round(ebitdaEst * 100) / 100,
        allEstimated: true,
      },
      productMatrix: allProducts,
    };

    // Only show labor details to admin/manager
    if (isManager) {
      response.costs = { ...(response.costs as object), labor: { value: laborCost, estimated: true } };
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al calcular rentabilidad" });
  }
});

// ─── CASH ─────────────────────────────────────────────────────────────────────

router.get("/director/cash", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);

    const sessions = await db.execute(sql`
      SELECT
        cs.id, cs.opened_at, cs.closed_at,
        cs.opening_float, cs.expected_cash, cs.counted_cash, cs.difference,
        e.name AS employee_name,
        COUNT(DISTINCT t.id) AS ticket_count,
        COALESCE(SUM(t.total), 0) AS total_sales
      FROM cash_sessions cs
      LEFT JOIN employees e ON e.id = cs.employee_id
      LEFT JOIN tickets t ON t.cash_session_id = cs.id
      WHERE cs.opened_at >= ${from} AND cs.opened_at <= ${to}
      GROUP BY cs.id, e.name
      ORDER BY cs.opened_at DESC
    `);

    const paymentSummary = await db.execute(sql`
      SELECT
        pm.name AS method, pm.code,
        COUNT(p.id) AS count,
        COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      JOIN payment_methods pm ON pm.id = p.payment_method_id
      JOIN cash_sessions cs ON cs.id = p.cash_session_id
      WHERE cs.opened_at >= ${from} AND cs.opened_at <= ${to}
        AND p.status = 'completed'
      GROUP BY pm.id, pm.name, pm.code
      ORDER BY total DESC
    `);

    const movements = await db.execute(sql`
      SELECT
        cm.type, cm.amount, cm.reason, cm.created_at,
        e.name AS employee_name
      FROM cash_movements cm
      LEFT JOIN employees e ON e.id = cm.employee_id
      JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.opened_at >= ${from} AND cs.opened_at <= ${to}
      ORDER BY cm.created_at DESC LIMIT 50
    `);

    const diffSessions = (sessions.rows as any[]).filter(s => Math.abs(parseFloat(s.difference ?? "0")) > 0.01);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      sessions: sessions.rows,
      paymentSummary: paymentSummary.rows,
      movements: movements.rows,
      summary: {
        totalSessions: sessions.rows.length,
        sessionsWithDiff: diffSessions.length,
        totalDiff: diffSessions.reduce((s, r) => s + parseFloat(r.difference ?? "0"), 0),
        totalSales: (sessions.rows as any[]).reduce((s, r) => s + parseFloat(r.total_sales ?? "0"), 0),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de caja" });
  }
});

// ─── STAFF ────────────────────────────────────────────────────────────────────

router.get("/director/staff", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);
    const role = req.user!.role;
    const isManager = ["admin", "manager"].includes(role);

    // Hours per employee
    const records = await db.execute(sql`
      SELECT
        e.id, e.name, e.role,
        COUNT(tr.id) AS total_records,
        SUM(EXTRACT(EPOCH FROM (COALESCE(tr.clock_out, NOW()) - tr.clock_in))/3600)::numeric(8,2) AS hours_worked,
        COUNT(tr.id) FILTER (WHERE tr.clock_out IS NULL AND tr.clock_in < NOW() - INTERVAL '12 hours') AS incomplete
      FROM employees e
      LEFT JOIN time_records tr ON tr.employee_id = e.id
        AND tr.clock_in >= ${from} AND tr.clock_in <= ${to}
      WHERE e.active = true
      GROUP BY e.id, e.name, e.role
      ORDER BY hours_worked DESC NULLS LAST
    `);

    // Currently clocked in
    const clockedIn = await db.execute(sql`
      SELECT e.name, tr.clock_in
      FROM time_records tr
      JOIN employees e ON e.id = tr.employee_id
      WHERE tr.clock_in >= CURRENT_DATE AND tr.clock_out IS NULL
      ORDER BY tr.clock_in
    `);

    // Incomplete fichajes
    const incomplete = await db.execute(sql`
      SELECT e.name, tr.clock_in
      FROM time_records tr
      JOIN employees e ON e.id = tr.employee_id
      WHERE tr.clock_in >= ${from} AND tr.clock_in <= ${to}
        AND tr.clock_out IS NULL
        AND tr.clock_in < NOW() - INTERVAL '12 hours'
    `);

    const response: Record<string, unknown> = {
      period: { from: isoDate(from), to: isoDate(to) },
      employees: records.rows,
      clockedInNow: clockedIn.rows,
      incomplete: incomplete.rows,
      summary: {
        totalActive: records.rows.length,
        clockedInCount: clockedIn.rows.length,
        incompleteCount: incomplete.rows.length,
      },
    };

    if (isManager) {
      const laborCost = await fetchLaborCost(from, to);
      const salesAgg  = await fetchTicketAggregates(from, to);
      response.laborCost = laborCost;
      response.laborPct  = salesAgg.gross > 0
        ? Math.round((laborCost / salesAgg.gross) * 1000) / 10
        : 0;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de personal" });
  }
});

// ─── STOCK ────────────────────────────────────────────────────────────────────

router.get("/director/stock", ...guard, async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, string>);

    const [stockSummary, belowMin, nearExpiry, wasteTotal] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) AS total_ingredients,
          COUNT(*) FILTER (WHERE current_stock <= 0) AS out_of_stock,
          COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock) AS below_min,
          COALESCE(SUM(current_stock * average_cost), 0) AS stock_value
        FROM ingredients WHERE is_active = true
      `),
      db.execute(sql`
        SELECT name, unit, current_stock, min_stock, average_cost
        FROM ingredients WHERE current_stock <= min_stock AND is_active = true
        ORDER BY current_stock ASC LIMIT 20
      `),
      db.execute(sql`
        SELECT i.name, il.lot_number, il.expiry_date, il.quantity_remaining
        FROM ingredient_lots il
        JOIN ingredients i ON i.id = il.ingredient_id
        WHERE il.expiry_date IS NOT NULL
          AND il.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
          AND il.quantity_remaining > 0
        ORDER BY il.expiry_date ASC LIMIT 20
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(total_cost), 0) AS total,
          COUNT(*) AS events
        FROM waste_records
        WHERE created_at >= ${from} AND created_at <= ${to}
      `),
    ]);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      summary: stockSummary.rows[0],
      belowMin: belowMin.rows,
      nearExpiry: nearExpiry.rows,
      waste: wasteTotal.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de stock" });
  }
});

// ─── RESERVATIONS ─────────────────────────────────────────────────────────────

router.get("/director/reservations", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);

    const summary = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='confirmada') AS confirmed,
        COUNT(*) FILTER (WHERE status='pendiente') AS pending,
        COUNT(*) FILTER (WHERE status='cancelada') AS cancelled,
        COUNT(*) FILTER (WHERE status='no_show') AS no_show,
        COALESCE(SUM(personas), 0) AS total_guests,
        COALESCE(AVG(personas), 0) AS avg_guests
      FROM reservations
      WHERE fecha >= ${isoDate(from)} AND fecha <= ${isoDate(to)}
    `);

    // Upcoming today (next 4 hours)
    const upcoming = await db.execute(sql`
      SELECT r.*, c.name AS client_name
      FROM reservations r
      LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.fecha = CURRENT_DATE
        AND r.status NOT IN ('cancelada', 'completada')
      ORDER BY r.hora ASC LIMIT 10
    `);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      summary: summary.rows[0],
      upcoming: upcoming.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener reservas" });
  }
});

// ─── KITCHEN / KDS ────────────────────────────────────────────────────────────

router.get("/director/kitchen", ...guard, async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, string>);

    const [summary, byStation, delayed] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='pending') AS pending,
          COUNT(*) FILTER (WHERE status='preparing') AS preparing,
          COUNT(*) FILTER (WHERE status='ready') AS ready,
          COUNT(*) FILTER (WHERE status='collected') AS collected,
          AVG(EXTRACT(EPOCH FROM (COALESCE(ready_at, NOW()) - created_at))/60)
            FILTER (WHERE ready_at IS NOT NULL)::numeric(6,2) AS avg_prep_min,
          COUNT(*) FILTER (
            WHERE status IN ('pending','preparing')
            AND created_at < NOW() - INTERVAL '20 minutes'
          ) AS delayed
        FROM kitchen_tasks
        WHERE created_at >= ${from} AND created_at <= ${to}
      `),
      db.execute(sql`
        SELECT
          prep_zone,
          COUNT(*) AS total,
          AVG(EXTRACT(EPOCH FROM (COALESCE(ready_at, NOW()) - created_at))/60)
            FILTER (WHERE ready_at IS NOT NULL)::numeric(6,2) AS avg_prep_min
        FROM kitchen_tasks
        WHERE created_at >= ${from} AND created_at <= ${to}
        GROUP BY prep_zone
      `),
      db.execute(sql`
        SELECT kt.*, p.name AS product_name
        FROM kitchen_tasks kt
        LEFT JOIN products p ON p.id = kt.product_id
        WHERE kt.status IN ('pending','preparing')
          AND kt.created_at < NOW() - INTERVAL '20 minutes'
        ORDER BY kt.created_at ASC LIMIT 10
      `),
    ]);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      summary: summary.rows[0],
      byStation: byStation.rows,
      delayed: delayed.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de cocina" });
  }
});

// ─── DELIVERY ─────────────────────────────────────────────────────────────────

router.get("/director/delivery", ...guard, async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, string>);

    const summary = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE delivery_status='pending') AS pending,
        COUNT(*) FILTER (WHERE delivery_status='preparing') AS preparing,
        COUNT(*) FILTER (WHERE delivery_status='ready') AS ready,
        COUNT(*) FILTER (WHERE delivery_status='out_for_delivery') AS out_for_delivery,
        COUNT(*) FILTER (WHERE delivery_status='delivered') AS delivered,
        COUNT(*) FILTER (WHERE delivery_status='failed') AS failed,
        COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - o.created_at))/60)
          FILTER (WHERE delivered_at IS NOT NULL), 0)::numeric(6,2) AS avg_delivery_min,
        COALESCE(SUM(delivery_fee), 0) AS total_delivery_fees
      FROM delivery_orders dord
      JOIN orders o ON o.id = dord.order_id
      WHERE o.created_at >= ${from} AND o.created_at <= ${to}
    `);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      summary: summary.rows[0] ?? {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de reparto" });
  }
});

// ─── CRM ──────────────────────────────────────────────────────────────────────

router.get("/director/crm", ...guard, async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, string>);

    const [clients, giftCards, loyalty] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) AS total_clients,
          COUNT(*) FILTER (WHERE created_at >= ${from} AND created_at <= ${to}) AS new_clients,
          COUNT(*) FILTER (WHERE last_visit >= ${from} AND last_visit <= ${to}) AS active_clients
        FROM crm_clients
      `),
      db.execute(sql`
        SELECT
          COUNT(*) AS total_cards,
          COALESCE(SUM(current_balance), 0) AS total_balance,
          COUNT(*) FILTER (WHERE created_at >= ${from} AND created_at <= ${to}) AS new_cards
        FROM crm_gift_cards WHERE is_active = true
      `),
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE type='earn' AND created_at >= ${from} AND created_at <= ${to}) AS points_earned_txns,
          COALESCE(SUM(points) FILTER (WHERE type='earn' AND created_at >= ${from} AND created_at <= ${to}), 0) AS points_earned,
          COALESCE(SUM(ABS(points)) FILTER (WHERE type='redeem' AND created_at >= ${from} AND created_at <= ${to}), 0) AS points_redeemed
        FROM crm_loyalty_points
      `),
    ]);

    res.json({
      period: { from: isoDate(from), to: isoDate(to) },
      clients: clients.rows[0],
      giftCards: giftCards.rows[0],
      loyalty: loyalty.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos CRM" });
  }
});

// ─── FORECAST (7-day simple weighted average by day-of-week) ─────────────────

router.get("/director/forecast", ...guard, async (req, res) => {
  try {
    // Use last 8 weeks of the same weekday as the basis
    const forecastDays: Array<{
      date: string; dayOfWeek: number; reservations: number;
      forecastGross: number; forecastTickets: number;
    }> = [];

    for (let d = 0; d < 7; d++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + d + 1);
      const dow = targetDate.getDay(); // 0=Sun
      const dateStr = isoDate(targetDate);

      // Last 8 occurrences of the same weekday
      const hist = await db.execute(sql`
        SELECT
          DATE(t.issued_at) AS day,
          COUNT(*) AS tickets,
          COALESCE(SUM(t.total), 0) AS gross
        FROM tickets t
        WHERE EXTRACT(DOW FROM t.issued_at) = ${dow}
          AND t.issued_at >= NOW() - INTERVAL '56 days'
          AND DATE(t.issued_at) < CURRENT_DATE
        GROUP BY day
        ORDER BY day DESC LIMIT 8
      `);

      const rows = hist.rows as any[];
      const avgGross   = rows.length > 0 ? rows.reduce((s, r) => s + parseFloat(r.gross ?? "0"), 0) / rows.length : 0;
      const avgTickets = rows.length > 0 ? rows.reduce((s, r) => s + parseInt(r.tickets ?? "0", 10), 0) / rows.length : 0;

      // Count reservations for target date
      const resvCount = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM reservations
        WHERE fecha = ${dateStr} AND status NOT IN ('cancelada')
      `);
      const resv = parseInt((resvCount.rows[0] as any)?.cnt ?? "0", 10);

      // Boost: +1% per reservation above 5
      const boost = resv > 5 ? 1 + (resv - 5) * 0.01 : 1;

      forecastDays.push({
        date: dateStr,
        dayOfWeek: dow,
        reservations: resv,
        forecastGross:   Math.round(avgGross * boost * 100) / 100,
        forecastTickets: Math.round(avgTickets * boost),
      });
    }

    res.json({
      method: "weighted_avg_8_weeks_dow",
      isEstimate: true,
      days: forecastDays,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al calcular previsión" });
  }
});

// ─── DAILY SUMMARY ────────────────────────────────────────────────────────────

router.get("/director/daily-summary/:date", ...guard, async (req, res) => {
  try {
    const dateStr = req.params.date as string;
    const from    = new Date(`${dateStr}T00:00:00.000Z`);
    const to      = new Date(`${dateStr}T23:59:59.999Z`);

    // Try snapshot first (fast path)
    const [snap] = await db
      .select()
      .from(directorDailySnapshotsTable)
      .where(eq(directorDailySnapshotsTable.snapshotDate, dateStr));

    if (snap && !snap.isPartial) {
      res.json({ source: "snapshot", data: snap });
      return;
    }

    // Live calculation
    const [tickets, orderAgg, laborCost, cogsEst, waste, reservations, alerts] = await Promise.all([
      fetchTicketAggregates(from, to),
      fetchOrderAggregates(from, to),
      fetchLaborCost(from, to),
      fetchCogsEst(from, to),
      db.execute(sql`SELECT COALESCE(SUM(total_cost),0) AS total FROM waste_records WHERE created_at >= ${from} AND created_at <= ${to}`),
      db.execute(sql`SELECT COUNT(*) AS cnt, COALESCE(SUM(personas),0) AS guests FROM reservations WHERE fecha = ${dateStr}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM director_alerts WHERE DATE(created_at) = ${dateStr} AND status='open'`),
    ]);

    const gross  = tickets.gross;
    const labor  = laborCost;
    const cogs   = cogsEst + parseFloat((waste.rows[0] as any)?.total ?? "0");

    res.json({
      source: "live",
      date: dateStr,
      sales: { gross, net: tickets.net, tax: tickets.tax, count: tickets.count, guests: orderAgg.guests },
      costs: { cogs, labor, estimated: true },
      margins: { gross: gross - cogs - labor, pct: gross > 0 ? ((gross - cogs - labor) / gross) * 100 : 0 },
      reservations: reservations.rows[0],
      openAlerts: parseInt((alerts.rows[0] as any)?.cnt ?? "0", 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener resumen diario" });
  }
});

// ─── SNAPSHOT GENERATOR ───────────────────────────────────────────────────────

router.post("/director/snapshots/generate", ...guard, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { date } = req.body as { date?: string };
    const dateStr = date ?? isoDate(new Date());
    const from    = new Date(`${dateStr}T00:00:00.000Z`);
    const to      = new Date(`${dateStr}T23:59:59.999Z`);
    const isToday = dateStr === isoDate(new Date());

    const [tickets, orderAgg, laborCost, cogsEst, reservations] = await Promise.all([
      fetchTicketAggregates(from, to),
      fetchOrderAggregates(from, to),
      fetchLaborCost(from, to),
      fetchCogsEst(from, to),
      db.execute(sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='confirmada') AS kept FROM reservations WHERE fecha = ${dateStr}`),
    ]);

    const gross  = tickets.gross;
    const count  = tickets.count;
    const guests = orderAgg.guests;

    const snap = {
      snapshotDate:      dateStr,
      salesGross:        String(gross),
      salesNet:          String(tickets.net),
      taxTotal:          String(tickets.tax),
      ticketCount:       count,
      guestCount:        guests,
      avgTicket:         count > 0 ? String(Math.round((gross / count) * 100) / 100) : "0",
      avgPerGuest:       guests > 0 ? String(Math.round((gross / guests) * 100) / 100) : "0",
      ordersDelivery:    orderAgg.deliveryCnt,
      ordersTakeaway:    orderAgg.takeawayCnt,
      laborCostEst:      String(laborCost),
      cogsEst:           String(cogsEst),
      reservationsTotal: parseInt((reservations.rows[0] as any)?.total ?? "0", 10),
      reservationsKept:  parseInt((reservations.rows[0] as any)?.kept ?? "0", 10),
      isPartial:         isToday,
    };

    const [saved] = await db
      .insert(directorDailySnapshotsTable)
      .values(snap as any)
      .onConflictDoUpdate({ target: directorDailySnapshotsTable.snapshotDate, set: snap as any })
      .returning();

    res.json({ ok: true, snapshot: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar snapshot" });
  }
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

router.get("/director/export", ...guard, async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const { from, to } = parseDateRange(q);
    const format = (q.format ?? "csv") as "csv" | "xlsx";
    const type   = q.type ?? "sales";

    let data: any[] = [];
    let sheetName = type;

    if (type === "sales") {
      const rows = await db.execute(sql`
        SELECT
          DATE(t.issued_at) AS fecha,
          t.ticket_number AS ticket,
          t.subtotal AS neto,
          t.tax_total AS iva,
          t.total AS bruto,
          pm.name AS forma_pago,
          e.name AS camarero,
          COALESCE(o.channel, 'tpv') AS canal
        FROM tickets t
        LEFT JOIN orders o ON o.id = t.order_id
        LEFT JOIN payments p ON p.order_id = t.order_id AND p.status='completed'
        LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
        LEFT JOIN employees e ON e.id = o.employee_id
        WHERE t.issued_at >= ${from} AND t.issued_at <= ${to}
        ORDER BY t.issued_at DESC
      `);
      data = rows.rows as any[];
      sheetName = "Ventas";
    } else if (type === "profitability") {
      const rows = await db.execute(sql`
        SELECT
          p.name AS producto,
          c.name AS categoria,
          SUM(oi.quantity) AS unidades,
          COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS facturacion,
          COALESCE(p.cost, 0) AS coste_unitario,
          COALESCE(SUM(oi.quantity * COALESCE(pf.cost, p.cost, 0)), 0) AS coste_total,
          COALESCE(SUM((oi.unit_price - COALESCE(pf.cost, p.cost, 0)) * oi.quantity), 0) AS margen_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN product_formats pf ON pf.id = oi.format_id
        WHERE o.created_at >= ${from} AND o.created_at <= ${to}
          AND o.status <> 'cancelled'
        GROUP BY p.id, p.name, c.name, p.cost
        ORDER BY facturacion DESC
      `);
      data = rows.rows as any[];
      sheetName = "Rentabilidad";
    }

    if (format === "xlsx") {
      const ws   = XLSX.utils.json_to_sheet(data);
      const wb   = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buf  = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="director_${type}_${isoDate(from)}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } else {
      if (data.length === 0) { res.json([]); return; }
      const headers = Object.keys(data[0]).join(",");
      const csvRows = data.map(r => Object.values(r).map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
      const csv = [headers, ...csvRows].join("\n");
      res.setHeader("Content-Disposition", `attachment; filename="director_${type}_${isoDate(from)}.csv"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send("\uFEFF" + csv);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar" });
  }
});

export default router;

/**
 * Director Management — CRUD for Goals, Costs, Alerts, Custom Reports + Demo Data
 *
 * Routes:
 *   GET/POST        /director/goals
 *   PATCH/DELETE    /director/goals/:id
 *   GET/POST        /director/costs
 *   PATCH/DELETE    /director/costs/:id
 *   GET/POST        /director/alerts
 *   PATCH           /director/alerts/:id
 *   GET/POST        /director/custom-reports
 *   POST            /director/custom-reports/:id/run
 *   DELETE          /director/custom-reports/:id
 *   POST            /director/demo-data
 *   DELETE          /director/demo-data
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  directorGoalsTable,
  directorCostsTable,
  directorAlertsTable,
  directorCustomReportsTable,
  ticketsTable,
  cashSessionsTable,
  ingredientsTable,
  timeRecordsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();
const guard  = [requireAuth, requireRole("admin", "manager", "encargado")];
const adminGuard = [requireAuth, requireRole("admin", "manager")];

// ─── GOALS ────────────────────────────────────────────────────────────────────

router.get("/director/goals", ...guard, async (req, res) => {
  try {
    const { active } = req.query as Record<string, string>;
    let query = db.select().from(directorGoalsTable).$dynamic();
    if (active !== undefined) query = query.where(eq(directorGoalsTable.active, active !== "false"));
    const rows = await query.orderBy(desc(directorGoalsTable.createdAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al obtener objetivos" }); }
});

router.post("/director/goals", ...adminGuard, async (req, res) => {
  try {
    const body = req.body as typeof directorGoalsTable.$inferInsert;
    const [row] = await db.insert(directorGoalsTable)
      .values({ ...body, createdBy: req.user!.id })
      .returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al crear objetivo" }); }
});

router.patch("/director/goals/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [row] = await db.update(directorGoalsTable)
      .set({ ...req.body as object, updatedAt: new Date() })
      .where(eq(directorGoalsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Objetivo no encontrado" }); return; }
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al actualizar objetivo" }); }
});

router.delete("/director/goals/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(directorGoalsTable).where(eq(directorGoalsTable.id, id));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al eliminar objetivo" }); }
});

// Goal progress: calculate actual vs. target for active goals
router.get("/director/goals/progress", ...guard, async (req, res) => {
  try {
    const goals = await db.select().from(directorGoalsTable)
      .where(eq(directorGoalsTable.active, true));

    const results = await Promise.all(goals.map(async (g) => {
      const now     = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      // Determine period range
      let from: Date, to: Date;
      if (g.periodStart && g.periodEnd) {
        from = new Date(`${g.periodStart}T00:00:00.000Z`);
        to   = new Date(`${g.periodEnd}T23:59:59.999Z`);
      } else {
        const y = now.getFullYear(), m = now.getMonth();
        switch (g.period) {
          case "daily":   from = new Date(`${todayStr}T00:00:00.000Z`); to = new Date(`${todayStr}T23:59:59.999Z`); break;
          case "weekly":  { const d = now.getDay(); from = new Date(now); from.setDate(now.getDate() - d); from.setHours(0,0,0,0); to = new Date(); break; }
          case "monthly": from = new Date(y, m, 1); to = new Date(y, m + 1, 0, 23, 59, 59); break;
          case "yearly":  from = new Date(y, 0, 1); to = new Date(y, 11, 31, 23, 59, 59); break;
          default:        from = new Date(`${todayStr}T00:00:00.000Z`); to = new Date();
        }
      }

      let actual = 0;
      try {
        switch (g.type) {
          case "sales_daily":
          case "sales_weekly":
          case "sales_monthly":
          case "sales_yearly": {
            const rows = await db.execute(sql`
              SELECT COALESCE(SUM(total), 0) AS val FROM tickets
              WHERE issued_at >= ${from} AND issued_at <= ${to}
            `);
            actual = parseFloat((rows.rows[0] as any)?.val ?? "0");
            break;
          }
          case "avg_ticket": {
            const rows = await db.execute(sql`
              SELECT COALESCE(AVG(total), 0) AS val FROM tickets
              WHERE issued_at >= ${from} AND issued_at <= ${to}
            `);
            actual = parseFloat((rows.rows[0] as any)?.val ?? "0");
            break;
          }
          case "labor_pct": {
            const sales = await db.execute(sql`SELECT COALESCE(SUM(total),0) AS val FROM tickets WHERE issued_at >= ${from} AND issued_at <= ${to}`);
            const gross = parseFloat((sales.rows[0] as any)?.val ?? "0");
            if (gross > 0) {
              const records = await db.select({
                clockIn: timeRecordsTable.clockIn,
                clockOut: timeRecordsTable.clockOut,
                hourlyRate: employeesTable.hourlyRate,
                monthlySalary: employeesTable.monthlySalary,
                employerCostRate: employeesTable.employerCostRate,
              }).from(timeRecordsTable)
                .innerJoin(employeesTable, eq(timeRecordsTable.employeeId, employeesTable.id))
                .where(and(gte(timeRecordsTable.clockIn, from), lte(timeRecordsTable.clockIn, to)));
              let labor = 0;
              for (const r of records) {
                if (!r.clockOut) continue;
                const h = (r.clockOut.getTime() - r.clockIn.getTime()) / 3_600_000;
                const rate = r.hourlyRate ? parseFloat(r.hourlyRate) : r.monthlySalary ? parseFloat(r.monthlySalary) / 240 : 0;
                labor += h * rate * parseFloat(r.employerCostRate ?? "1.35");
              }
              actual = (labor / gross) * 100;
            }
            break;
          }
          default: actual = 0;
        }
      } catch { actual = 0; }

      const target     = parseFloat(g.targetValue);
      const progress   = target > 0 ? Math.min(Math.round((actual / target) * 1000) / 10, 999) : 0;
      const deviation  = actual - target;
      const deviationPct = target > 0 ? Math.round((deviation / target) * 1000) / 10 : 0;

      return {
        ...g,
        actual: Math.round(actual * 100) / 100,
        target,
        progress,
        deviation: Math.round(deviation * 100) / 100,
        deviationPct,
        favorable: ["labor_pct", "cogs_pct"].includes(g.type) ? deviation < 0 : deviation >= 0,
        periodFrom: from.toISOString().slice(0, 10),
        periodTo:   to.toISOString().slice(0, 10),
      };
    }));

    res.json(results);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al calcular progreso de objetivos" }); }
});

// ─── COSTS ────────────────────────────────────────────────────────────────────

router.get("/director/costs", ...adminGuard, async (req, res) => {
  try {
    const { category, status } = req.query as Record<string, string>;
    let query = db.select().from(directorCostsTable)
      .where(eq(directorCostsTable.isDemo, false))
      .$dynamic();
    const conds = [eq(directorCostsTable.isDemo, false)];
    if (category) conds.push(eq(directorCostsTable.category, category));
    if (status)   conds.push(eq(directorCostsTable.paidStatus, status));
    const rows = await db.select().from(directorCostsTable)
      .where(and(...conds))
      .orderBy(desc(directorCostsTable.effectiveDate));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al obtener costes" }); }
});

router.post("/director/costs", ...adminGuard, async (req, res) => {
  try {
    const [row] = await db.insert(directorCostsTable)
      .values({ ...req.body as object, createdBy: req.user!.id, isDemo: false } as any)
      .returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al crear coste" }); }
});

router.patch("/director/costs/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [row] = await db.update(directorCostsTable)
      .set({ ...req.body as object, updatedAt: new Date() } as any)
      .where(and(eq(directorCostsTable.id, id), eq(directorCostsTable.isDemo, false)))
      .returning();
    if (!row) { res.status(404).json({ error: "Coste no encontrado" }); return; }
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al actualizar coste" }); }
});

router.delete("/director/costs/:id", ...adminGuard, async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(directorCostsTable)
      .where(and(eq(directorCostsTable.id, id), eq(directorCostsTable.isDemo, false)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al eliminar coste" }); }
});

// ─── ALERTS ───────────────────────────────────────────────────────────────────

router.get("/director/alerts", ...guard, async (req, res) => {
  try {
    const { status, priority, limit = "50" } = req.query as Record<string, string>;
    const conds = [eq(directorAlertsTable.isDemo, false)];
    if (status)   conds.push(eq(directorAlertsTable.status, status));
    if (priority) conds.push(eq(directorAlertsTable.priority, priority));
    const rows = await db.select().from(directorAlertsTable)
      .where(and(...conds))
      .orderBy(
        sql`CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`,
        desc(directorAlertsTable.createdAt)
      )
      .limit(parseInt(limit, 10));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al obtener alertas" }); }
});

router.post("/director/alerts", ...guard, async (req, res) => {
  try {
    const [row] = await db.insert(directorAlertsTable)
      .values({ ...req.body as object, isDemo: false } as any)
      .returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al crear alerta" }); }
});

router.patch("/director/alerts/:id", ...guard, async (req, res) => {
  const id   = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  try {
    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.status === "resolved" && !body.resolvedAt) {
      updates.resolvedAt = new Date();
      updates.resolvedBy = req.user!.id;
    }
    if (body.assignedTo && !body.assignedAt) {
      updates.assignedAt = new Date();
    }
    const [row] = await db.update(directorAlertsTable)
      .set(updates as any)
      .where(eq(directorAlertsTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Alerta no encontrada" }); return; }
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al actualizar alerta" }); }
});

// Auto-generate alerts based on current data
router.post("/director/alerts/generate", ...adminGuard, async (req, res) => {
  try {
    const todayStr  = new Date().toISOString().slice(0, 10);
    const from      = new Date(`${todayStr}T00:00:00.000Z`);
    const to        = new Date(`${todayStr}T23:59:59.999Z`);
    const generated: string[] = [];

    // Helper: create alert if not already open for same source+day
    async function maybeAlert(priority: string, source: string, title: string, detail: string, module: string) {
      const existing = await db.execute(sql`
        SELECT id FROM director_alerts
        WHERE source = ${source} AND status = 'open'
          AND DATE(created_at) = ${todayStr} AND is_demo = false
        LIMIT 1
      `);
      if (existing.rows.length > 0) return;
      await db.insert(directorAlertsTable).values({
        priority, source, title, detail, status: "open", originModule: module, isDemo: false,
      } as any);
      generated.push(title);
    }

    // 1. Cash sessions with large difference (> 5 EUR)
    const cashdiff = await db.execute(sql`
      SELECT id, difference FROM cash_sessions
      WHERE DATE(opened_at) = ${todayStr} AND ABS(difference) > 5
    `);
    for (const s of cashdiff.rows as any[]) {
      await maybeAlert("high", "cash_diff",
        `Diferencia de caja: ${parseFloat(s.difference).toFixed(2)} €`,
        `Sesión de caja con diferencia de ${parseFloat(s.difference).toFixed(2)} €`,
        "caja");
    }

    // 2. Low sales today (< 50% of 4-week average for this weekday)
    const dow = new Date().getDay();
    const avgSales = await db.execute(sql`
      SELECT COALESCE(AVG(daily_total), 0) AS avg FROM (
        SELECT DATE(issued_at) AS d, SUM(total) AS daily_total FROM tickets
        WHERE EXTRACT(DOW FROM issued_at) = ${dow}
          AND issued_at >= NOW() - INTERVAL '28 days' AND DATE(issued_at) < CURRENT_DATE
        GROUP BY d
      ) sub
    `);
    const avg4w = parseFloat((avgSales.rows[0] as any)?.avg ?? "0");
    if (avg4w > 0) {
      const todaySales = await db.execute(sql`SELECT COALESCE(SUM(total),0) AS total FROM tickets WHERE issued_at >= ${from} AND issued_at <= ${to}`);
      const todayTotal = parseFloat((todaySales.rows[0] as any)?.total ?? "0");
      if (todayTotal < avg4w * 0.5 && new Date().getHours() >= 15) {
        await maybeAlert("medium", "low_sales",
          `Ventas bajas: ${todayTotal.toFixed(0)} € (media ${avg4w.toFixed(0)} €)`,
          `Las ventas de hoy son inferiores al 50% de la media de las últimas 4 semanas para este día`,
          "ventas");
      }
    }

    // 3. Stock negativo o productos agotados
    const zeroStock = await db.execute(sql`SELECT COUNT(*) AS cnt FROM ingredients WHERE current_stock <= 0 AND is_active = true`);
    if (parseInt((zeroStock.rows[0] as any)?.cnt ?? "0", 10) > 0) {
      await maybeAlert("high", "low_stock",
        `${zeroStock.rows[0] ? (zeroStock.rows[0] as any).cnt : 0} ingredientes agotados`,
        "Hay ingredientes con stock en cero o negativo. Revisar stock.",
        "stock");
    }

    // 4. Incomplete fichajes (clockIn > 12h without clockOut)
    const incomplete = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM time_records
      WHERE clock_in >= NOW() - INTERVAL '24 hours'
        AND clock_out IS NULL AND clock_in < NOW() - INTERVAL '12 hours'
    `);
    if (parseInt((incomplete.rows[0] as any)?.cnt ?? "0", 10) > 0) {
      await maybeAlert("medium", "incomplete_fichaje",
        `${(incomplete.rows[0] as any)?.cnt} fichajes incompletos`,
        "Hay fichajes de entrada sin salida desde hace más de 12 horas.",
        "hr");
    }

    res.json({ ok: true, generated, count: generated.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al generar alertas" }); }
});

// ─── CUSTOM REPORTS ───────────────────────────────────────────────────────────

router.get("/director/custom-reports", ...guard, async (req, res) => {
  try {
    const rows = await db.select().from(directorCustomReportsTable)
      .where(or(
        eq(directorCustomReportsTable.isShared, true),
        eq(directorCustomReportsTable.createdBy, req.user!.id),
      ))
      .orderBy(desc(directorCustomReportsTable.updatedAt));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al obtener informes" }); }
});

router.post("/director/custom-reports", ...guard, async (req, res) => {
  try {
    const [row] = await db.insert(directorCustomReportsTable)
      .values({ ...req.body as object, createdBy: req.user!.id } as any)
      .returning();
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al crear informe" }); }
});

router.delete("/director/custom-reports/:id", ...guard, async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(directorCustomReportsTable)
      .where(and(eq(directorCustomReportsTable.id, id), eq(directorCustomReportsTable.createdBy, req.user!.id)));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al eliminar informe" }); }
});

// ─── DEMO DATA ────────────────────────────────────────────────────────────────

router.post("/director/demo-data", ...adminGuard, async (req, res) => {
  try {
    const emp = req.user!.id;
    const today = new Date().toISOString().slice(0, 10);

    // Demo goal
    await db.insert(directorGoalsTable).values({
      type: "sales_monthly", label: "Venta mensual demo", targetValue: "25000",
      period: "monthly", createdBy: emp, active: true,
    } as any);

    // Demo costs
    await db.insert(directorCostsTable).values([
      { category: "rent", name: "Alquiler local (demo)", amount: "2500", periodicity: "monthly", effectiveDate: today, paidStatus: "paid", createdBy: emp, isDemo: true },
      { category: "electricity", name: "Electricidad (demo)", amount: "450", periodicity: "monthly", effectiveDate: today, paidStatus: "pending", createdBy: emp, isDemo: true },
      { category: "software", name: "Software TPV (demo)", amount: "89", periodicity: "monthly", effectiveDate: today, paidStatus: "paid", createdBy: emp, isDemo: true },
    ] as any[]);

    // Demo alerts
    await db.insert(directorAlertsTable).values([
      { priority: "critical", source: "cash_diff",  title: "Diferencia de caja: -47.50 € (DEMO)", detail: "Sesión de caja con diferencia significativa.", status: "open", originModule: "caja", isDemo: true },
      { priority: "high",     source: "low_stock",  title: "3 ingredientes agotados (DEMO)", detail: "Tomate, mozzarella y aceite por debajo de stock mínimo.", status: "open", originModule: "stock", isDemo: true },
      { priority: "medium",   source: "incomplete_fichaje", title: "2 fichajes incompletos (DEMO)", detail: "Dos empleados con fichaje de entrada sin salida.", status: "open", originModule: "hr", isDemo: true },
      { priority: "low",      source: "low_sales",  title: "Ventas por debajo del objetivo (DEMO)", detail: "Las ventas del turno de comida están un 18% por debajo de la media.", status: "reviewed", originModule: "ventas", isDemo: true },
    ] as any[]);

    res.json({ ok: true, message: "Datos de demostración creados" });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al crear demo data" }); }
});

router.delete("/director/demo-data", ...adminGuard, async (req, res) => {
  try {
    await db.delete(directorAlertsTable).where(eq(directorAlertsTable.isDemo, true));
    await db.delete(directorCostsTable).where(eq(directorCostsTable.isDemo, true));
    // Goals don't have isDemo; delete by label pattern
    await db.execute(sql`DELETE FROM director_goals WHERE label LIKE '%(demo)%'`);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Error al eliminar demo data" }); }
});

export default router;

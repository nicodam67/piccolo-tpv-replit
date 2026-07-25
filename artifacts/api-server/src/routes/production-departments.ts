import { Router, type IRouter } from "express";
import {
  db,
  printersTable,
  productionDepartmentsTable,
  productsTable,
  kitchenTasksTable,
} from "@workspace/db";
import { eq, inArray, sql, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  DEPARTMENT_OUTPUT_MODES,
  DEPARTMENT_WORKFLOW_PROFILES,
} from "@workspace/db";

const router: IRouter = Router();
const adminGuard = [requireAuth, requireRole("manager", "admin")] as const;
const codePattern = /^[a-z][a-z0-9_]*$/;

async function validatePrinterIds(ids: string[]) {
  if (!ids.length) return true;
  const printers = await db.select({ id: printersTable.id })
    .from(printersTable)
    .where(inArray(printersTable.id, ids));
  return printers.length === new Set(ids).size;
}

router.get("/production-departments", requireAuth, async (req, res): Promise<void> => {
  const assignable = req.query.assignable === "true";
  const rows = await db.select().from(productionDepartmentsTable)
    .where(eq(productionDepartmentsTable.active, true))
    .orderBy(productionDepartmentsTable.sortOrder);
  res.json(assignable ? rows.filter((row) => row.assignableToProducts) : rows);
});

router.get("/admin/production-departments", ...adminGuard, async (_req, res): Promise<void> => {
  const rows = await db.select().from(productionDepartmentsTable)
    .orderBy(productionDepartmentsTable.sortOrder);
  res.json(rows);
});

router.post("/admin/production-departments", ...adminGuard, async (req, res): Promise<void> => {
  const {
    code,
    name,
    outputMode = "none",
    workflowProfile = "standard",
    printerIds = [],
    sortOrder = 0,
    active = true,
    showInKdsNav = true,
    assignableToProducts = true,
    isPaseAggregator = false,
  } = req.body as Record<string, unknown>;
  if (typeof code !== "string" || !codePattern.test(code)) {
    res.status(400).json({ error: "Código inválido: usa minúsculas, números y guion bajo" });
    return;
  }
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Nombre obligatorio" });
    return;
  }
  if (!DEPARTMENT_OUTPUT_MODES.includes(outputMode as any)
    || !DEPARTMENT_WORKFLOW_PROFILES.includes(workflowProfile as any)) {
    res.status(400).json({ error: "Modo de salida o perfil inválido" });
    return;
  }
  if (!Array.isArray(printerIds) || !(await validatePrinterIds(printerIds as string[]))) {
    res.status(400).json({ error: "Impresoras no válidas" });
    return;
  }
  try {
    const [created] = await db.insert(productionDepartmentsTable).values({
      code,
      name: name.trim(),
      outputMode: outputMode as any,
      workflowProfile: workflowProfile as any,
      printerIds: printerIds as string[],
      sortOrder: Number(sortOrder) || 0,
      active: Boolean(active),
      showInKdsNav: Boolean(showInKdsNav),
      assignableToProducts: Boolean(assignableToProducts),
      isPaseAggregator: Boolean(isPaseAggregator),
    }).returning();
    res.status(201).json(created);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ya existe un departamento con ese código" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/production-departments/:id", ...adminGuard, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  if (req.body?.code !== undefined) {
    res.status(400).json({ error: "El código del departamento es inmutable" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const allowed = [
    "name",
    "sortOrder",
    "active",
    "outputMode",
    "workflowProfile",
    "printerIds",
    "showInKdsNav",
    "assignableToProducts",
    "isPaseAggregator",
  ] as const;
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.outputMode !== undefined
    && !DEPARTMENT_OUTPUT_MODES.includes(updates.outputMode as any)) {
    res.status(400).json({ error: "Modo de salida inválido" });
    return;
  }
  if (updates.workflowProfile !== undefined
    && !DEPARTMENT_WORKFLOW_PROFILES.includes(updates.workflowProfile as any)) {
    res.status(400).json({ error: "Perfil de flujo inválido" });
    return;
  }
  if (updates.printerIds !== undefined
    && (!Array.isArray(updates.printerIds)
      || !(await validatePrinterIds(updates.printerIds as string[])))) {
    res.status(400).json({ error: "Impresoras no válidas" });
    return;
  }
  if (updates.workflowProfile !== undefined) {
    const [existing] = await db.select().from(productionDepartmentsTable)
      .where(eq(productionDepartmentsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Departamento no encontrado" });
      return;
    }
    if (updates.workflowProfile !== existing.workflowProfile) {
      const [taskUsage] = await db.select({ count: sql<number>`count(*)::int` })
        .from(kitchenTasksTable)
        .where(and(
          eq(kitchenTasksTable.prepZone, existing.code),
          inArray(kitchenTasksTable.status, ["new", "preparing", "in_oven", "ready"]),
        ));
      if ((taskUsage?.count ?? 0) > 0) {
        res.status(409).json({ error: "No se puede cambiar el flujo con tareas activas" });
        return;
      }
    }
  }
  if (updates.active === false) {
    const [existing] = await db.select().from(productionDepartmentsTable)
      .where(eq(productionDepartmentsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Departamento no encontrado" });
      return;
    }
    const [[productUsage], [taskUsage]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(productsTable)
        .where(eq(productsTable.prepZone, existing.code)),
      db.select({ count: sql<number>`count(*)::int` }).from(kitchenTasksTable)
        .where(and(
          eq(kitchenTasksTable.prepZone, existing.code),
          inArray(kitchenTasksTable.status, ["new", "preparing", "in_oven", "ready"]),
        )),
    ]);
    if ((productUsage?.count ?? 0) > 0 || (taskUsage?.count ?? 0) > 0) {
      res.status(409).json({ error: "El departamento tiene productos o tareas activas" });
      return;
    }
  }
  const [updated] = await db.update(productionDepartmentsTable)
    .set(updates)
    .where(eq(productionDepartmentsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Departamento no encontrado" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/production-departments/:id", ...adminGuard, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [department] = await db.select().from(productionDepartmentsTable)
    .where(eq(productionDepartmentsTable.id, id));
  if (!department) {
    res.status(404).json({ error: "Departamento no encontrado" });
    return;
  }
  const [[usage], [taskUsage]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .where(eq(productsTable.prepZone, department.code)),
    db.select({ count: sql<number>`count(*)::int` })
      .from(kitchenTasksTable)
      .where(and(
        eq(kitchenTasksTable.prepZone, department.code),
        inArray(kitchenTasksTable.status, ["new", "preparing", "in_oven", "ready"]),
      )),
  ]);
  if ((usage?.count ?? 0) > 0 || (taskUsage?.count ?? 0) > 0) {
    res.status(409).json({ error: "El departamento tiene productos o tareas activas" });
    return;
  }
  const [updated] = await db.update(productionDepartmentsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(productionDepartmentsTable.id, id))
    .returning();
  res.json(updated);
});

export default router;

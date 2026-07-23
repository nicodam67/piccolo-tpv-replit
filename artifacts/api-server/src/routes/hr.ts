/**
 * HR Module — Employees (extended), Positions, Departments, Work Centers,
 * Employee Requests, Pay Periods, Cost Reports, Demo Data
 *
 * Routes: /hr/*
 * Auth: all routes require JWT; economic data requires admin|manager
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  employeePinsTable,
  hrPositionsTable,
  hrDepartmentsTable,
  hrWorkCentersTable,
  hrEmployeePositionsTable,
  hrEmployeeExternalIdsTable,
  hrEmployeeRequestsTable,
  hrPayPeriodsTable,
  hrImportHistoryTable,
  timeRecordsTable,
  shiftsTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, isNull, not } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import bcrypt from "bcryptjs";

const router = Router();

// ─── Utility ─────────────────────────────────────────────────────────────────

function isManagerOrAdmin(role: string) {
  return ["admin", "manager", "encargado"].includes(role);
}

/** Strip economic fields for non-admin/manager users */
function stripEconomic<T extends Record<string, unknown>>(emp: T, role: string): T {
  if (isManagerOrAdmin(role)) return emp;
  const { hourlyRate, monthlySalary, employerCostRate, ...rest } = emp as Record<string, unknown>;
  return rest as T;
}

const VALID_EMPLOYEE_ROLES = new Set([
  "admin", "manager", "encargado", "employee", "waiter", "cashier", "kitchen", "delivery",
]);
const MANAGER_ASSIGNABLE_ROLES = new Set([
  "encargado", "employee", "waiter", "cashier", "kitchen", "delivery",
]);

const MUTABLE_EMPLOYEE_FIELDS = new Set([
  "name", "role", "active", "lastName", "employeeNumber", "email", "phone", "dni",
  "address", "hireDate", "terminationDate", "empStatus", "positionId", "departmentId",
  "workCenterId", "contractType", "weeklyHours", "hourlyRate", "monthlySalary",
  "employerCostRate", "externalCode", "photoUrl", "emergencyContact", "empNotes",
  "anvizId", "nfcId", "legacyFichajeId",
]);

async function auditEmployeeSecurity(
  req: { user?: { id?: string; name?: string; role?: string } },
  action: string,
  details: string,
) {
  await db.insert(auditLogTable).values({
    employeeId: req.user?.id ?? null,
    employeeName: req.user?.name ?? "",
    action,
    details,
  }).catch(() => {});
}

async function activeAdminCount(
  executor: Pick<typeof db, "select">,
): Promise<number> {
  const [row] = await executor.select({ count: sql<number>`count(*)::int` })
    .from(employeesTable)
    .where(and(eq(employeesTable.role, "admin"), eq(employeesTable.active, true)));
  return Number(row?.count ?? 0);
}

// ─── POSITIONS ────────────────────────────────────────────────────────────────

router.get("/hr/positions", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(hrPositionsTable)
      .leftJoin(hrDepartmentsTable, eq(hrPositionsTable.departmentId, hrDepartmentsTable.id))
      .orderBy(hrPositionsTable.name);
    const result = rows.map((r) => ({
      ...r.hr_positions,
      department: r.hr_departments,
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener puestos" });
  }
});

router.post("/hr/positions", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, code = "", departmentId = null, active = true } = req.body as {
      name: string;
      code?: string;
      departmentId?: string | null;
      active?: boolean;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre del puesto es obligatorio" });
      return;
    }
    const [row] = await db
      .insert(hrPositionsTable)
      .values({ name: name.trim(), code, departmentId, active })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear puesto" });
  }
});

router.patch("/hr/positions/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { name, code, departmentId, active } = req.body as {
      name?: string;
      code?: string;
      departmentId?: string | null;
      active?: boolean;
    };
    const updates: Partial<typeof hrPositionsTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code;
    if (departmentId !== undefined) updates.departmentId = departmentId;
    if (active !== undefined) updates.active = active;
    const [updated] = await db
      .update(hrPositionsTable)
      .set(updates)
      .where(eq(hrPositionsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Puesto no encontrado" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar puesto" });
  }
});

router.delete("/hr/positions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(hrPositionsTable).where(eq(hrPositionsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar puesto" });
  }
});

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────

router.get("/hr/departments", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(hrDepartmentsTable).orderBy(hrDepartmentsTable.name);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener departamentos" });
  }
});

router.post("/hr/departments", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, code = "", active = true } = req.body as { name: string; code?: string; active?: boolean };
    if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    const [row] = await db.insert(hrDepartmentsTable).values({ name: name.trim(), code, active }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear departamento" });
  }
});

router.patch("/hr/departments/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { name, code, active } = req.body as { name?: string; code?: string; active?: boolean };
    const updates: Partial<typeof hrDepartmentsTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code;
    if (active !== undefined) updates.active = active;
    const [updated] = await db.update(hrDepartmentsTable).set(updates).where(eq(hrDepartmentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Departamento no encontrado" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar departamento" });
  }
});

router.delete("/hr/departments/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(hrDepartmentsTable).where(eq(hrDepartmentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar departamento" });
  }
});

// ─── WORK CENTERS ────────────────────────────────────────────────────────────

router.get("/hr/work-centers", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(hrWorkCentersTable).orderBy(hrWorkCentersTable.name);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener centros de trabajo" });
  }
});

router.post("/hr/work-centers", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, address = "", active = true } = req.body as { name: string; address?: string; active?: boolean };
    if (!name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    const [row] = await db.insert(hrWorkCentersTable).values({ name: name.trim(), address, active }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear centro de trabajo" });
  }
});

router.patch("/hr/work-centers/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { name, address, active } = req.body as { name?: string; address?: string; active?: boolean };
    const updates: Partial<typeof hrWorkCentersTable.$inferInsert> = {};
    if (name !== undefined) updates.name = name.trim();
    if (address !== undefined) updates.address = address;
    if (active !== undefined) updates.active = active;
    const [updated] = await db.update(hrWorkCentersTable).set(updates).where(eq(hrWorkCentersTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Centro no encontrado" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar centro" });
  }
});

// ─── EMPLOYEES (extended) ─────────────────────────────────────────────────────

router.get("/hr/employees", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  try {
    const { search, status, positionId, departmentId, active } = req.query as Record<string, string>;
    let query = db.select().from(employeesTable).$dynamic();

    const conditions = [];
    if (status) conditions.push(eq(employeesTable.empStatus, status));
    if (positionId) conditions.push(eq(employeesTable.positionId, positionId));
    if (departmentId) conditions.push(eq(employeesTable.departmentId, departmentId));
    if (active !== undefined) conditions.push(eq(employeesTable.active, active === "true"));
    if (conditions.length) query = query.where(and(...conditions));

    let rows = await query.orderBy(employeesTable.name);

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          (r.lastName ?? "").toLowerCase().includes(s) ||
          (r.dni ?? "").toLowerCase().includes(s) ||
          (r.email ?? "").toLowerCase().includes(s) ||
          (r.employeeNumber ?? "").toLowerCase().includes(s),
      );
    }

    const role = req.user!.role;
    const result = rows.map((r) => stripEconomic(r as Record<string, unknown>, role));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener empleados" });
  }
});

router.get("/hr/employees/:id", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    if (!emp) { res.status(404).json({ error: "Empleado no encontrado" }); return; }

    // Load positions, external IDs in parallel
    const [positions, externalIds] = await Promise.all([
      db
        .select()
        .from(hrEmployeePositionsTable)
        .leftJoin(hrPositionsTable, eq(hrEmployeePositionsTable.positionId, hrPositionsTable.id))
        .where(eq(hrEmployeePositionsTable.employeeId, id)),
      db.select().from(hrEmployeeExternalIdsTable).where(eq(hrEmployeeExternalIdsTable.employeeId, id)),
    ]);

    const role = req.user!.role;
    res.json({
      ...stripEconomic(emp as Record<string, unknown>, role),
      positions: positions.map((p) => ({ ...p.hr_employee_positions, position: p.hr_positions })),
      externalIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener empleado" });
  }
});

router.post("/hr/employees", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const { pin, ...empData } = body as { pin?: string } & Partial<typeof employeesTable.$inferInsert>;

    if (!empData.name?.trim()) { res.status(400).json({ error: "El nombre es obligatorio" }); return; }
    if (typeof body.role !== "string") { res.status(400).json({ error: "El rol es obligatorio" }); return; }
    if (!VALID_EMPLOYEE_ROLES.has(body.role)) {
      res.status(400).json({ error: "Rol no válido" });
      return;
    }
    if (req.user!.role !== "admin" && !MANAGER_ASSIGNABLE_ROLES.has(body.role)) {
      await auditEmployeeSecurity(req, "employee_privilege_denied", `Manager intentó crear rol ${body.role}`);
      res.status(403).json({ error: "Un manager solo puede crear roles subordinados" });
      return;
    }

    const [emp] = await db
      .insert(employeesTable)
      .values({
        name: empData.name!.trim(),
        role: empData.role!,
        active: empData.active ?? true,
        lastName: empData.lastName ?? null,
        employeeNumber: empData.employeeNumber ?? null,
        email: empData.email ?? null,
        phone: empData.phone ?? null,
        dni: empData.dni ?? null,
        address: empData.address ?? null,
        hireDate: empData.hireDate ?? null,
        terminationDate: empData.terminationDate ?? null,
        empStatus: empData.empStatus ?? "active",
        positionId: empData.positionId ?? null,
        departmentId: empData.departmentId ?? null,
        workCenterId: empData.workCenterId ?? null,
        contractType: empData.contractType ?? null,
        weeklyHours: empData.weeklyHours ?? null,
        hourlyRate: empData.hourlyRate ?? null,
        monthlySalary: empData.monthlySalary ?? null,
        employerCostRate: empData.employerCostRate ?? "1.35",
        externalCode: empData.externalCode ?? null,
        photoUrl: empData.photoUrl ?? null,
        emergencyContact: empData.emergencyContact ?? null,
        empNotes: empData.empNotes ?? null,
        anvizId: empData.anvizId ?? null,
        nfcId: empData.nfcId ?? null,
        legacyFichajeId: empData.legacyFichajeId ?? null,
      })
      .returning();

    if (pin) {
      const hash = await bcrypt.hash(pin, 10);
      await db
        .insert(employeePinsTable)
        .values({ employeeId: emp.id, pinHash: hash })
        .onConflictDoUpdate({ target: employeePinsTable.employeeId, set: { pinHash: hash } });
    }

    await auditEmployeeSecurity(req, "employee_created", `Empleado ${emp.id} creado con rol ${emp.role}`);
    res.status(201).json(emp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear empleado" });
  }
});

router.patch("/hr/employees/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const body = req.body as Record<string, unknown>;
    const pin = typeof body.pin === "string" ? body.pin : undefined;
    if ("pin" in body && typeof body.pin !== "string") {
      res.status(400).json({ error: "PIN no válido" });
      return;
    }
    if ("active" in body && typeof body.active !== "boolean") {
      res.status(400).json({ error: "active debe ser booleano" });
      return;
    }
    if ("role" in body && typeof body.role !== "string") {
      res.status(400).json({ error: "Rol no válido" });
      return;
    }
    if ("empStatus" in body && typeof body.empStatus !== "string") {
      res.status(400).json({ error: "Estado no válido" });
      return;
    }
    const updates = Object.fromEntries(
      Object.entries(body).filter(([key]) => MUTABLE_EMPLOYEE_FIELDS.has(key)),
    ) as Partial<typeof employeesTable.$inferInsert>;
    if (updates.role !== undefined && !VALID_EMPLOYEE_ROLES.has(updates.role)) {
      res.status(400).json({ error: "Rol no válido" });
      return;
    }
    if (Object.keys(updates).length === 0 && pin === undefined) {
      res.status(400).json({ error: "Sin cambios válidos" });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('employee-admin-management'))`);
      const [target] = await tx.select().from(employeesTable)
        .where(eq(employeesTable.id, id))
        .for("update");
      if (!target) throw new Error("EMPLOYEE_NOT_FOUND");

      const actorIsAdmin = req.user!.role === "admin";
      const changesOwnRole = id === req.user!.id
        && updates.role !== undefined
        && updates.role !== target.role;
      if (!actorIsAdmin && (
        ["admin", "manager"].includes(target.role)
        || (updates.role !== undefined && !MANAGER_ASSIGNABLE_ROLES.has(updates.role))
        || changesOwnRole
      )) {
        throw new Error("PRIVILEGE_ESCALATION");
      }

      const removesActiveAdmin = target.role === "admin" && target.active && (
        (updates.role !== undefined && updates.role !== "admin")
        || updates.active === false
        || (typeof updates.empStatus === "string" && ["inactive", "suspended"].includes(updates.empStatus))
      );
      if (removesActiveAdmin && await activeAdminCount(tx) <= 1) {
        throw new Error("LAST_ACTIVE_ADMIN");
      }

      const [employee] = await tx.update(employeesTable)
        .set(updates)
        .where(eq(employeesTable.id, id))
        .returning();
      if (pin !== undefined) {
        const hash = await bcrypt.hash(pin, 10);
        await tx.insert(employeePinsTable)
          .values({ employeeId: id, pinHash: hash })
          .onConflictDoUpdate({ target: employeePinsTable.employeeId, set: { pinHash: hash } });
      }
      return employee;
    });
    await auditEmployeeSecurity(req, "employee_updated", `Empleado ${id} actualizado`);
    res.json(updated);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "";
    if (reason === "EMPLOYEE_NOT_FOUND") {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }
    if (reason === "PRIVILEGE_ESCALATION") {
      await auditEmployeeSecurity(req, "employee_privilege_denied", `Intento de escalada sobre empleado ${id}`);
      res.status(403).json({ error: "Un manager no puede gestionar administradores ni cambiar su propio rol" });
      return;
    }
    if (reason === "LAST_ACTIVE_ADMIN") {
      await auditEmployeeSecurity(req, "employee_privilege_denied", `Intento de eliminar el último administrador ${id}`);
      res.status(409).json({ error: "No se puede desactivar ni degradar el último administrador activo" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar empleado" });
  }
});

router.delete("/hr/employees/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    if (req.user!.role !== "admin") throw new Error("PRIVILEGE_ESCALATION");
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('employee-admin-management'))`);
      const [target] = await tx.select().from(employeesTable)
        .where(eq(employeesTable.id, id))
        .for("update");
      if (!target) return null;
      if (target.role === "admin" && target.active && await activeAdminCount(tx) <= 1) {
        throw new Error("LAST_ACTIVE_ADMIN");
      }
      const [employee] = await tx.update(employeesTable)
        .set({ active: false, empStatus: "inactive" })
        .where(eq(employeesTable.id, id))
        .returning();
      return employee;
    });
    if (!updated) { res.status(404).json({ error: "Empleado no encontrado" }); return; }
    await auditEmployeeSecurity(req, "employee_deleted", `Empleado ${id} desactivado`);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "PRIVILEGE_ESCALATION") {
      await auditEmployeeSecurity(req, "employee_privilege_denied", `Manager intentó eliminar empleado ${id}`);
      res.status(403).json({ error: "Solo un administrador puede eliminar empleados" });
      return;
    }
    if (err instanceof Error && err.message === "LAST_ACTIVE_ADMIN") {
      await auditEmployeeSecurity(req, "employee_privilege_denied", `Intento de eliminar el último administrador ${id}`);
      res.status(409).json({ error: "No se puede eliminar el último administrador activo" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al eliminar empleado" });
  }
});

// ─── EMPLOYEE POSITIONS (multi-puesto) ───────────────────────────────────────

router.post("/hr/employees/:id/positions", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { positionId, isPrimary = false } = req.body as { positionId: string; isPrimary?: boolean };
    if (!positionId) { res.status(400).json({ error: "positionId requerido" }); return; }
    const [row] = await db
      .insert(hrEmployeePositionsTable)
      .values({ employeeId: id, positionId, isPrimary })
      .onConflictDoUpdate({
        target: [hrEmployeePositionsTable.employeeId, hrEmployeePositionsTable.positionId],
        set: { isPrimary },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al asignar puesto" });
  }
});

router.delete("/hr/employees/:id/positions/:positionId", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  const positionId = req.params.positionId as string;
  try {
    await db
      .delete(hrEmployeePositionsTable)
      .where(and(eq(hrEmployeePositionsTable.employeeId, id), eq(hrEmployeePositionsTable.positionId, positionId)));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar puesto de empleado" });
  }
});

// ─── EMPLOYEE EXTERNAL IDs ────────────────────────────────────────────────────

router.get("/hr/employees/:id/external-ids", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const rows = await db
      .select()
      .from(hrEmployeeExternalIdsTable)
      .where(eq(hrEmployeeExternalIdsTable.employeeId, id));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener identificadores" });
  }
});

router.post("/hr/employees/:id/external-ids", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { source, externalId, deviceId, notes } = req.body as {
      source: string;
      externalId: string;
      deviceId?: string;
      notes?: string;
    };
    if (!source || !externalId) { res.status(400).json({ error: "source y externalId requeridos" }); return; }
    const [row] = await db
      .insert(hrEmployeeExternalIdsTable)
      .values({ employeeId: id, source, externalId, deviceId, notes })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al añadir identificador externo" });
  }
});

router.delete("/hr/employees/:id/external-ids/:extId", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const extId = req.params.extId as string;
  try {
    await db.delete(hrEmployeeExternalIdsTable).where(eq(hrEmployeeExternalIdsTable.id, extId));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar identificador externo" });
  }
});

// ─── EMPLOYEE REQUESTS ────────────────────────────────────────────────────────

router.get("/hr/employee-requests", requireAuth, async (req, res) => {
  try {
    const { status, employeeId, type } = req.query as Record<string, string>;
    const role = req.user!.role;
    const userId = req.user!.id;

    let query = db
      .select()
      .from(hrEmployeeRequestsTable)
      .leftJoin(employeesTable, eq(hrEmployeeRequestsTable.employeeId, employeesTable.id))
      .$dynamic();

    const conditions = [];
    // Non-managers can only see their own requests
    if (!isManagerOrAdmin(role)) {
      conditions.push(eq(hrEmployeeRequestsTable.employeeId, userId));
    } else if (employeeId) {
      conditions.push(eq(hrEmployeeRequestsTable.employeeId, employeeId));
    }
    if (status) conditions.push(eq(hrEmployeeRequestsTable.status, status));
    if (type) conditions.push(eq(hrEmployeeRequestsTable.requestType, type));
    if (conditions.length) query = query.where(and(...conditions));

    const rows = await query.orderBy(hrEmployeeRequestsTable.createdAt);
    res.json(rows.map((r) => ({ ...r.hr_employee_requests, employee: r.employees })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
});

router.post("/hr/employee-requests", requireAuth, async (req, res) => {
  try {
    const { employeeId, requestType, dateFrom, dateTo, notes } = req.body as {
      employeeId?: string;
      requestType: string;
      dateFrom: string;
      dateTo: string;
      notes?: string;
    };
    // Employees can only create for themselves
    const targetEmployeeId = isManagerOrAdmin(req.user!.role)
      ? (employeeId ?? req.user!.id)
      : req.user!.id;

    if (!requestType || !dateFrom || !dateTo) {
      res.status(400).json({ error: "Faltan campos obligatorios" });
      return;
    }
    const [row] = await db
      .insert(hrEmployeeRequestsTable)
      .values({ employeeId: targetEmployeeId, requestType, dateFrom, dateTo, notes })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear solicitud" });
  }
});

router.patch("/hr/employee-requests/:id", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { status, reviewNotes } = req.body as { status: string; reviewNotes?: string };
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }
    const [updated] = await db
      .update(hrEmployeeRequestsTable)
      .set({
        status,
        reviewNotes,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      })
      .where(eq(hrEmployeeRequestsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar solicitud" });
  }
});

// ─── PAY PERIODS ──────────────────────────────────────────────────────────────

router.get("/hr/pay-periods", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(hrPayPeriodsTable)
      .orderBy(hrPayPeriodsTable.year, hrPayPeriodsTable.month);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener periodos" });
  }
});

router.post("/hr/pay-periods", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { year, month } = req.body as { year: number; month: number };
    if (!year || !month || month < 1 || month > 12) {
      res.status(400).json({ error: "Año y mes válidos requeridos" });
      return;
    }
    const [row] = await db
      .insert(hrPayPeriodsTable)
      .values({ year, month })
      .onConflictDoNothing()
      .returning();
    res.status(201).json(row ?? { error: "El periodo ya existe" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear periodo" });
  }
});

router.post("/hr/pay-periods/:id/close", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const [period] = await db.select().from(hrPayPeriodsTable).where(eq(hrPayPeriodsTable.id, id));
    if (!period) { res.status(404).json({ error: "Periodo no encontrado" }); return; }
    if (period.status === "closed") { res.status(400).json({ error: "El periodo ya está cerrado" }); return; }

    // Calculate actual hours for the period
    const startDate = new Date(period.year, period.month - 1, 1);
    const endDate = new Date(period.year, period.month, 0, 23, 59, 59);

    const records = await db
      .select()
      .from(timeRecordsTable)
      .where(and(gte(timeRecordsTable.clockIn, startDate), lte(timeRecordsTable.clockIn, endDate)));

    let actualHours = 0;
    for (const r of records) {
      if (r.clockOut) {
        const diff = (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
        actualHours += diff;
      }
    }

    // Calculate planned hours from shifts
    const shifts = await db
      .select()
      .from(shiftsTable)
      .where(
        and(
          gte(shiftsTable.shiftDate, startDate.toISOString().split("T")[0]!),
          lte(shiftsTable.shiftDate, endDate.toISOString().split("T")[0]!),
        ),
      );

    let plannedHours = 0;
    for (const s of shifts) {
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      plannedHours += (eh! * 60 + em! - (sh! * 60 + sm!)) / 60;
    }

    // Calculate estimated cost
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.active, true));
    let estimatedCost = 0;
    for (const emp of employees) {
      const rate = parseFloat(emp.hourlyRate ?? "0");
      const costRate = parseFloat(emp.employerCostRate ?? "1.35");
      const empRecords = records.filter((r) => r.employeeId === emp.id);
      let empHours = 0;
      for (const r of empRecords) {
        if (r.clockOut) {
          empHours += (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
        }
      }
      estimatedCost += empHours * rate * costRate;
    }

    const [updated] = await db
      .update(hrPayPeriodsTable)
      .set({
        status: "closed",
        actualHours: actualHours.toFixed(2),
        plannedHours: plannedHours.toFixed(2),
        estimatedCost: estimatedCost.toFixed(2),
        closedBy: req.user!.id,
        closedAt: new Date(),
      })
      .where(eq(hrPayPeriodsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al cerrar periodo" });
  }
});

router.post("/hr/pay-periods/:id/reopen", requireAuth, requireRole("admin"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const [period] = await db.select().from(hrPayPeriodsTable).where(eq(hrPayPeriodsTable.id, id));
    if (!period) { res.status(404).json({ error: "Periodo no encontrado" }); return; }
    if (period.status === "locked") { res.status(400).json({ error: "El periodo está bloqueado" }); return; }
    const [updated] = await db
      .update(hrPayPeriodsTable)
      .set({ status: "open", reopenedBy: req.user!.id, reopenedAt: new Date() })
      .where(eq(hrPayPeriodsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al reabrir periodo" });
  }
});

// ─── REPORTS ──────────────────────────────────────────────────────────────────

router.get("/hr/reports/hours", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  try {
    const { period } = req.query as { period?: string };
    let startDate: Date;
    let endDate: Date;

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split("-").map(Number);
      startDate = new Date(y!, m! - 1, 1);
      endDate = new Date(y!, m!, 0, 23, 59, 59);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const [employees, records, shifts] = await Promise.all([
      db.select().from(employeesTable).where(eq(employeesTable.active, true)),
      db
        .select()
        .from(timeRecordsTable)
        .where(and(gte(timeRecordsTable.clockIn, startDate), lte(timeRecordsTable.clockIn, endDate))),
      db
        .select()
        .from(shiftsTable)
        .where(
          and(
            gte(shiftsTable.shiftDate, startDate.toISOString().split("T")[0]!),
            lte(shiftsTable.shiftDate, endDate.toISOString().split("T")[0]!),
          ),
        ),
    ]);

    const result = employees.map((emp) => {
      const empRecords = records.filter((r) => r.employeeId === emp.id);
      let actualHours = 0;
      for (const r of empRecords) {
        if (r.clockOut) {
          actualHours += (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
        }
      }

      const empShifts = shifts.filter((s) => s.employeeId === emp.id);
      let plannedHours = 0;
      for (const s of empShifts) {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        plannedHours += (eh! * 60 + em! - (sh! * 60 + sm!)) / 60;
      }

      const rate = parseFloat(emp.hourlyRate ?? "0");
      const costRate = parseFloat(emp.employerCostRate ?? "1.35");
      const estimatedCost = actualHours * rate * costRate;
      const deviation = actualHours - plannedHours;

      return {
        employeeId: emp.id,
        name: `${emp.name} ${emp.lastName ?? ""}`.trim(),
        plannedHours: Math.round(plannedHours * 100) / 100,
        actualHours: Math.round(actualHours * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        hourlyRate: rate,
        employerCostRate: costRate,
      };
    });

    res.json({ period: period ?? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`, employees: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar informe de horas" });
  }
});

router.get("/hr/reports/costs", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { period } = req.query as { period?: string };
    let startDate: Date;
    let endDate: Date;

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split("-").map(Number);
      startDate = new Date(y!, m! - 1, 1);
      endDate = new Date(y!, m!, 0, 23, 59, 59);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const [employees, records] = await Promise.all([
      db.select().from(employeesTable).where(eq(employeesTable.active, true)),
      db
        .select()
        .from(timeRecordsTable)
        .where(and(gte(timeRecordsTable.clockIn, startDate), lte(timeRecordsTable.clockIn, endDate))),
    ]);

    let totalCost = 0;
    let totalHours = 0;
    const byEmployee = employees.map((emp) => {
      const empRecords = records.filter((r) => r.employeeId === emp.id);
      let hours = 0;
      for (const r of empRecords) {
        if (r.clockOut) hours += (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
      }
      const rate = parseFloat(emp.hourlyRate ?? "0");
      const costRate = parseFloat(emp.employerCostRate ?? "1.35");
      const cost = hours * rate * costRate;
      totalCost += cost;
      totalHours += hours;
      return {
        employeeId: emp.id,
        name: `${emp.name} ${emp.lastName ?? ""}`.trim(),
        hours: Math.round(hours * 100) / 100,
        hourlyRate: rate,
        employerCostRate: costRate,
        estimatedCost: Math.round(cost * 100) / 100,
      };
    });

    res.json({
      period: period ?? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
      totalCost: Math.round(totalCost * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      avgCostPerHour: totalHours > 0 ? Math.round((totalCost / totalHours) * 100) / 100 : 0,
      byEmployee,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar informe de costes" });
  }
});

router.get("/hr/reports/vs-sales", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const now = new Date();
    const startDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [employees, records] = await Promise.all([
      db.select().from(employeesTable).where(eq(employeesTable.active, true)),
      db
        .select()
        .from(timeRecordsTable)
        .where(and(gte(timeRecordsTable.clockIn, startDate), lte(timeRecordsTable.clockIn, endDate))),
    ]);

    let totalCost = 0;
    let totalHours = 0;
    for (const emp of employees) {
      const empRecords = records.filter((r) => r.employeeId === emp.id);
      let hours = 0;
      for (const r of empRecords) {
        if (r.clockOut) hours += (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
      }
      const rate = parseFloat(emp.hourlyRate ?? "0");
      const costRate = parseFloat(emp.employerCostRate ?? "1.35");
      totalCost += hours * rate * costRate;
      totalHours += hours;
    }

    // Query total sales from payments table
    const salesResult = await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) as total_sales
          FROM payments
          WHERE created_at >= ${startDate.toISOString()}
            AND created_at <= ${endDate.toISOString()}
            AND status = 'completed'`,
    );
    const totalSales = parseFloat((salesResult.rows[0] as { total_sales: string })?.total_sales ?? "0");

    res.json({
      from: startDate.toISOString().split("T")[0],
      to: endDate.toISOString().split("T")[0],
      totalSales: Math.round(totalSales * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      costPctOfSales: totalSales > 0 ? Math.round((totalCost / totalSales) * 10000) / 100 : null,
      costPerHour: totalHours > 0 ? Math.round((totalCost / totalHours) * 100) / 100 : 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar informe comparativo" });
  }
});

// ─── DEMO DATA ────────────────────────────────────────────────────────────────

router.post("/hr/demo-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // Create departments
    const [salaDept, cocinaDept] = await db
      .insert(hrDepartmentsTable)
      .values([
        { name: "Sala", code: "SALA", active: true },
        { name: "Cocina", code: "COC", active: true },
      ])
      .returning();

    // Create positions
    const [camareroPos, barmanPos, cocineroPos, ayudantePos] = await db
      .insert(hrPositionsTable)
      .values([
        { name: "Camarero/a", code: "CAM", departmentId: salaDept!.id, active: true },
        { name: "Barman", code: "BAR", departmentId: salaDept!.id, active: true },
        { name: "Cocinero/a", code: "COC", departmentId: cocinaDept!.id, active: true },
        { name: "Ayudante cocina", code: "AYU", departmentId: cocinaDept!.id, active: true },
      ])
      .returning();

    // Create work center
    const [wc] = await db
      .insert(hrWorkCentersTable)
      .values([{ name: "Restaurante Principal", address: "La Ràpita", active: true }])
      .returning();

    // Create demo employees (3 temporada baja)
    const demoEmployees = await db
      .insert(employeesTable)
      .values([
        {
          name: "Ana", lastName: "García López", role: "employee", active: true,
          employeeNumber: "D001", email: "ana@demo.local", phone: "600111001",
          dni: "11111111A", contractType: "full_time", weeklyHours: "40",
          hourlyRate: "9.50", employerCostRate: "1.35",
          positionId: camareroPos!.id, departmentId: salaDept!.id, workCenterId: wc!.id,
          hireDate: "2022-03-15", empStatus: "active", isDemo: true,
        },
        {
          name: "Carlos", lastName: "Martínez Ruiz", role: "employee", active: true,
          employeeNumber: "D002", email: "carlos@demo.local", phone: "600111002",
          dni: "22222222B", contractType: "full_time", weeklyHours: "40",
          hourlyRate: "10.00", employerCostRate: "1.35",
          positionId: cocineroPos!.id, departmentId: cocinaDept!.id, workCenterId: wc!.id,
          hireDate: "2021-06-01", empStatus: "active", isDemo: true,
        },
        {
          name: "Laura", lastName: "Fernández Sanz", role: "employee", active: true,
          employeeNumber: "D003", email: "laura@demo.local", phone: "600111003",
          dni: "33333333C", contractType: "part_time", weeklyHours: "20",
          hourlyRate: "9.50", employerCostRate: "1.35",
          positionId: barmanPos!.id, departmentId: salaDept!.id, workCenterId: wc!.id,
          hireDate: "2023-04-01", empStatus: "active", isDemo: true,
        },
        // 4-12 temporada alta
        ...[
          ["Pedro", "Sánchez Moreno", "D004", cocineroPos!.id, cocinaDept!.id, "10.00", "40"],
          ["María", "López Torres", "D005", camareroPos!.id, salaDept!.id, "9.50", "40"],
          ["José", "González Díaz", "D006", ayudantePos!.id, cocinaDept!.id, "9.00", "35"],
          ["Isabel", "Ramírez Castro", "D007", camareroPos!.id, salaDept!.id, "9.50", "40"],
          ["Miguel", "Flores Herrera", "D008", barmanPos!.id, salaDept!.id, "9.75", "40"],
          ["Carmen", "Torres Jiménez", "D009", camareroPos!.id, salaDept!.id, "9.50", "35"],
          ["Alejandro", "Muñoz Álvarez", "D010", ayudantePos!.id, cocinaDept!.id, "9.00", "40"],
          ["Sofía", "Moreno García", "D011", camareroPos!.id, salaDept!.id, "9.50", "40"],
          ["David", "Jiménez López", "D012", cocineroPos!.id, cocinaDept!.id, "10.50", "40"],
          ["Elena", "Álvarez Sánchez", "D013", barmanPos!.id, salaDept!.id, "9.75", "35"],
          ["Pablo", "Castro Fernández", "D014", camareroPos!.id, salaDept!.id, "9.50", "40"],
          ["Lucía", "Herrera Ruiz", "D015", ayudantePos!.id, cocinaDept!.id, "9.00", "30"],
        ].map(([name, lastName, num, posId, deptId, rate, hours]) => ({
          name: name as string, lastName: lastName as string, role: "employee", active: true,
          employeeNumber: num as string, email: `${(num as string).toLowerCase()}@demo.local`,
          contractType: "full_time", weeklyHours: hours as string,
          hourlyRate: rate as string, employerCostRate: "1.35",
          positionId: posId as string, departmentId: deptId as string, workCenterId: wc!.id,
          hireDate: "2024-06-01", empStatus: "active", isDemo: true,
        })),
      ])
      .returning();

    // Demo employee request (pending vacation)
    await db.insert(hrEmployeeRequestsTable).values([
      {
        employeeId: demoEmployees[0]!.id,
        requestType: "vacation",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-15",
        status: "pending",
        notes: "Vacaciones de verano solicitadas con anticipación",
        isDemo: true,
      },
      {
        employeeId: demoEmployees[1]!.id,
        requestType: "vacation",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-07",
        status: "approved",
        notes: "Vacaciones aprobadas",
        isDemo: true,
      },
    ]);

    // Demo pay period (closed)
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    await db.insert(hrPayPeriodsTable).values({
      year: prevYear,
      month: prevMonth,
      status: "closed",
      plannedHours: "320.00",
      actualHours: "318.50",
      estimatedCost: "3850.00",
      totalSales: "28400.00",
      isDemo: true,
      closedAt: new Date(),
    }).onConflictDoNothing();

    res.json({ ok: true, employeesCreated: demoEmployees.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear datos de demo" });
  }
});

router.delete("/hr/demo-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // Delete in dependency order
    await db.delete(hrEmployeeRequestsTable).where(eq(hrEmployeeRequestsTable.isDemo, true));
    await db.delete(hrPayPeriodsTable).where(eq(hrPayPeriodsTable.isDemo, true));

    // Get demo employee IDs first
    const demoEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.isDemo, true));
    const demoIds = demoEmps.map((e) => e.id);

    if (demoIds.length > 0) {
      await db.delete(hrEmployeePositionsTable).where(inArray(hrEmployeePositionsTable.employeeId, demoIds));
      await db.delete(hrEmployeeExternalIdsTable).where(inArray(hrEmployeeExternalIdsTable.employeeId, demoIds));
      await db.delete(employeesTable).where(inArray(employeesTable.id, demoIds));
    }

    // Clean demo dept/positions if no non-demo employees reference them
    const demoImports = await db
      .select({ id: hrImportHistoryTable.id })
      .from(hrImportHistoryTable)
      .where(eq(hrImportHistoryTable.isDemo, true));
    if (demoImports.length > 0) {
      // import rows cascade delete
      await db.delete(hrImportHistoryTable).where(eq(hrImportHistoryTable.isDemo, true));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar datos de demo" });
  }
});

export default router;

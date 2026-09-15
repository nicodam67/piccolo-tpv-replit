import { Router, type IRouter } from "express";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  absencesTable,
  db,
  employeeAvailabilityTable,
  employeePlanningProfilesTable,
  employeesTable,
  fichajeAuditTable,
  hrEmployeePositionsTable,
  hrPositionsTable,
  planningIssuesTable,
  planningSchedulesTable,
  shiftsTable,
  staffingRequirementsTable,
  timeRecordsTable,
} from "@workspace/db";
import { requireAuth, requirePermission } from "../middlewares/auth";
import {
  canPublish,
  comparePlannedWithClock,
  generateSchedule,
  type PlannedAssignment,
  type PlannerEmployee,
  type PlannerIssue,
  type StaffingNeed,
  validateSchedule,
} from "../lib/staff-planner";

const router: IRouter = Router();
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const ScheduleBody = z.object({
  name: z.string().trim().min(1).max(120),
  dateFrom: DateString,
  dateTo: DateString,
  workCenterId: z.string().uuid().nullable().optional(),
}).refine((value) => value.dateTo >= value.dateFrom, { message: "El periodo no es válido" });

const RequirementBody = z.object({
  requirementDate: DateString,
  startTime: TimeString,
  endTime: TimeString,
  positionId: z.string().uuid(),
  requiredCount: z.number().int().min(1).max(100),
});

const AssignmentBody = z.object({
  employeeId: z.string().uuid(),
  requirementId: z.string().uuid().nullable().optional(),
  positionId: z.string().uuid(),
  shiftDate: DateString,
  startTime: TimeString,
  endTime: TimeString,
  notes: z.string().max(500).nullable().optional(),
});

const AvailabilityBody = z.object({
  availabilityType: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED"]),
  availabilityDate: DateString.nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startTime: TimeString.nullable().optional(),
  endTime: TimeString.nullable().optional(),
  reason: z.string().max(300).nullable().optional(),
  validFrom: DateString.nullable().optional(),
  validTo: DateString.nullable().optional(),
}).refine((value) => value.availabilityDate || value.dayOfWeek != null, {
  message: "Indica una fecha o día de la semana",
});

const ProfileBody = z.object({
  maxWeeklyMinutes: z.number().int().positive().nullable().optional(),
  minRestMinutes: z.number().int().min(0).max(2_880).default(720),
  allowsSplitShift: z.boolean().default(false),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
  preferredWindows: z.array(z.record(z.string(), z.unknown())).default([]),
  restrictions: z.record(z.string(), z.unknown()).default({}),
});

async function audit(
  action: string,
  performedBy: string,
  entityType: string,
  entityId: string,
  details?: object,
) {
  await db.insert(fichajeAuditTable).values({
    action,
    performedBy,
    entityType,
    entityId,
    details: details ?? null,
  });
}

async function loadScheduleContext(scheduleId: string) {
  const [schedule] = await db
    .select()
    .from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, scheduleId))
    .limit(1);
  if (!schedule) return null;

  const [requirements, employeeRows, profiles, availability, absences, positionLinks, shiftRows] = await Promise.all([
    db.select({
      id: staffingRequirementsTable.id,
      date: staffingRequirementsTable.requirementDate,
      startTime: staffingRequirementsTable.startTime,
      endTime: staffingRequirementsTable.endTime,
      positionId: staffingRequirementsTable.positionId,
      positionName: hrPositionsTable.name,
      requiredCount: staffingRequirementsTable.requiredCount,
    }).from(staffingRequirementsTable)
      .innerJoin(hrPositionsTable, eq(staffingRequirementsTable.positionId, hrPositionsTable.id))
      .where(eq(staffingRequirementsTable.scheduleId, scheduleId))
      .orderBy(asc(staffingRequirementsTable.requirementDate), asc(staffingRequirementsTable.startTime)),
    db.select({
      id: employeesTable.id,
      name: employeesTable.name,
      primaryPositionId: employeesTable.positionId,
      weeklyHours: employeesTable.weeklyHours,
    }).from(employeesTable).where(eq(employeesTable.active, true)),
    db.select().from(employeePlanningProfilesTable),
    db.select().from(employeeAvailabilityTable)
      .where(or(
        and(
          gte(employeeAvailabilityTable.availabilityDate, schedule.dateFrom),
          lte(employeeAvailabilityTable.availabilityDate, schedule.dateTo),
        ),
        isNull(employeeAvailabilityTable.availabilityDate),
      )),
    db.select().from(absencesTable).where(and(
      eq(absencesTable.status, "approved"),
      gte(absencesTable.absenceDate, schedule.dateFrom),
      lte(absencesTable.absenceDate, schedule.dateTo),
    )),
    db.select().from(hrEmployeePositionsTable),
    db.select({
      id: shiftsTable.id,
      employeeId: shiftsTable.employeeId,
      employeeName: employeesTable.name,
      requirementId: shiftsTable.requirementId,
      positionId: shiftsTable.positionId,
      date: shiftsTable.shiftDate,
      startTime: shiftsTable.startTime,
      endTime: shiftsTable.endTime,
      origin: shiftsTable.origin,
      notes: shiftsTable.notes,
    }).from(shiftsTable)
      .innerJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id))
      .where(eq(shiftsTable.scheduleId, scheduleId))
      .orderBy(asc(shiftsTable.shiftDate), asc(shiftsTable.startTime)),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.employeeId, profile]));
  const employees: PlannerEmployee[] = employeeRows.map((employee) => {
    const profile = profileMap.get(employee.id);
    const linked = positionLinks.filter((link) => link.employeeId === employee.id).map((link) => link.positionId);
    const positionIds = [...new Set([employee.primaryPositionId, ...linked].filter((id): id is string => Boolean(id)))];
    return {
      id: employee.id,
      name: employee.name,
      positionIds,
      contractedWeeklyMinutes: employee.weeklyHours == null ? null : Math.round(Number(employee.weeklyHours) * 60),
      maxWeeklyMinutes: profile?.maxWeeklyMinutes ?? null,
      minRestMinutes: profile?.minRestMinutes ?? 720,
      allowsSplitShift: profile?.allowsSplitShift ?? false,
      workingDays: Array.isArray(profile?.workingDays) ? profile.workingDays as number[] : [0, 1, 2, 3, 4, 5, 6],
      preferredWindows: Array.isArray(profile?.preferredWindows) ? profile.preferredWindows as PlannerEmployee["preferredWindows"] : [],
      availability: availability.filter((rule) => rule.employeeId === employee.id).map((rule) => ({
        type: rule.availabilityType as "AVAILABLE" | "UNAVAILABLE" | "PREFERRED",
        date: rule.availabilityDate,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
      })),
      absenceDates: absences.filter((absence) => absence.employeeId === employee.id).map((absence) => absence.absenceDate),
    };
  });
  const needs = requirements as StaffingNeed[];
  const assignments = shiftRows
    .filter((shift): shift is typeof shift & { positionId: string } => Boolean(shift.positionId))
    .map((shift) => ({ ...shift, origin: shift.origin as PlannedAssignment["origin"] })) as PlannedAssignment[];
  return { schedule, requirements, employeeRows, profiles, availability, absences, positionLinks, shiftRows, employees, needs, assignments };
}

async function replaceIssues(scheduleId: string, issues: PlannerIssue[]) {
  await db.delete(planningIssuesTable).where(eq(planningIssuesTable.scheduleId, scheduleId));
  if (issues.length > 0) {
    await db.insert(planningIssuesTable).values(issues.map((issue) => ({
      scheduleId,
      shiftId: issue.shiftId,
      requirementId: issue.requirementId,
      employeeId: issue.employeeId,
      code: issue.code,
      severity: "error",
      message: issue.message,
      details: issue.details,
    })));
  }
}

async function validateAndPersistIssues(scheduleId: string): Promise<PlannerIssue[] | null> {
  const context = await loadScheduleContext(scheduleId);
  if (!context) return null;
  const issues = validateSchedule(context.employees, context.needs, context.assignments);
  await replaceIssues(scheduleId, issues);
  return issues;
}

router.get("/planner/schedules", requireAuth, requirePermission("planner.view"), async (req, res) => {
  const manager = ["admin", "manager", "encargado"].includes(req.user!.role);
  const schedules = await db.select().from(planningSchedulesTable)
    .where(manager ? undefined : eq(planningSchedulesTable.status, "PUBLISHED"))
    .orderBy(asc(planningSchedulesTable.dateFrom));
  res.json(schedules);
});

router.post("/planner/schedules", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const parsed = ScheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos de periodo inválidos", issues: parsed.error.issues }); return; }
  const [schedule] = await db.insert(planningSchedulesTable).values({
    ...parsed.data,
    status: "DRAFT",
    createdBy: req.user!.id,
  }).returning();
  await audit("planner_schedule_created", req.user!.id, "planning_schedule", schedule.id, parsed.data);
  res.status(201).json(schedule);
});

router.get("/planner/schedules/:id", requireAuth, requirePermission("planner.view"), async (req, res) => {
  const context = await loadScheduleContext(req.params.id as string);
  if (!context) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  const manager = ["admin", "manager", "encargado"].includes(req.user!.role);
  if (!manager && context.schedule.status !== "PUBLISHED") {
    res.status(404).json({ error: "Cuadrante no encontrado" }); return;
  }
  const issues = manager
    ? await db.select().from(planningIssuesTable).where(eq(planningIssuesTable.scheduleId, context.schedule.id))
    : [];
  const positions = await db.select().from(hrPositionsTable).where(eq(hrPositionsTable.active, true)).orderBy(asc(hrPositionsTable.name));
  res.json({ ...context, issues, positions });
});

router.post("/planner/schedules/:id/requirements", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const parsed = RequirementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Necesidad inválida", issues: parsed.error.issues }); return; }
  const [requirement] = await db.insert(staffingRequirementsTable).values({
    scheduleId,
    ...parsed.data,
    createdBy: req.user!.id,
  }).returning();
  await audit("planner_requirement_created", req.user!.id, "staffing_requirement", requirement.id, parsed.data);
  res.status(201).json(requirement);
});

router.put("/planner/requirements/:id", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const parsed = RequirementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Necesidad inválida", issues: parsed.error.issues }); return; }
  const [updated] = await db.update(staffingRequirementsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(staffingRequirementsTable.id, req.params.id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Necesidad no encontrada" }); return; }
  await validateAndPersistIssues(updated.scheduleId);
  await audit("planner_requirement_updated", req.user!.id, "staffing_requirement", updated.id, parsed.data);
  res.json(updated);
});

router.delete("/planner/requirements/:id", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const [deleted] = await db.delete(staffingRequirementsTable)
    .where(eq(staffingRequirementsTable.id, req.params.id as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Necesidad no encontrada" }); return; }
  await validateAndPersistIssues(deleted.scheduleId);
  await audit("planner_requirement_deleted", req.user!.id, "staffing_requirement", deleted.id);
  res.json({ success: true });
});

router.put("/planner/employees/:id/profile", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Perfil inválido", issues: parsed.error.issues }); return; }
  const [profile] = await db.insert(employeePlanningProfilesTable).values({
    employeeId: req.params.id as string,
    ...parsed.data,
    updatedBy: req.user!.id,
  }).onConflictDoUpdate({
    target: employeePlanningProfilesTable.employeeId,
    set: { ...parsed.data, updatedBy: req.user!.id, updatedAt: new Date() },
  }).returning();
  await audit("planner_profile_updated", req.user!.id, "employee", req.params.id as string, parsed.data);
  res.json(profile);
});

router.post("/planner/employees/:id/availability", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const parsed = AvailabilityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Disponibilidad inválida", issues: parsed.error.issues }); return; }
  const [availability] = await db.insert(employeeAvailabilityTable).values({
    employeeId: req.params.id as string,
    ...parsed.data,
    createdBy: req.user!.id,
  }).returning();
  await audit("planner_availability_created", req.user!.id, "employee_availability", availability.id, parsed.data);
  res.status(201).json(availability);
});

router.post("/planner/schedules/:id/generate", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const context = await loadScheduleContext(scheduleId);
  if (!context) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  if (context.schedule.status !== "DRAFT") { res.status(409).json({ error: "Solo se pueden generar borradores" }); return; }

  const manual = context.assignments.filter((assignment) => assignment.origin === "manual");
  const result = generateSchedule(context.employees, context.needs, manual);
  await db.delete(shiftsTable).where(and(eq(shiftsTable.scheduleId, scheduleId), eq(shiftsTable.origin, "generated")));
  const generated = result.assignments.filter((assignment) => assignment.origin === "generated");
  if (generated.length > 0) {
    await db.insert(shiftsTable).values(generated.map((assignment) => ({
      employeeId: assignment.employeeId,
      scheduleId,
      requirementId: assignment.requirementId,
      positionId: assignment.positionId,
      shiftDate: assignment.date,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      origin: "generated",
      createdBy: req.user!.id,
    })));
  }
  await replaceIssues(scheduleId, result.issues);
  await db.update(planningSchedulesTable).set({
    generatedAt: new Date(),
    generatedBy: req.user!.id,
    generationSource: "deterministic-v1",
    updatedAt: new Date(),
  }).where(eq(planningSchedulesTable.id, scheduleId));
  await audit("planner_schedule_generated", req.user!.id, "planning_schedule", scheduleId, {
    assignments: generated.length,
    issues: result.issues.length,
  });
  res.json({ generated: generated.length, issues: result.issues });
});

router.post("/planner/schedules/:id/validate", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const issues = await validateAndPersistIssues(req.params.id as string);
  if (issues == null) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  res.json({ valid: issues.length === 0, issues });
});

router.post("/planner/schedules/:id/assignments", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const parsed = AssignmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Turno inválido", issues: parsed.error.issues }); return; }
  const [shift] = await db.insert(shiftsTable).values({
    ...parsed.data,
    scheduleId,
    origin: "manual",
    createdBy: req.user!.id,
  }).returning();
  const issues = await validateAndPersistIssues(scheduleId) ?? [];
  await audit("planner_assignment_created", req.user!.id, "shift", shift.id, { ...parsed.data, issues: issues.length });
  res.status(201).json({ shift, issues });
});

router.put("/planner/assignments/:id", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const parsed = AssignmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Turno inválido", issues: parsed.error.issues }); return; }
  const [before] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, req.params.id as string)).limit(1);
  if (!before?.scheduleId) { res.status(404).json({ error: "Asignación no encontrada" }); return; }
  const [shift] = await db.update(shiftsTable).set({
    ...parsed.data,
    origin: "manual",
    updatedAt: new Date(),
  }).where(eq(shiftsTable.id, before.id)).returning();
  const issues = await validateAndPersistIssues(before.scheduleId) ?? [];
  await audit("planner_assignment_updated", req.user!.id, "shift", shift.id, { before, after: shift, issues: issues.length });
  res.json({ shift, issues });
});

router.delete("/planner/assignments/:id", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const [deleted] = await db.delete(shiftsTable).where(eq(shiftsTable.id, req.params.id as string)).returning();
  if (!deleted?.scheduleId) { res.status(404).json({ error: "Asignación no encontrada" }); return; }
  const issues = await validateAndPersistIssues(deleted.scheduleId) ?? [];
  await audit("planner_assignment_deleted", req.user!.id, "shift", deleted.id, { before: deleted, issues: issues.length });
  res.json({ success: true, issues });
});

router.post("/planner/schedules/:id/publish", requireAuth, requirePermission("planner.publish"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const issues = await validateAndPersistIssues(scheduleId);
  if (issues == null) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  if (!canPublish(issues)) {
    res.status(409).json({ error: "Corrige las incidencias antes de publicar", issues });
    return;
  }
  const [schedule] = await db.update(planningSchedulesTable).set({
    status: "PUBLISHED",
    publishedAt: new Date(),
    publishedBy: req.user!.id,
    updatedAt: new Date(),
  }).where(eq(planningSchedulesTable.id, scheduleId)).returning();
  await audit("planner_schedule_published", req.user!.id, "planning_schedule", scheduleId);
  res.json(schedule);
});

router.post("/planner/schedules/:id/archive", requireAuth, requirePermission("planner.publish"), async (req, res) => {
  const [schedule] = await db.update(planningSchedulesTable).set({
    status: "ARCHIVED",
    archivedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(planningSchedulesTable.id, req.params.id as string)).returning();
  if (!schedule) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  await audit("planner_schedule_archived", req.user!.id, "planning_schedule", schedule.id);
  res.json(schedule);
});

router.get("/planner/schedules/:id/reconciliation", requireAuth, requirePermission("planner.view"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const rows = await db.select({
    shiftId: shiftsTable.id,
    employeeId: shiftsTable.employeeId,
    date: shiftsTable.shiftDate,
    startTime: shiftsTable.startTime,
    endTime: shiftsTable.endTime,
    clockIn: timeRecordsTable.clockIn,
    clockOut: timeRecordsTable.clockOut,
  }).from(shiftsTable)
    .leftJoin(timeRecordsTable, eq(timeRecordsTable.plannedShiftId, shiftsTable.id))
    .where(eq(shiftsTable.scheduleId, scheduleId));
  res.json(rows.map((row) => ({
    ...row,
    comparison: row.clockIn && row.clockOut
      ? comparePlannedWithClock({
          id: row.shiftId,
          employeeId: row.employeeId,
          positionId: "",
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
        }, row.clockIn, row.clockOut)
      : null,
  })));
});

export default router;

import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  absencesTable,
  db,
  employeeAvailabilityTable,
  employeePlanningProfilesTable,
  employeesTable,
  fichajeAuditTable,
  hrEmployeePositionsTable,
  hrEmployeeRequestsTable,
  hrNotificationsTable,
  hrPositionsTable,
  planningIssuesTable,
  planningSchedulesTable,
  shiftsTable,
  shiftChangeEventsTable,
  shiftChangeLocksTable,
  shiftChangeRequestsTable,
  staffingRequirementsTable,
  timeRecordsTable,
} from "@workspace/db";
import { requireAuth, requirePermission } from "../middlewares/auth";
import {
  canPublish,
  expandDateRange,
  generateSchedule,
  type PlannedAssignment,
  type PlannerEmployee,
  type PlannerIssue,
  type StaffingNeed,
  validateSchedule,
} from "../lib/staff-planner";
import {
  evaluateShiftChange,
  assertShiftOwner,
  initialShiftChangeStatus,
  nextShiftChangeStatus,
  ShiftChangeError,
  shiftVersionMatches,
  SHIFT_CHANGE_TYPES,
  type ShiftChangeProposal,
  type ShiftChangeStatus,
  type ShiftSnapshot,
} from "../lib/shift-change";

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
  preferredWindows: z.array(z.object({
    type: z.literal("PREFERRED"),
    date: DateString.nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    startTime: TimeString.nullable().optional(),
    endTime: TimeString.nullable().optional(),
    validFrom: DateString.nullable().optional(),
    validTo: DateString.nullable().optional(),
  })).default([]),
  restrictions: z.record(z.string(), z.unknown()).default({}),
});

const ShiftChangeBody = z.object({
  requestType: z.enum(SHIFT_CHANGE_TYPES),
  originalShiftId: z.string().uuid(),
  recipientId: z.string().uuid().nullable().optional(),
  counterpartShiftId: z.string().uuid().nullable().optional(),
  proposal: z.object({
    employeeId: z.string().uuid().optional(),
    date: DateString.optional(),
    startTime: TimeString.optional(),
    endTime: TimeString.optional(),
  }).default({}),
  comment: z.string().trim().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const ShiftChangeCommentBody = z.object({
  comment: z.string().trim().max(500).nullable().optional(),
});

const ShiftChangeApproveBody = ShiftChangeCommentBody.extend({
  proposal: z.object({
    employeeId: z.string().uuid().optional(),
    date: DateString.optional(),
    startTime: TimeString.optional(),
    endTime: TimeString.optional(),
  }).optional(),
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

function toShiftSnapshot(shift: typeof shiftsTable.$inferSelect): ShiftSnapshot {
  if (!shift.scheduleId || !shift.positionId) {
    throw new Error("El turno no pertenece a un cuadrante planificable.");
  }
  return {
    id: shift.id,
    scheduleId: shift.scheduleId,
    employeeId: shift.employeeId,
    requirementId: shift.requirementId ?? undefined,
    positionId: shift.positionId,
    date: shift.shiftDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    origin: shift.origin as "generated" | "manual",
    updatedAt: shift.updatedAt.toISOString(),
  };
}

async function notifyShiftChange(
  executor: Pick<typeof db, "insert">,
  employeeId: string | null | undefined,
  title: string,
  body: string,
) {
  if (!employeeId) return;
  await executor.insert(hrNotificationsTable).values({
    employeeId,
    type: "shift_change",
    title,
    body,
  });
}

async function addShiftChangeEvent(
  executor: Pick<typeof db, "insert">,
  values: {
    requestId: string;
    actorId: string;
    action: string;
    previousStatus?: string | null;
    newStatus: string;
    comment?: string | null;
    metadata?: object;
  },
) {
  await executor.insert(shiftChangeEventsTable).values({
    ...values,
    previousStatus: values.previousStatus ?? null,
    comment: values.comment ?? null,
    metadata: values.metadata ?? null,
  });
}

async function enrichShiftChangeRows(rows: Array<typeof shiftChangeRequestsTable.$inferSelect>) {
  if (rows.length === 0) return [];
  const employeeIds = [...new Set(rows.flatMap((row) => [row.requesterId, row.recipientId, row.approvedBy])
    .filter((id): id is string => Boolean(id)))];
  const employees = employeeIds.length
    ? await db.select({ id: employeesTable.id, name: employeesTable.name })
      .from(employeesTable).where(inArray(employeesTable.id, employeeIds))
    : [];
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const requestIds = rows.map((row) => row.id);
  const events = await db.select().from(shiftChangeEventsTable)
    .where(inArray(shiftChangeEventsTable.requestId, requestIds))
    .orderBy(asc(shiftChangeEventsTable.createdAt));
  return rows.map((row) => ({
    ...row,
    requesterName: names.get(row.requesterId) ?? "Empleado",
    recipientName: row.recipientId ? names.get(row.recipientId) ?? "Empleado" : null,
    approvedByName: row.approvedBy ? names.get(row.approvedBy) ?? "Responsable" : null,
    events: events.filter((event) => event.requestId === row.id),
  }));
}

async function loadScheduleContext(scheduleId: string) {
  const [schedule] = await db
    .select()
    .from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, scheduleId))
    .limit(1);
  if (!schedule) return null;

  const [requirements, employeeRows, profiles, availability, absences, approvedRequests, positionLinks, shiftRows, constraintShiftRows] = await Promise.all([
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
    }).from(employeesTable).where(and(
      eq(employeesTable.active, true),
      eq(employeesTable.empStatus, "active"),
      schedule.workCenterId ? eq(employeesTable.workCenterId, schedule.workCenterId) : undefined,
    )),
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
    db.select().from(hrEmployeeRequestsTable).where(and(
      eq(hrEmployeeRequestsTable.status, "approved"),
      inArray(hrEmployeeRequestsTable.requestType, ["vacation", "absence"]),
      lte(hrEmployeeRequestsTable.dateFrom, schedule.dateTo),
      gte(hrEmployeeRequestsTable.dateTo, schedule.dateFrom),
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
      .where(and(
        gte(shiftsTable.shiftDate, schedule.dateFrom),
        lte(shiftsTable.shiftDate, schedule.dateTo),
      ))
      .orderBy(asc(shiftsTable.shiftDate), asc(shiftsTable.startTime)),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.employeeId, profile]));
  const requestedAbsenceDates = new Map<string, Set<string>>();
  for (const request of approvedRequests) {
    const from = request.dateFrom < schedule.dateFrom ? schedule.dateFrom : request.dateFrom;
    const to = request.dateTo > schedule.dateTo ? schedule.dateTo : request.dateTo;
    const dates = requestedAbsenceDates.get(request.employeeId) ?? new Set<string>();
    for (const date of expandDateRange(from, to)) dates.add(date);
    requestedAbsenceDates.set(request.employeeId, dates);
  }
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
      absenceDates: [...new Set([
        ...absences.filter((absence) => absence.employeeId === employee.id).map((absence) => absence.absenceDate),
        ...(requestedAbsenceDates.get(employee.id) ?? []),
      ])],
    };
  });
  const needs = requirements as StaffingNeed[];
  const assignments = constraintShiftRows.map((shift) => ({
    ...shift,
    positionId: shift.positionId ?? "",
    origin: shift.origin as PlannedAssignment["origin"],
  })) as PlannedAssignment[];
  return { schedule, requirements, employeeRows, profiles, availability, absences, approvedRequests, positionLinks, shiftRows, employees, needs, assignments };
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
  const currentAssignments = context.assignments.filter((assignment) =>
    context.shiftRows.some((shift) => shift.id === assignment.id),
  );
  const issues = validateSchedule(context.employees, context.needs, currentAssignments, context.assignments);
  await replaceIssues(scheduleId, issues);
  return issues;
}

async function isDraft(scheduleId: string): Promise<boolean> {
  const [schedule] = await db.select({ status: planningSchedulesTable.status })
    .from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, scheduleId))
    .limit(1);
  return schedule?.status === "DRAFT";
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
  if (!manager) {
    const positions = await db.select().from(hrPositionsTable)
      .where(eq(hrPositionsTable.active, true)).orderBy(asc(hrPositionsTable.name));
    res.json({
      schedule: context.schedule,
      requirements: context.requirements,
      shiftRows: context.shiftRows.filter((shift) => shift.employeeId === req.user!.id),
      employeeRows: context.employeeRows.filter((employee) => employee.id === req.user!.id),
      positions,
      issues: [],
    });
    return;
  }
  const issues = manager
    ? await db.select().from(planningIssuesTable).where(eq(planningIssuesTable.scheduleId, context.schedule.id))
    : [];
  const positions = await db.select().from(hrPositionsTable).where(eq(hrPositionsTable.active, true)).orderBy(asc(hrPositionsTable.name));
  res.json({ ...context, issues, positions });
});

router.post("/planner/schedules/:id/requirements", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const [schedule] = await db.select().from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, scheduleId)).limit(1);
  if (schedule?.status !== "DRAFT") { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
  const parsed = RequirementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Necesidad inválida", issues: parsed.error.issues }); return; }
  if (parsed.data.requirementDate < schedule.dateFrom || parsed.data.requirementDate > schedule.dateTo) {
    res.status(400).json({ error: "La necesidad debe estar dentro del periodo del cuadrante" }); return;
  }
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
  const [existing] = await db.select().from(staffingRequirementsTable)
    .where(eq(staffingRequirementsTable.id, req.params.id as string)).limit(1);
  if (!existing) { res.status(404).json({ error: "Necesidad no encontrada" }); return; }
  const [schedule] = await db.select().from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, existing.scheduleId)).limit(1);
  if (schedule?.status !== "DRAFT") { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
  if (parsed.data.requirementDate < schedule.dateFrom || parsed.data.requirementDate > schedule.dateTo) {
    res.status(400).json({ error: "La necesidad debe estar dentro del periodo del cuadrante" }); return;
  }
  const [updated] = await db.update(staffingRequirementsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(staffingRequirementsTable.id, req.params.id as string)).returning();
  if (!updated) { res.status(404).json({ error: "Necesidad no encontrada" }); return; }
  await validateAndPersistIssues(updated.scheduleId);
  await audit("planner_requirement_updated", req.user!.id, "staffing_requirement", updated.id, parsed.data);
  res.json(updated);
});

router.delete("/planner/requirements/:id", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const [existing] = await db.select().from(staffingRequirementsTable)
    .where(eq(staffingRequirementsTable.id, req.params.id as string)).limit(1);
  if (!existing) { res.status(404).json({ error: "Necesidad no encontrada" }); return; }
  if (!await isDraft(existing.scheduleId)) { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
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

  const existing = context.assignments.filter((assignment) =>
    assignment.origin === "manual"
    || !context.shiftRows.some((shift) => shift.id === assignment.id),
  );
  const result = generateSchedule(context.employees, context.needs, existing);
  await db.delete(shiftsTable).where(and(eq(shiftsTable.scheduleId, scheduleId), eq(shiftsTable.origin, "generated")));
  const generated = result.assignments.filter((assignment) => assignment.origin === "generated" && !assignment.id);
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
  await db.update(planningSchedulesTable).set({
    generatedAt: new Date(),
    generatedBy: req.user!.id,
    generationSource: "deterministic-v1",
    updatedAt: new Date(),
  }).where(eq(planningSchedulesTable.id, scheduleId));
  const issues = await validateAndPersistIssues(scheduleId) ?? result.issues;
  await audit("planner_schedule_generated", req.user!.id, "planning_schedule", scheduleId, {
    assignments: generated.length,
    issues: issues.length,
  });
  res.json({ generated: generated.length, issues });
});

router.post("/planner/schedules/:id/validate", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const issues = await validateAndPersistIssues(req.params.id as string);
  if (issues == null) { res.status(404).json({ error: "Cuadrante no encontrado" }); return; }
  res.json({ valid: issues.length === 0, issues });
});

router.post("/planner/schedules/:id/assignments", requireAuth, requirePermission("planner.manage"), async (req, res) => {
  const scheduleId = req.params.id as string;
  const [schedule] = await db.select().from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, scheduleId)).limit(1);
  if (schedule?.status !== "DRAFT") { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
  const parsed = AssignmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Turno inválido", issues: parsed.error.issues }); return; }
  if (parsed.data.shiftDate < schedule.dateFrom || parsed.data.shiftDate > schedule.dateTo) {
    res.status(400).json({ error: "El turno debe estar dentro del periodo del cuadrante" }); return;
  }
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
  const [schedule] = await db.select().from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, before.scheduleId)).limit(1);
  if (schedule?.status !== "DRAFT") { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
  if (parsed.data.shiftDate < schedule.dateFrom || parsed.data.shiftDate > schedule.dateTo) {
    res.status(400).json({ error: "El turno debe estar dentro del periodo del cuadrante" }); return;
  }
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
  const [existing] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, req.params.id as string)).limit(1);
  if (!existing?.scheduleId) { res.status(404).json({ error: "Asignación no encontrada" }); return; }
  if (!await isDraft(existing.scheduleId)) { res.status(409).json({ error: "Solo se pueden modificar borradores" }); return; }
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

router.get("/planner/shift-changes", requireAuth, requirePermission("shift_changes.view_own"), async (req, res) => {
  const rows = await db.select().from(shiftChangeRequestsTable)
    .where(or(
      eq(shiftChangeRequestsTable.requesterId, req.user!.id),
      eq(shiftChangeRequestsTable.recipientId, req.user!.id),
    ))
    .orderBy(desc(shiftChangeRequestsTable.createdAt));
  res.json(await enrichShiftChangeRows(rows));
});

router.get("/planner/shift-changes/manage", requireAuth, requirePermission("shift_changes.manage"), async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db.select().from(shiftChangeRequestsTable)
    .where(status ? eq(shiftChangeRequestsTable.status, status) : undefined)
    .orderBy(desc(shiftChangeRequestsTable.createdAt));
  res.json(await enrichShiftChangeRows(rows));
});

router.get("/planner/shift-changes/options/:shiftId", requireAuth, requirePermission("shift_changes.create"), async (req, res) => {
  const [shift] = await db.select().from(shiftsTable)
    .where(eq(shiftsTable.id, req.params.shiftId as string)).limit(1);
  if (!shift || shift.employeeId !== req.user!.id || !shift.scheduleId) {
    res.status(404).json({ error: "Turno publicado propio no encontrado" }); return;
  }
  const [schedule] = await db.select().from(planningSchedulesTable)
    .where(eq(planningSchedulesTable.id, shift.scheduleId)).limit(1);
  if (schedule?.status !== "PUBLISHED") {
    res.status(409).json({ error: "Solo se admiten cambios sobre turnos publicados" }); return;
  }
  const employees = await db.select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(and(
      eq(employeesTable.active, true),
      eq(employeesTable.empStatus, "active"),
    ))
    .orderBy(asc(employeesTable.name));
  const shifts = await db.select({
    id: shiftsTable.id,
    employeeId: shiftsTable.employeeId,
    date: shiftsTable.shiftDate,
    startTime: shiftsTable.startTime,
    endTime: shiftsTable.endTime,
    positionId: shiftsTable.positionId,
  }).from(shiftsTable).where(eq(shiftsTable.scheduleId, shift.scheduleId));
  res.json({
    employees: employees.filter((employee) => employee.id !== req.user!.id),
    shifts: shifts.filter((candidate) => candidate.employeeId !== req.user!.id),
  });
});

router.post("/planner/shift-changes", requireAuth, requirePermission("shift_changes.create"), async (req, res) => {
  const parsed = ShiftChangeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud de cambio inválida", issues: parsed.error.issues }); return;
  }
  const data = parsed.data;
  try {
    const request = await db.transaction(async (tx) => {
      const [original] = await tx.select().from(shiftsTable)
        .where(eq(shiftsTable.id, data.originalShiftId)).limit(1);
      if (!original || !original.scheduleId) {
        throw new ShiftChangeError("FOREIGN_SHIFT", "Solo puedes solicitar cambios sobre tus propios turnos.");
      }
      assertShiftOwner(req.user!.id, toShiftSnapshot(original));
      const [schedule] = await tx.select().from(planningSchedulesTable)
        .where(eq(planningSchedulesTable.id, original.scheduleId)).limit(1);
      if (schedule?.status !== "PUBLISHED") {
        throw new ShiftChangeError("NOT_PUBLISHED", "Solo se admiten cambios sobre turnos publicados.");
      }

      const needsRecipient = data.requestType === "SWAP" || data.requestType === "TRANSFER";
      if (needsRecipient && !data.recipientId) {
        throw new ShiftChangeError("MISSING_RECIPIENT", "Selecciona un empleado receptor.");
      }
      if (!needsRecipient && data.recipientId) {
        throw new ShiftChangeError("UNEXPECTED_RECIPIENT", "Este tipo de solicitud se envía directamente al responsable.");
      }
      if (data.recipientId === req.user!.id) {
        throw new ShiftChangeError("SAME_EMPLOYEE", "No puedes enviarte un cambio a ti mismo.");
      }

      let counterpart: typeof shiftsTable.$inferSelect | undefined;
      if (data.requestType === "SWAP") {
        if (!data.counterpartShiftId) {
          throw new ShiftChangeError("MISSING_COUNTERPART", "Selecciona el turno que deseas intercambiar.");
        }
        [counterpart] = await tx.select().from(shiftsTable)
          .where(eq(shiftsTable.id, data.counterpartShiftId)).limit(1);
        if (!counterpart
          || counterpart.employeeId !== data.recipientId
          || counterpart.scheduleId !== original.scheduleId) {
          throw new ShiftChangeError("INVALID_COUNTERPART", "El turno receptor no pertenece al empleado y cuadrante indicados.");
        }
      } else if (data.counterpartShiftId) {
        throw new ShiftChangeError("UNEXPECTED_COUNTERPART", "Solo los intercambios incluyen un segundo turno.");
      }

      const linkedShiftIds = [original.id, counterpart?.id].filter((id): id is string => Boolean(id));
      const linkedRecords = await tx.select({ id: timeRecordsTable.id }).from(timeRecordsTable)
        .where(inArray(timeRecordsTable.plannedShiftId, linkedShiftIds)).limit(1);
      if (linkedRecords.length > 0) {
        throw new ShiftChangeError("SHIFT_ALREADY_CLOCKED", "No se puede solicitar un cambio cuando el fichaje del turno ya ha comenzado.");
      }

      const originalSnapshot = toShiftSnapshot(original);
      const counterpartSnapshot = counterpart ? toShiftSnapshot(counterpart) : null;
      const status = initialShiftChangeStatus(data.recipientId);
      const [created] = await tx.insert(shiftChangeRequestsTable).values({
        requestType: data.requestType,
        status,
        scheduleId: original.scheduleId,
        requesterId: req.user!.id,
        recipientId: data.recipientId ?? null,
        originalShiftId: original.id,
        counterpartShiftId: counterpart?.id ?? null,
        originalShiftUpdatedAt: original.updatedAt,
        counterpartShiftUpdatedAt: counterpart?.updatedAt ?? null,
        originalSnapshot,
        counterpartSnapshot,
        proposal: data.proposal,
        requesterComment: data.comment ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      }).returning();

      await tx.insert(shiftChangeLocksTable).values([
        { requestId: created.id, shiftId: original.id, expectedUpdatedAt: original.updatedAt },
        ...(counterpart ? [{ requestId: created.id, shiftId: counterpart.id, expectedUpdatedAt: counterpart.updatedAt }] : []),
      ]);
      await addShiftChangeEvent(tx, {
        requestId: created.id,
        actorId: req.user!.id,
        action: "CREATED",
        newStatus: status,
        comment: data.comment,
        metadata: { originalSnapshot, counterpartSnapshot, proposal: data.proposal },
      });
      await notifyShiftChange(
        tx,
        data.recipientId,
        "Solicitud de cambio de turno",
        `${req.user!.name} te ha enviado una solicitud de cambio.`,
      );
      return created;
    });
    res.status(201).json((await enrichShiftChangeRows([request]))[0]);
  } catch (error) {
    if (error instanceof ShiftChangeError) {
      res.status(error.code === "FOREIGN_SHIFT" ? 403 : 409).json({ error: error.message, code: error.code }); return;
    }
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ya existe una solicitud activa sobre uno de estos turnos.", code: "SHIFT_LOCKED" }); return;
    }
    throw error;
  }
});

async function transitionShiftChange(
  requestId: string,
  actorId: string,
  action: "ACCEPT" | "REJECT_RECIPIENT" | "REJECT_MANAGER" | "CANCEL",
  comment?: string | null,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM shift_change_requests WHERE id = ${requestId} FOR UPDATE`);
    const [request] = await tx.select().from(shiftChangeRequestsTable)
      .where(eq(shiftChangeRequestsTable.id, requestId)).limit(1);
    if (!request) throw new ShiftChangeError("NOT_FOUND", "Solicitud no encontrada.");
    if (request.expiresAt && request.expiresAt <= new Date()) {
      const next = nextShiftChangeStatus(request.status as ShiftChangeStatus, "EXPIRE");
      const [expired] = await tx.update(shiftChangeRequestsTable)
        .set({ status: next, resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(shiftChangeRequestsTable.id, requestId)).returning();
      await tx.delete(shiftChangeLocksTable).where(eq(shiftChangeLocksTable.requestId, requestId));
      await addShiftChangeEvent(tx, { requestId, actorId, action: "EXPIRED", previousStatus: request.status, newStatus: next });
      return { expired: true as const, request: expired };
    }
    if (action === "ACCEPT" || action === "REJECT_RECIPIENT") {
      if (request.recipientId !== actorId) {
        throw new ShiftChangeError("NOT_RECIPIENT", "Solo el empleado receptor puede responder.");
      }
    } else if (action === "CANCEL" && request.requesterId !== actorId) {
      throw new ShiftChangeError("NOT_REQUESTER", "Solo el solicitante puede cancelar.");
    }
    const next = nextShiftChangeStatus(request.status as ShiftChangeStatus, action);
    const terminal = ["REJECTED_BY_RECIPIENT", "REJECTED_BY_MANAGER", "CANCELLED"].includes(next);
    const [updated] = await tx.update(shiftChangeRequestsTable).set({
      status: next,
      managerComment: action === "REJECT_MANAGER" ? comment : request.managerComment,
      resolvedAt: terminal ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(shiftChangeRequestsTable.id, requestId)).returning();
    if (terminal) await tx.delete(shiftChangeLocksTable).where(eq(shiftChangeLocksTable.requestId, requestId));
    await addShiftChangeEvent(tx, {
      requestId,
      actorId,
      action,
      previousStatus: request.status,
      newStatus: next,
      comment,
    });
    await notifyShiftChange(
      tx,
      request.requesterId,
      action === "ACCEPT" ? "Cambio de turno aceptado" : "Cambio de turno actualizado",
      action === "ACCEPT"
        ? "El empleado receptor ha aceptado. Queda pendiente de aprobación."
        : `La solicitud ahora está en estado ${next}.`,
    );
    return { expired: false as const, request: updated };
  });
}

router.post("/planner/shift-changes/:id/accept", requireAuth, requirePermission("shift_changes.respond"), async (req, res) => {
  const parsed = ShiftChangeCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Comentario inválido" }); return; }
  try {
    const result = await transitionShiftChange(req.params.id as string, req.user!.id, "ACCEPT", parsed.data.comment);
    if (result.expired) { res.status(409).json({ error: "La solicitud ha caducado.", code: "EXPIRED", request: result.request }); return; }
    res.json(result.request);
  } catch (error) {
    if (error instanceof ShiftChangeError) { res.status(error.code.startsWith("NOT_") ? 403 : 409).json({ error: error.message, code: error.code }); return; }
    throw error;
  }
});

router.post("/planner/shift-changes/:id/reject", requireAuth, requirePermission("shift_changes.respond"), async (req, res) => {
  const parsed = ShiftChangeCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Comentario inválido" }); return; }
  try {
    const result = await transitionShiftChange(req.params.id as string, req.user!.id, "REJECT_RECIPIENT", parsed.data.comment);
    if (result.expired) { res.status(409).json({ error: "La solicitud ha caducado.", code: "EXPIRED", request: result.request }); return; }
    res.json(result.request);
  } catch (error) {
    if (error instanceof ShiftChangeError) { res.status(error.code.startsWith("NOT_") ? 403 : 409).json({ error: error.message, code: error.code }); return; }
    throw error;
  }
});

router.post("/planner/shift-changes/:id/cancel", requireAuth, requirePermission("shift_changes.create"), async (req, res) => {
  const parsed = ShiftChangeCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Comentario inválido" }); return; }
  try {
    const result = await transitionShiftChange(req.params.id as string, req.user!.id, "CANCEL", parsed.data.comment);
    if (result.expired) { res.status(409).json({ error: "La solicitud ha caducado.", code: "EXPIRED", request: result.request }); return; }
    res.json(result.request);
  } catch (error) {
    if (error instanceof ShiftChangeError) { res.status(error.code.startsWith("NOT_") ? 403 : 409).json({ error: error.message, code: error.code }); return; }
    throw error;
  }
});

router.post("/planner/shift-changes/:id/manager-reject", requireAuth, requirePermission("shift_changes.manage"), async (req, res) => {
  const parsed = ShiftChangeCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Comentario inválido" }); return; }
  try {
    const result = await transitionShiftChange(req.params.id as string, req.user!.id, "REJECT_MANAGER", parsed.data.comment);
    if (result.expired) { res.status(409).json({ error: "La solicitud ha caducado.", code: "EXPIRED", request: result.request }); return; }
    res.json(result.request);
  } catch (error) {
    if (error instanceof ShiftChangeError) { res.status(409).json({ error: error.message, code: error.code }); return; }
    throw error;
  }
});

router.post("/planner/shift-changes/:id/approve", requireAuth, requirePermission("shift_changes.manage"), async (req, res) => {
  const parsed = ShiftChangeApproveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Aprobación inválida", issues: parsed.error.issues }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const requestId = req.params.id as string;
      await tx.execute(sql`SELECT id FROM shift_change_requests WHERE id = ${requestId} FOR UPDATE`);
      const [request] = await tx.select().from(shiftChangeRequestsTable)
        .where(eq(shiftChangeRequestsTable.id, requestId)).limit(1);
      if (!request) throw new ShiftChangeError("NOT_FOUND", "Solicitud no encontrada.");
      if (request.status !== "PENDING_MANAGER") {
        throw new ShiftChangeError("INVALID_TRANSITION", "La solicitud no está pendiente de aprobación.");
      }
      if (request.expiresAt && request.expiresAt <= new Date()) {
        const next = nextShiftChangeStatus(request.status as ShiftChangeStatus, "EXPIRE");
        const [expired] = await tx.update(shiftChangeRequestsTable)
          .set({ status: next, resolvedAt: new Date(), updatedAt: new Date() })
          .where(eq(shiftChangeRequestsTable.id, requestId)).returning();
        await tx.delete(shiftChangeLocksTable).where(eq(shiftChangeLocksTable.requestId, requestId));
        await addShiftChangeEvent(tx, {
          requestId,
          actorId: req.user!.id,
          action: "EXPIRED",
          previousStatus: request.status,
          newStatus: next,
        });
        return { expired: true as const, request: expired };
      }
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${request.scheduleId}, 0))`);
      const shiftIds = [request.originalShiftId, request.counterpartShiftId].filter((id): id is string => Boolean(id));
      await tx.execute(sql`SELECT id FROM shifts WHERE id = ANY(${shiftIds}::uuid[]) FOR UPDATE`);
      const currentShifts = await tx.select().from(shiftsTable).where(inArray(shiftsTable.id, shiftIds));
      const original = currentShifts.find((shift) => shift.id === request.originalShiftId);
      const counterpart = request.counterpartShiftId
        ? currentShifts.find((shift) => shift.id === request.counterpartShiftId)
        : undefined;
      if (!original || (request.counterpartShiftId && !counterpart)) {
        throw new ShiftChangeError("SHIFT_CHANGED", "Uno de los turnos ya no existe.");
      }
      const originalSnapshot = request.originalSnapshot as ShiftSnapshot;
      const counterpartSnapshot = request.counterpartSnapshot as ShiftSnapshot | null;
      if (!shiftVersionMatches(originalSnapshot, toShiftSnapshot(original))
        || (counterpartSnapshot && counterpart && !shiftVersionMatches(counterpartSnapshot, toShiftSnapshot(counterpart)))) {
        throw new ShiftChangeError("SHIFT_CHANGED", "El turno cambió después de crear la solicitud. Crea una nueva solicitud.");
      }
      const linkedRecords = await tx.select({ id: timeRecordsTable.id }).from(timeRecordsTable)
        .where(inArray(timeRecordsTable.plannedShiftId, shiftIds)).limit(1);
      if (linkedRecords.length > 0) {
        throw new ShiftChangeError("SHIFT_ALREADY_CLOCKED", "El fichaje ya está vinculado; el turno no se modificó.");
      }
      const proposal = {
        ...(request.proposal as ShiftChangeProposal),
        ...(parsed.data.proposal ?? {}),
      };
      const context = await loadScheduleContext(request.scheduleId);
      if (!context) throw new ShiftChangeError("SCHEDULE_MISSING", "No se encontró el cuadrante.");
      if (context.schedule.status !== "PUBLISHED") {
        throw new ShiftChangeError("NOT_PUBLISHED", "El cuadrante ya no está publicado.");
      }
      const evaluation = evaluateShiftChange({
        type: request.requestType as typeof SHIFT_CHANGE_TYPES[number],
        requesterId: request.requesterId,
        recipientId: request.recipientId,
        original: originalSnapshot,
        counterpart: counterpartSnapshot,
        proposal,
        employees: context.employees,
        assignments: context.assignments,
      });
      const changed = new Map(evaluation.assignments.map((assignment) => [assignment.id, assignment]));
      const finalAll = context.assignments.map((assignment) => changed.get(assignment.id) ?? assignment);
      const finalCurrent = finalAll.filter((assignment) =>
        context.shiftRows.some((shift) => shift.id === assignment.id),
      );
      const fullIssues = validateSchedule(context.employees, context.needs, finalCurrent, finalAll);
      const issues = [...evaluation.issues, ...fullIssues].filter((issue, index, all) =>
        all.findIndex((candidate) =>
          candidate.code === issue.code
          && candidate.shiftId === issue.shiftId
          && candidate.message === issue.message,
        ) === index,
      );
      if (issues.length > 0) {
        await tx.update(shiftChangeRequestsTable).set({
          validationIssues: issues,
          managerComment: parsed.data.comment ?? request.managerComment,
          updatedAt: new Date(),
        }).where(eq(shiftChangeRequestsTable.id, requestId));
        await addShiftChangeEvent(tx, {
          requestId,
          actorId: req.user!.id,
          action: "VALIDATION_BLOCKED",
          previousStatus: request.status,
          newStatus: request.status,
          comment: parsed.data.comment,
          metadata: { issues, impactMinutes: evaluation.impactMinutes },
        });
        return { expired: false as const, blocked: true as const, issues, impactMinutes: evaluation.impactMinutes };
      }

      for (const assignment of evaluation.assignments) {
        await tx.update(shiftsTable).set({
          employeeId: assignment.employeeId,
          shiftDate: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          updatedAt: new Date(),
        }).where(eq(shiftsTable.id, assignment.id!));
      }
      const next = nextShiftChangeStatus(request.status as ShiftChangeStatus, "APPROVE");
      const [updated] = await tx.update(shiftChangeRequestsTable).set({
        status: next,
        proposal,
        validationIssues: [],
        managerComment: parsed.data.comment ?? null,
        approvedBy: req.user!.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(shiftChangeRequestsTable.id, requestId)).returning();
      await tx.delete(shiftChangeLocksTable).where(eq(shiftChangeLocksTable.requestId, requestId));
      await addShiftChangeEvent(tx, {
        requestId,
        actorId: req.user!.id,
        action: "APPROVED",
        previousStatus: request.status,
        newStatus: next,
        comment: parsed.data.comment,
        metadata: {
          before: { original: originalSnapshot, counterpart: counterpartSnapshot },
          after: evaluation.assignments,
          impactMinutes: evaluation.impactMinutes,
        },
      });
      await tx.insert(fichajeAuditTable).values({
        action: "shift_change_approved",
        performedBy: req.user!.id,
        entityType: "shift_change_request",
        entityId: requestId,
        details: {
          before: { original: originalSnapshot, counterpart: counterpartSnapshot },
          after: evaluation.assignments,
        },
      });
      await notifyShiftChange(tx, request.requesterId, "Cambio de turno aprobado", "El responsable ha aprobado el cambio.");
      await notifyShiftChange(tx, request.recipientId, "Cambio de turno aprobado", "El responsable ha aprobado el cambio.");
      return { expired: false as const, blocked: false as const, request: updated, impactMinutes: evaluation.impactMinutes };
    });
    if (result.expired) {
      res.status(409).json({ error: "La solicitud ha caducado.", code: "EXPIRED", request: result.request }); return;
    }
    if (result.blocked) {
      res.status(409).json({ error: "El cambio incumple restricciones obligatorias.", ...result }); return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof ShiftChangeError) {
      res.status(error.code === "NOT_FOUND" ? 404 : 409).json({ error: error.message, code: error.code }); return;
    }
    throw error;
  }
});

router.get("/planner/schedules/:id/reconciliation", requireAuth, requirePermission("timeclock.manage"), async (req, res) => {
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
  res.json(rows);
});

export default router;

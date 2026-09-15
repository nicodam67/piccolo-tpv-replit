import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const planningSchedulesTable = pgTable("planning_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  status: text("status").notNull().default("DRAFT"),
  workCenterId: uuid("work_center_id"),
  generationSource: text("generation_source").notNull().default("manual"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  generatedBy: uuid("generated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by").references(() => employeesTable.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffingRequirementsTable = pgTable("staffing_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => planningSchedulesTable.id, { onDelete: "cascade" }),
  requirementDate: date("requirement_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  positionId: uuid("position_id").notNull(),
  requiredCount: integer("required_count").notNull(),
  source: text("source").notNull().default("manual"),
  sourceMetadata: jsonb("source_metadata"),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeePlanningProfilesTable = pgTable("employee_planning_profiles", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  maxWeeklyMinutes: integer("max_weekly_minutes"),
  minRestMinutes: integer("min_rest_minutes").notNull().default(720),
  allowsSplitShift: boolean("allows_split_shift").notNull().default(false),
  workingDays: jsonb("working_days").notNull().default([1, 2, 3, 4, 5, 6, 0]),
  preferredWindows: jsonb("preferred_windows").notNull().default([]),
  restrictions: jsonb("restrictions").notNull().default({}),
  updatedBy: uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeAvailabilityTable = pgTable("employee_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  availabilityType: text("availability_type").notNull(),
  availabilityDate: date("availability_date"),
  dayOfWeek: integer("day_of_week"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planningIssuesTable = pgTable("planning_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => planningSchedulesTable.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id"),
  requirementId: uuid("requirement_id"),
  employeeId: uuid("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  severity: text("severity").notNull().default("error"),
  message: text("message").notNull(),
  details: jsonb("details"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shiftChangeRequestsTable = pgTable("shift_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestType: text("request_type").notNull(),
  status: text("status").notNull().default("PENDING_RECIPIENT"),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => planningSchedulesTable.id, { onDelete: "restrict" }),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),
  recipientId: uuid("recipient_id").references(() => employeesTable.id, { onDelete: "restrict" }),
  originalShiftId: uuid("original_shift_id").notNull(),
  counterpartShiftId: uuid("counterpart_shift_id"),
  originalShiftUpdatedAt: timestamp("original_shift_updated_at", { withTimezone: true }).notNull(),
  counterpartShiftUpdatedAt: timestamp("counterpart_shift_updated_at", { withTimezone: true }),
  originalSnapshot: jsonb("original_snapshot").notNull(),
  counterpartSnapshot: jsonb("counterpart_snapshot"),
  proposal: jsonb("proposal").notNull().default({}),
  requesterComment: text("requester_comment"),
  managerComment: text("manager_comment"),
  validationIssues: jsonb("validation_issues").notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shiftChangeLocksTable = pgTable("shift_change_locks", {
  requestId: uuid("request_id")
    .notNull()
    .references(() => shiftChangeRequestsTable.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").primaryKey(),
  expectedUpdatedAt: timestamp("expected_updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shiftChangeEventsTable = pgTable("shift_change_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => shiftChangeRequestsTable.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => employeesTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  comment: text("comment"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanningSchedule = typeof planningSchedulesTable.$inferSelect;
export type StaffingRequirement = typeof staffingRequirementsTable.$inferSelect;
export type EmployeePlanningProfile = typeof employeePlanningProfilesTable.$inferSelect;
export type EmployeeAvailability = typeof employeeAvailabilityTable.$inferSelect;
export type PlanningIssue = typeof planningIssuesTable.$inferSelect;
export type ShiftChangeRequest = typeof shiftChangeRequestsTable.$inferSelect;
export type ShiftChangeEvent = typeof shiftChangeEventsTable.$inferSelect;

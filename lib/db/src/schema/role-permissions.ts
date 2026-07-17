import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

// ─── Role Permissions ─────────────────────────────────────────────────────────
// Stores explicit overrides for (role, module, action) triples.
// If no row exists for a combination, the default blanket-role access applies.
// Rows with allowed=false explicitly deny a capability for that role.

export const rolePermissionsTable = pgTable("role_permissions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  role:       text("role").notNull(),    // 'admin'|'manager'|'encargado'|'waiter'|'cashier'
  module:     text("module").notNull(),  // e.g. 'orders', 'payments', 'discounts'
  action:     text("action").notNull(),  // e.g. 'create', 'edit', 'delete', 'apply_discount'
  allowed:    boolean("allowed").notNull().default(true),
  updatedBy:  uuid("updated_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

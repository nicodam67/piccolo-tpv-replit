import {
  boolean,
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ingredientsTable, subrecipesTable } from "./stock";
import { productsTable } from "./categories";
import { ordersTable } from "./orders";
import { restaurantTablesTable } from "./tables";
import { employeesTable } from "./employees";
import { kitchenTasksTable, orderItemsTable } from "./order-items";
import { ingredientLotsTable } from "./suppliers";

// ─── Official allergen catalogue (14 EU Regulation 1169/2011 allergens) ────────
export const allergensCatalogTable = pgTable("allergens_catalog", {
  code: text("code").primaryKey(), // gluten | crustaceans | eggs | fish | peanuts | soy | milk | tree_nuts | celery | mustard | sesame | sulphites | lupin | molluscs
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description").notNull().default(""),
  iconSlug: text("icon_slug").notNull(),  // used as CSS class / icon key on frontend
  active: boolean("active").notNull().default(true),
  sortOrder: text("sort_order").notNull().default("0"),
});

// ─── Allergens per ingredient (structured, replaces raw allergenTags jsonb) ────
// allergenTags jsonb is kept for backward compat; this is the authoritative source
export const ingredientAllergensTable = pgTable("ingredient_allergens", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id, { onDelete: "cascade" }),
  allergenCode: text("allergen_code")
    .notNull()
    .references(() => allergensCatalogTable.code, { onDelete: "cascade" }),
  /** contains | traces | cross_contamination */
  type: text("type").notNull().default("contains"),
  manufacturerInfo: text("manufacturer_info"),
  technicalDocUrl: text("technical_doc_url"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Version history for ingredient allergens ─────────────────────────────────
export const ingredientAllergenVersionsTable = pgTable("ingredient_allergen_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(), // array of {allergenCode, type, manufacturerInfo}
  changedBy: uuid("changed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  changeReason: text("change_reason"),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
});

// ─── Computed allergen cache per product ──────────────────────────────────────
// Aggregated from ingredients + subrecipes; type = most restrictive
// contains > traces > cross_contamination
export const productAllergenCacheTable = pgTable("product_allergen_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  allergenCode: text("allergen_code")
    .notNull()
    .references(() => allergensCatalogTable.code, { onDelete: "cascade" }),
  /** contains | traces | cross_contamination */
  type: text("type").notNull(),
  /** ingredient | subrecipe | manual */
  source: text("source").notNull().default("ingredient"),
  /** true when upstream ingredient/recipe changed but admin has not reviewed yet */
  needsReview: boolean("needs_review").notNull().default(false),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Manual allergen overrides / warnings for a product ──────────────────────
export const productAllergenOverridesTable = pgTable("product_allergen_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  allergenCode: text("allergen_code")
    .notNull()
    .references(() => allergensCatalogTable.code, { onDelete: "cascade" }),
  type: text("type").notNull(), // contains | traces | cross_contamination
  note: text("note"),
  addedBy: uuid("added_by").references(() => employeesTable.id, { onDelete: "set null" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Table / order guest allergy registration ─────────────────────────────────
export const tableGuestAllergiesTable = pgTable("table_guest_allergies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").references(() => restaurantTablesTable.id, { onDelete: "set null" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  guestNumber: text("guest_number").notNull().default("1"),
  allergenCode: text("allergen_code")
    .notNull()
    .references(() => allergensCatalogTable.code),
  /** life_threatening | intolerance | preference */
  severity: text("severity").notNull().default("intolerance"),
  notes: text("notes"),
  registeredBy: uuid("registered_by").references(() => employeesTable.id, { onDelete: "set null" }),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

// ─── Log of manager overrides when a blocked item is added despite allergy ────
export const allergyOverrideLogTable = pgTable("allergy_override_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, { onDelete: "set null" }),
  allergenCode: text("allergen_code").notNull(),
  guestAllergyId: uuid("guest_allergy_id").references(() => tableGuestAllergiesTable.id, { onDelete: "set null" }),
  authorizedBy: uuid("authorized_by").references(() => employeesTable.id, { onDelete: "set null" }),
  reason: text("reason"),
  overriddenAt: timestamp("overridden_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── KDS allergy confirmation (cook confirms before starting special prep) ─────
export const kitchenAllergyConfirmationsTable = pgTable("kitchen_allergy_confirmations", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => kitchenTasksTable.id, { onDelete: "cascade" }),
  guestAllergyIds: jsonb("guest_allergy_ids").$type<string[]>().default([]),
  confirmedBy: uuid("confirmed_by").references(() => employeesTable.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  hasCrossContaminationRisk: boolean("has_cross_contamination_risk").notNull().default(false),
});

// ─── Ingredient substitutions made in kitchen ─────────────────────────────────
export const ingredientSubstitutionsTable = pgTable("ingredient_substitutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => kitchenTasksTable.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, { onDelete: "set null" }),
  originalIngredientId: uuid("original_ingredient_id").references(() => ingredientsTable.id, { onDelete: "set null" }),
  substituteIngredientId: uuid("substitute_ingredient_id").references(() => ingredientsTable.id, { onDelete: "set null" }),
  originalIngredientName: text("original_ingredient_name").notNull(),
  substituteIngredientName: text("substitute_ingredient_name").notNull(),
  /** computed allergens after substitution */
  newAllergenSummary: jsonb("new_allergen_summary").$type<{code: string; type: string}[]>().default([]),
  authorizedBy: uuid("authorized_by").references(() => employeesTable.id, { onDelete: "set null" }),
  waiterConfirmedAt: timestamp("waiter_confirmed_at", { withTimezone: true }),
  substitutedAt: timestamp("substituted_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Lot blocks / recall flow ─────────────────────────────────────────────────
export const lotBlocksTable = pgTable("lot_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => ingredientLotsTable.id, { onDelete: "restrict" }),
  lotNumber: text("lot_number").notNull(),
  ingredientId: uuid("ingredient_id").references(() => ingredientsTable.id, { onDelete: "set null" }),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  blockedBy: uuid("blocked_by").references(() => employeesTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  /** JSON report: {affectedIngredients, affectedProducts, affectedOrders} */
  blockReport: jsonb("block_report").$type<{
    affectedIngredients: {id: string; name: string}[];
    affectedProducts: {id: string; name: string}[];
    affectedOrders: {id: string; tableId?: string; date: string}[];
    summary: string;
  }>(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => employeesTable.id, { onDelete: "set null" }),
  resolveNote: text("resolve_note"),
});

// ─── Product technical sheets (versioned) ────────────────────────────────────
export const productTechnicalSheetsTable = pgTable("product_technical_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  version: text("version").notNull().default("1"),
  content: jsonb("content").notNull().$type<{
    productName: string;
    ingredients: {name: string; allergens: {code: string; type: string}[]}[];
    allergens: {code: string; type: string; source: string}[];
    notes: string;
    crossContaminationRisks: string[];
  }>(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Allergen audit log ───────────────────────────────────────────────────────
export const allergenAuditLogTable = pgTable("allergen_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** ingredient_allergen | product_recipe | table_allergy | kds_confirmation | substitution | lot_block | override | technical_sheet */
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: uuid("actor_id").references(() => employeesTable.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull().default(""),
  terminal: text("terminal"),
  before: jsonb("before"),
  after: jsonb("after"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type AllergenCatalog = typeof allergensCatalogTable.$inferSelect;
export type IngredientAllergen = typeof ingredientAllergensTable.$inferSelect;
export type IngredientAllergenVersion = typeof ingredientAllergenVersionsTable.$inferSelect;
export type ProductAllergenCache = typeof productAllergenCacheTable.$inferSelect;
export type TableGuestAllergy = typeof tableGuestAllergiesTable.$inferSelect;
export type AllergyOverrideLog = typeof allergyOverrideLogTable.$inferSelect;
export type KitchenAllergyConfirmation = typeof kitchenAllergyConfirmationsTable.$inferSelect;
export type IngredientSubstitution = typeof ingredientSubstitutionsTable.$inferSelect;
export type LotBlock = typeof lotBlocksTable.$inferSelect;
export type ProductTechnicalSheet = typeof productTechnicalSheetsTable.$inferSelect;
export type AllergenAuditLog = typeof allergenAuditLogTable.$inferSelect;

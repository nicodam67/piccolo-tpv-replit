import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { productsTable, productFormatsTable } from "./categories";
import { employeesTable } from "./employees";
import { orderItemsTable } from "./order-items";

// ─── Ingredient categories ─────────────────────────────────────────────────────
export const ingredientCategoriesTable = pgTable("ingredient_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon").notNull().default("📦"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Storage locations ────────────────────────────────────────────────────────
export const storageLocationsTable = pgTable("storage_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  temperature: text("temperature").notNull().default("ambient"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Ingredients ──────────────────────────────────────────────────────────────
export const ingredientsTable = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  internalCode: text("internal_code"),
  // Category & location
  categoryId: uuid("category_id").references(() => ingredientCategoriesTable.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => storageLocationsTable.id, { onDelete: "set null" }),
  // Units: purchaseUnit is what you buy (e.g. "caja"), consumptionUnit is what recipes use (e.g. "kg"),
  // conversionFactor = consumptionUnits per purchaseUnit (e.g. 12 if 1 caja = 12 kg).
  unit: text("unit").notNull().default("ud"),              // legacy / display unit
  purchaseUnit: text("purchase_unit").notNull().default("ud"),
  consumptionUnit: text("consumption_unit").notNull().default("ud"),
  conversionFactor: numeric("conversion_factor", { precision: 10, scale: 4 }).notNull().default("1"),
  // Costs: purchaseCost = last known price per purchaseUnit;
  // averageCost = weighted average per consumptionUnit (kept in sync on every receipt).
  purchaseCost: numeric("purchase_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  averageCost: numeric("average_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  lastPurchaseCost: numeric("last_purchase_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  // Stock levels
  currentStock: numeric("current_stock", { precision: 10, scale: 4 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 10, scale: 4 }).notNull().default("0"),
  optimalStock: numeric("optimal_stock", { precision: 10, scale: 4 }).notNull().default("0"),
  maxStock: numeric("max_stock", { precision: 10, scale: 4 }).notNull().default("0"),
  supplierName: text("supplier_name"),
  allergenTags: jsonb("allergen_tags").$type<string[]>().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Waste records ────────────────────────────────────────────────────────────
// Tracks deliberate waste/merma events (expiry, spoilage, breakage, etc.)
// distinct from stock_movements.waste which is implicit.

export const wasteRecordsTable = pgTable("waste_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("ud"),
  unitCost: numeric("unit_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  reason: text("reason").notNull().default(""),
  wasteType: text("waste_type").notNull().default("expired"),
  employeeId: uuid("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Sub-recipes ──────────────────────────────────────────────────────────────
export const subrecipesTable = pgTable("subrecipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("ud"),
  yieldQuantity: numeric("yield_quantity", { precision: 10, scale: 4 }).notNull().default("1"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  cost: numeric("cost", { precision: 10, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Sub-recipe items ─────────────────────────────────────────────────────────
export const subrecipeItemsTable = pgTable("subrecipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subrecipeId: uuid("subrecipe_id")
    .notNull()
    .references(() => subrecipesTable.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull().default("0"),
  unit: text("unit").notNull().default("ud"),
  wastePercent: numeric("waste_percent", { precision: 5, scale: 2 }).notNull().default("0"),
});

// ─── Ingredient cost history ───────────────────────────────────────────────────
export const ingredientCostHistoryTable = pgTable("ingredient_cost_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredientsTable.id),
  previousCost: numeric("previous_cost", { precision: 10, scale: 4 }).notNull(),
  newCost: numeric("new_cost", { precision: 10, scale: 4 }).notNull(),
  supplierName: text("supplier_name"),
  reason: text("reason"),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Recipe items ─────────────────────────────────────────────────────────────
export const recipeItemsTable = pgTable("recipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  formatId: uuid("format_id").references(() => productFormatsTable.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").references(() => ingredientsTable.id, { onDelete: "cascade" }),
  subrecipeId: uuid("subrecipe_id").references(() => subrecipesTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull().default("0"),
  unit: text("unit").notNull().default("ud"),
  wastePercent: numeric("waste_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  packagingCost: numeric("packaging_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  additionalCost: numeric("additional_cost", { precision: 10, scale: 4 }).notNull().default("0"),
});

// ─── Stock movements ──────────────────────────────────────────────────────────
export const stockMovementsTable = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id),
  movementType: text("movement_type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 4 }),
  reason: text("reason").notNull().default(""),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** True for simulation/demo data; safe to purge without touching real records */
  isDemo: boolean("is_demo").notNull().default(false),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type IngredientCategory = typeof ingredientCategoriesTable.$inferSelect;
export type StorageLocation = typeof storageLocationsTable.$inferSelect;
export type Ingredient = typeof ingredientsTable.$inferSelect;
export type WasteRecord = typeof wasteRecordsTable.$inferSelect;
export type Subrecipe = typeof subrecipesTable.$inferSelect;
export type SubrecipeItem = typeof subrecipeItemsTable.$inferSelect;
export type IngredientCostHistory = typeof ingredientCostHistoryTable.$inferSelect;
export type RecipeItem = typeof recipeItemsTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;

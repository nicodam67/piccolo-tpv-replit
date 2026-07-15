import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { productsTable } from "./categories";
import { employeesTable } from "./employees";
import { orderItemsTable } from "./order-items";

// ─── Ingredients ──────────────────────────────────────────────────────────────
// Represents a raw material / ingredient tracked in stock.
// unit: 'kg' | 'g' | 'l' | 'ml' | 'ud' | 'cl' (open text for flexibility)
// purchaseCost: cost per unit in €
// currentStock: amount currently in stock (same unit)
// minStock: alert threshold
// allergenTags: JSON array of allergen codes (e.g. ["gluten","lactosa"])

export const ingredientsTable = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  internalCode: text("internal_code"),
  unit: text("unit").notNull().default("ud"),
  purchaseCost: numeric("purchase_cost", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  currentStock: numeric("current_stock", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  minStock: numeric("min_stock", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  supplierName: text("supplier_name"),
  allergenTags: jsonb("allergen_tags").$type<string[]>().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Recipe items ─────────────────────────────────────────────────────────────
// One row per ingredient used in a product's recipe (escandallo).
// quantity: how much of the ingredient per serving (in the recipe's own unit)
// unit: can differ from ingredient.unit if conversion is tracked elsewhere;
//       typically matches ingredient.unit
// wastePercent: percentage waste (e.g. 10 → 10%)
// Computed cost per line = ingredient.purchaseCost * quantity * (1 + wastePercent/100)

export const recipeItemsTable = pgTable("recipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  unit: text("unit").notNull().default("ud"),
  wastePercent: numeric("waste_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
});

// ─── Stock movements ──────────────────────────────────────────────────────────
// Immutable ledger of every stock change.
// movementType: 'purchase' | 'sale' | 'adjustment' | 'waste'
// quantity: positive = stock in, negative = stock out
// unitCost: cost per unit at the time of the movement (for FIFO / average cost)

export const stockMovementsTable = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id),
  movementType: text("movement_type").notNull(), // purchase | sale | adjustment | waste
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 4 }),
  reason: text("reason").notNull().default(""),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Ingredient = typeof ingredientsTable.$inferSelect;
export type RecipeItem = typeof recipeItemsTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;

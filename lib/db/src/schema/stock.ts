import {
  boolean,
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

// ─── Ingredients ──────────────────────────────────────────────────────────────
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
  optimalStock: numeric("optimal_stock", { precision: 10, scale: 4 })
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

// ─── Sub-recipes ──────────────────────────────────────────────────────────────
// Reusable base preparations (e.g. tomato sauce, pizza dough, béchamel).
// yieldQuantity: how many portions the sub-recipe produces.
// cost: computed cache = Σ(ingredient lineCost) / yieldQuantity.

export const subrecipesTable = pgTable("subrecipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("ud"),
  yieldQuantity: numeric("yield_quantity", { precision: 10, scale: 4 })
    .notNull()
    .default("1"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  cost: numeric("cost", { precision: 10, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Sub-recipe items ─────────────────────────────────────────────────────────
// One row per ingredient inside a sub-recipe.

export const subrecipeItemsTable = pgTable("subrecipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subrecipeId: uuid("subrecipe_id")
    .notNull()
    .references(() => subrecipesTable.id, { onDelete: "cascade" }),
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

// ─── Ingredient cost history ───────────────────────────────────────────────────
// Append-only log every time an ingredient's purchaseCost changes.

export const ingredientCostHistoryTable = pgTable("ingredient_cost_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id),
  previousCost: numeric("previous_cost", { precision: 10, scale: 4 }).notNull(),
  newCost: numeric("new_cost", { precision: 10, scale: 4 }).notNull(),
  supplierName: text("supplier_name"),
  reason: text("reason"),
  employeeId: uuid("employee_id").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Recipe items ─────────────────────────────────────────────────────────────
// One row per ingredient OR sub-recipe used in a product's recipe.
// Exactly one of ingredientId / subrecipeId must be set (enforced at API level).
// formatId: when set, this line belongs to a specific product format recipe;
//           null = base product recipe.
// packagingCost: extra cost for packaging on this line (e.g. pizza box).
// additionalCost: any other direct cost not captured by the ingredient price.

export const recipeItemsTable = pgTable("recipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  formatId: uuid("format_id").references(() => productFormatsTable.id, {
    onDelete: "cascade",
  }),
  ingredientId: uuid("ingredient_id").references(() => ingredientsTable.id, {
    onDelete: "cascade",
  }),
  subrecipeId: uuid("subrecipe_id").references(() => subrecipesTable.id, {
    onDelete: "cascade",
  }),
  quantity: numeric("quantity", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  unit: text("unit").notNull().default("ud"),
  wastePercent: numeric("waste_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  packagingCost: numeric("packaging_cost", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  additionalCost: numeric("additional_cost", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
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
  orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Ingredient = typeof ingredientsTable.$inferSelect;
export type Subrecipe = typeof subrecipesTable.$inferSelect;
export type SubrecipeItem = typeof subrecipeItemsTable.$inferSelect;
export type IngredientCostHistory = typeof ingredientCostHistoryTable.$inferSelect;
export type RecipeItem = typeof recipeItemsTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;

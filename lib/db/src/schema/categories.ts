import { boolean, numeric, pgTable, text, uuid, integer } from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  prepZone: text("prep_zone").notNull(),
  active: boolean("active").notNull().default(true),
  tpvVisible: boolean("tpv_visible").notNull().default(true),
  outOfStock: boolean("out_of_stock").notNull().default(false),
  allergens: text("allergens").notNull().default(""),
  /** Applicable VAT rate for this product: 4 | 10 | 21 (Spain). Prices are VAT-inclusive. */
  taxRate: integer("tax_rate").notNull().default(10),
});

export const productFormatsTable = pgTable("product_formats", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** Overrides product taxRate when set. If null, inherits from product. */
  taxRate: integer("tax_rate"),
});

export type Category = typeof categoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;

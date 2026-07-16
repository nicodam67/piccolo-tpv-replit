import { boolean, numeric, pgTable, text, uuid, integer } from "drizzle-orm/pg-core";


export const categoriesTable = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  color: text("color"),
  icon: text("icon"),
});

export const subcategoriesTable = pgTable("subcategories", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categoriesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  subcategoryId: uuid("subcategory_id").references(() => subcategoriesTable.id),
  name: text("name").notNull(),
  internalCode: text("internal_code"),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  prepZone: text("prep_zone").notNull().default("cocina"),
  active: boolean("active").notNull().default(true),
  tpvVisible: boolean("tpv_visible").notNull().default(true),
  qrVisible: boolean("qr_visible").notNull().default(true),
  deliveryVisible: boolean("delivery_visible").notNull().default(false),
  outOfStock: boolean("out_of_stock").notNull().default(false),
  allergens: text("allergens").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Applicable VAT rate for this product: 4 | 10 | 21 (Spain). Prices are VAT-inclusive. */
  taxRate: integer("tax_rate").notNull().default(10),
  /** Optional half-portion price shown on the QR carta */
  halfPortionPrice: numeric("half_portion_price", { precision: 10, scale: 2 }),
  /** Volume or weight shown on QR carta, e.g. "330 ml", "200 g" */
  quantity: text("quantity"),
  /** Dietary tags for QR carta filters */
  isVegetariano: boolean("is_vegetariano").notNull().default(false),
  isVegano: boolean("is_vegano").notNull().default(false),
  isSinGluten: boolean("is_sin_gluten").notNull().default(false),
  isPicante: boolean("is_picante").notNull().default(false),
});

export const productFormatsTable = pgTable("product_formats", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  prepTime: integer("prep_time"),
  kdsDestination: text("kds_destination"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** Overrides product taxRate when set. If null, inherits from product. */
  taxRate: integer("tax_rate"),
});

export type Category = typeof categoriesTable.$inferSelect;
export type Subcategory = typeof subcategoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type ProductFormat = typeof productFormatsTable.$inferSelect;

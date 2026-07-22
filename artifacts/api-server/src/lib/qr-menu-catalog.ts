import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessConfigTable,
  categoriesTable,
  productFormatsTable,
  productsTable,
  subcategoriesTable,
} from "@workspace/db";

type TranslationMap = Record<string, { name?: string; description?: string }>;

export function decimalToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid monetary value");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Monetary value out of range");
  return Number(cents);
}

export function safePublicImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function localized(defaultValue: string, translations: TranslationMap | null, field: "name" | "description") {
  const values: Record<string, string> = {};
  for (const [locale, translation] of Object.entries(translations ?? {})) {
    const value = translation[field]?.trim();
    if (value && locale !== "es") values[locale] = value;
  }
  return { default: defaultValue, translations: values };
}

export async function loadQrMenuCatalogV1() {
  const [categories, business] = await Promise.all([
    db.select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      icon: categoriesTable.icon,
      color: categoriesTable.color,
      sortOrder: categoriesTable.sortOrder,
      translations: categoriesTable.translations,
    }).from(categoriesTable)
      .where(eq(categoriesTable.active, true))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name)),
    db.select({ currency: businessConfigTable.moneda }).from(businessConfigTable).limit(1),
  ]);

  const categoryIds = categories.map((category) => category.id);
  const subcategories = categoryIds.length
    ? await db.select({
        id: subcategoriesTable.id,
        categoryId: subcategoriesTable.categoryId,
        name: subcategoriesTable.name,
        sortOrder: subcategoriesTable.sortOrder,
      }).from(subcategoriesTable)
        .where(and(
          inArray(subcategoriesTable.categoryId, categoryIds),
          eq(subcategoriesTable.active, true),
        ))
        .orderBy(asc(subcategoriesTable.sortOrder), asc(subcategoriesTable.name))
    : [];

  const products = await db.select({
    id: productsTable.id,
    categoryId: productsTable.categoryId,
    subcategoryId: productsTable.subcategoryId,
    name: productsTable.name,
    description: productsTable.description,
    price: productsTable.price,
    halfPortionPrice: productsTable.halfPortionPrice,
    outOfStock: productsTable.outOfStock,
    allergens: productsTable.allergens,
    imageUrl: productsTable.imageUrl,
    isVegetariano: productsTable.isVegetariano,
    isVegano: productsTable.isVegano,
    isSinGluten: productsTable.isSinGluten,
    isPicante: productsTable.isPicante,
    sortOrder: productsTable.sortOrder,
    translations: productsTable.translations,
  }).from(productsTable)
    .where(and(eq(productsTable.active, true), eq(productsTable.qrVisible, true)))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  const productIds = products.map((product) => product.id);
  const formats = productIds.length
    ? await db.select({
        id: productFormatsTable.id,
        productId: productFormatsTable.productId,
        name: productFormatsTable.name,
        price: productFormatsTable.price,
        sortOrder: productFormatsTable.sortOrder,
      }).from(productFormatsTable)
        .where(and(
          inArray(productFormatsTable.productId, productIds),
          eq(productFormatsTable.active, true),
        ))
        .orderBy(asc(productFormatsTable.sortOrder), asc(productFormatsTable.name))
    : [];

  const currency = /^[A-Z]{3}$/.test(business[0]?.currency ?? "")
    ? business[0]!.currency
    : "EUR";
  const locales = new Set<string>(["es"]);
  const formatsByProduct = new Map<string, typeof formats>();
  for (const format of formats) {
    if (!formatsByProduct.has(format.productId)) formatsByProduct.set(format.productId, []);
    formatsByProduct.get(format.productId)!.push(format);
  }

  const productsByCategory = new Map<string, typeof products>();
  for (const product of products) {
    for (const locale of Object.keys(product.translations ?? {})) locales.add(locale);
    if (!productsByCategory.has(product.categoryId)) productsByCategory.set(product.categoryId, []);
    productsByCategory.get(product.categoryId)!.push(product);
  }
  const subcategoriesByCategory = new Map<string, typeof subcategories>();
  for (const subcategory of subcategories) {
    if (!subcategoriesByCategory.has(subcategory.categoryId)) subcategoriesByCategory.set(subcategory.categoryId, []);
    subcategoriesByCategory.get(subcategory.categoryId)!.push(subcategory);
  }

  const publicCategories = categories
    .filter((category) => (productsByCategory.get(category.id) ?? []).length > 0)
    .map((category) => {
      for (const locale of Object.keys(category.translations ?? {})) locales.add(locale);
      return {
        id: category.id,
        name: localized(category.name, category.translations, "name"),
        sortOrder: category.sortOrder,
        icon: category.icon,
        color: category.color,
        subcategories: (subcategoriesByCategory.get(category.id) ?? []).map((subcategory) => ({
          id: subcategory.id,
          categoryId: subcategory.categoryId,
          name: localized(subcategory.name, null, "name"),
          sortOrder: subcategory.sortOrder,
        })),
        products: (productsByCategory.get(category.id) ?? []).map((product) => ({
          id: product.id,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          name: localized(product.name, product.translations, "name"),
          description: localized(product.description ?? "", product.translations, "description"),
          priceCents: decimalToCents(product.price),
          halfPortionPriceCents: product.halfPortionPrice
            ? decimalToCents(product.halfPortionPrice)
            : null,
          currency,
          visible: true as const,
          outOfStock: product.outOfStock,
          tags: [
            ...(product.isVegetariano ? ["vegetarian"] : []),
            ...(product.isVegano ? ["vegan"] : []),
            ...(product.isSinGluten ? ["gluten_free"] : []),
            ...(product.isPicante ? ["spicy"] : []),
          ],
          allergens: [...new Set(product.allergens.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].sort(),
          imageUrl: safePublicImageUrl(product.imageUrl),
          updatedAt: null,
          formats: (formatsByProduct.get(product.id) ?? []).map((format) => ({
            id: format.id,
            name: format.name,
            priceCents: decimalToCents(format.price),
          })),
        })),
      };
    });

  const snapshot = {
    defaultLocale: "es" as const,
    availableLocales: [...locales].sort(),
    currency,
    categories: publicCategories,
  };
  const catalogVersion = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  return {
    contractVersion: "v1" as const,
    catalogVersion,
    generatedAt: new Date().toISOString(),
    catalogUpdatedAt: null,
    ...snapshot,
  };
}

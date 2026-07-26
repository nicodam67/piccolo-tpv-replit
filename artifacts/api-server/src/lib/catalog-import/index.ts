import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

export const IMPORT_STATUSES = ["preview_ready", "ready", "confirmed", "rejected", "failed"] as const;
export type CatalogImportStatus = typeof IMPORT_STATUSES[number];

export interface CatalogImportDraft {
  name: string;
  internalCode: string;
  category: string;
  categoryTranslations: Record<string, { name?: string; description?: string }> | null;
  price: number | null;
  cost: number | null;
  taxRate: number;
  prepZone: string;
  allergens: string[];
  description: string;
  tpvVisible: boolean;
  qrVisible: boolean;
  deliveryVisible: boolean;
  active: boolean;
  outOfStock: boolean;
  halfPortionPrice: number | null;
  quantity: string;
  isVegetariano: boolean;
  isVegano: boolean;
  isSinGluten: boolean;
  isPicante: boolean;
  imageUrl: string;
  translations: Record<string, { name?: string; description?: string }> | null;
}

export interface CatalogImportRow {
  rowIndex: number;
  draft: CatalogImportDraft;
  severity: "ok" | "warning" | "error";
  codes: string[];
  messages: string[];
  action: "create" | "update" | "skip";
  existingProductId?: string;
}

export interface CatalogImportManifest {
  sessionId: string;
  status: CatalogImportStatus;
  createdAt: string;
  expiresAt: string;
  createdById: string;
  createdByName: string;
  filename: string;
  fileHash: string;
  sourceFormat: "csv" | "xlsx" | "qr_json";
  rows: CatalogImportRow[];
  report?: {
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    createdCategories: number;
    confirmedAt: string;
  };
}

const KNOWN_ALLERGENS = new Set([
  "gluten", "crustaceos", "huevos", "pescado", "cacahuetes", "soja", "leche",
  "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces", "moluscos",
]);
const ALLERGEN_ALIASES: Record<string, string> = {
  crustaceans: "crustaceos", eggs: "huevos", fish: "pescado", peanuts: "cacahuetes",
  soy: "soja", milk: "leche", nuts: "frutos_cascara", celery: "apio",
  mustard: "mostaza", sesame: "sesamo", sulphites: "sulfitos", lupin: "altramuces",
  molluscs: "moluscos", "frutos secos": "frutos_cascara", frutos_secos: "frutos_cascara",
};

export function normalizeCatalogText(value: unknown) {
  return String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "si", "sí", "s"].includes(normalizeCatalogText(value));
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonRecord(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, { name?: string; description?: string }>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, { name?: string; description?: string }>
      : null;
  } catch {
    return null;
  }
}

function parseAllergens(value: unknown) {
  return [...new Set(String(value ?? "").split(/[,;|]/).map((entry) => {
    const normalized = normalizeCatalogText(entry).replace(/\s+/g, "_");
    return ALLERGEN_ALIASES[normalized] ?? normalized;
  }).filter(Boolean))];
}

const aliases: Record<string, string[]> = {
  name: ["nombre", "name", "producto", "item"],
  internalCode: ["codigo", "internal_code", "internalcode", "sku"],
  category: ["categoria", "category", "category_name"],
  categoryTranslations: ["categoria_traducciones", "category_translations"],
  price: ["precio", "price"],
  cost: ["coste", "cost"],
  taxRate: ["iva", "tax_rate", "taxrate"],
  prepZone: ["zona_prep", "prep_zone", "prepzone", "departamento"],
  allergens: ["alergenos", "allergens"],
  description: ["descripcion", "description"],
  tpvVisible: ["visible_tpv", "tpv_visible"],
  qrVisible: ["visible_qr", "qr_visible", "available"],
  deliveryVisible: ["visible_delivery", "delivery_visible"],
  active: ["activo", "active"],
  outOfStock: ["agotado", "out_of_stock", "outofstock"],
  halfPortionPrice: ["precio_media", "half_portion_price", "halfportionprice"],
  quantity: ["cantidad", "quantity"],
  isVegetariano: ["vegetariano", "vegetarian"],
  isVegano: ["vegano", "vegan"],
  isSinGluten: ["sin_gluten", "gluten_free"],
  isPicante: ["picante", "spicy"],
  imageUrl: ["imagen", "image_url", "imageurl"],
  translations: ["traducciones", "translations", "qr_item_translations"],
};

function valueFor(record: Record<string, unknown>, key: string) {
  const normalized = new Map(Object.entries(record).map(([header, value]) => [normalizeCatalogText(header), value]));
  for (const candidate of [normalizeCatalogText(key), ...(aliases[key] ?? [])]) {
    if (normalized.has(candidate)) return normalized.get(candidate);
  }
  return undefined;
}

export function normalizeCatalogRow(record: Record<string, unknown>): CatalogImportDraft {
  const tags = String(record["tags"] ?? "").split(/[,;|]/).map(normalizeCatalogText);
  return {
    name: String(valueFor(record, "name") ?? "").trim(),
    internalCode: String(valueFor(record, "internalCode") ?? "").trim(),
    category: String(valueFor(record, "category") ?? "").trim(),
    categoryTranslations: parseJsonRecord(valueFor(record, "categoryTranslations")),
    price: parseNumber(valueFor(record, "price")),
    cost: parseNumber(valueFor(record, "cost")),
    taxRate: parseNumber(valueFor(record, "taxRate")) ?? 10,
    prepZone: String(valueFor(record, "prepZone") ?? "cocina").trim().toLowerCase(),
    allergens: parseAllergens(valueFor(record, "allergens")),
    description: String(valueFor(record, "description") ?? "").trim(),
    tpvVisible: parseBoolean(valueFor(record, "tpvVisible"), true),
    qrVisible: parseBoolean(valueFor(record, "qrVisible"), true),
    deliveryVisible: parseBoolean(valueFor(record, "deliveryVisible"), false),
    active: parseBoolean(valueFor(record, "active"), true),
    outOfStock: parseBoolean(valueFor(record, "outOfStock"), false),
    halfPortionPrice: parseNumber(valueFor(record, "halfPortionPrice")),
    quantity: String(valueFor(record, "quantity") ?? "").trim(),
    isVegetariano: parseBoolean(valueFor(record, "isVegetariano"), tags.includes("vegetarian")),
    isVegano: parseBoolean(valueFor(record, "isVegano"), tags.includes("vegan")),
    isSinGluten: parseBoolean(valueFor(record, "isSinGluten"), tags.includes("gluten-free")),
    isPicante: parseBoolean(valueFor(record, "isPicante"), tags.includes("spicy")),
    imageUrl: String(valueFor(record, "imageUrl") ?? "").trim(),
    translations: parseJsonRecord(valueFor(record, "translations")),
  };
}

function parseCsv(content: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delimiter = (content.split(/\r?\n/, 1)[0].match(/;/g)?.length ?? 0)
    > (content.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const input = content.replace(/^\uFEFF/, "");
  for (let index = 0; index <= input.length; index++) {
    const character = input[index] ?? "\n";
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index++;
      row.push(cell); cell = "";
      if (row.some((entry) => entry.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  const headers = rows.shift()?.map((entry) => entry.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function flattenQrJson(value: unknown): Record<string, unknown>[] {
  const data = value as Record<string, any>;
  if (Array.isArray(data) && data.some((entry) => entry?.price !== undefined || entry?.precio !== undefined)) {
    return data;
  }
  const categories = Array.isArray(data) ? data : Array.isArray(data.categories) ? data.categories : [];
  const categoryNames = new Map(categories.map((category: any) => [
    String(category.id ?? category._id ?? ""),
    String(category.name ?? category.nombre ?? ""),
  ]));
  const directItems = !Array.isArray(data) && Array.isArray(data.menuItems)
    ? data.menuItems.map((item: any) => ({
      ...item,
      category: item.category ?? categoryNames.get(String(item.categoryId ?? "")) ?? "",
    }))
    : [];
  const nestedItems = categories.flatMap((category: any) =>
    (category.products ?? category.items ?? category.menuItems ?? []).map((item: any) => ({
      ...item,
      category: item.category ?? category.name ?? category.nombre ?? "",
      category_translations: category.translations ?? null,
    })));
  if (directItems.length || nestedItems.length) return [...directItems, ...nestedItems];
  if (!Array.isArray(data) && Array.isArray(data.products)) return data.products;
  throw new Error("QR_MENU_EXPORT_NOT_RECOGNIZED");
}

export async function parseCatalogFile(
  buffer: Buffer,
  filename: string,
): Promise<{ format: CatalogImportManifest["sourceFormat"]; drafts: CatalogImportDraft[] }> {
  const extension = path.extname(filename).toLowerCase();
  let records: Record<string, unknown>[];
  let format: CatalogImportManifest["sourceFormat"];
  if (extension === ".csv") {
    records = parseCsv(buffer.toString("utf8"));
    format = "csv";
  } else if (extension === ".json") {
    records = flattenQrJson(JSON.parse(buffer.toString("utf8")));
    format = "qr_json";
  } else if (extension === ".xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("EMPTY_WORKBOOK");
    const headers = (worksheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? ""));
    records = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = (row.values as unknown[]).slice(1);
      if (values.every((value) => value === null || value === undefined || value === "")) return;
      records.push(Object.fromEntries(headers.map((header, index) => [header, values[index] as unknown])));
    });
    format = "xlsx";
  } else {
    throw new Error("UNSUPPORTED_CATALOG_FILE");
  }
  if (!records.length) throw new Error("EMPTY_CATALOG_FILE");
  if (records.length > 5_000) throw new Error("CATALOG_ROW_LIMIT");
  return { format, drafts: records.map(normalizeCatalogRow) };
}

export interface CatalogValidationContext {
  categoryNames: Set<string>;
  productsByCode: Map<string, { id: string }>;
  productsByNameCategory: Map<string, { id: string }[]>;
  departmentCodes: Set<string>;
  allowOverwrite: boolean;
}

export function validateCatalogRows(
  drafts: CatalogImportDraft[],
  context: CatalogValidationContext,
): CatalogImportRow[] {
  const fileCodes = new Set<string>();
  const fileNames = new Set<string>();
  return drafts.map((draft, index) => {
    const codes: string[] = [];
    const messages: string[] = [];
    let action: CatalogImportRow["action"] = "create";
    let existingProductId: string | undefined;
    if (!draft.name) { codes.push("MISSING_NAME"); messages.push("Falta el nombre"); }
    if (!draft.category) { codes.push("MISSING_CATEGORY"); messages.push("Falta la categoría"); }
    if (draft.price === null || draft.price <= 0) { codes.push("INVALID_PRICE"); messages.push("Precio no válido"); }
    if (![4, 10, 21].includes(draft.taxRate)) { codes.push("INVALID_TAX"); messages.push("IVA debe ser 4, 10 o 21"); }
    if (!context.departmentCodes.has(draft.prepZone)) {
      codes.push("INVALID_DEPARTMENT"); messages.push(`Departamento no válido: ${draft.prepZone}`);
    }
    const unknownAllergens = draft.allergens.filter((entry) => !KNOWN_ALLERGENS.has(entry));
    if (unknownAllergens.length) {
      codes.push("INVALID_ALLERGEN"); messages.push(`Alérgenos desconocidos: ${unknownAllergens.join(", ")}`);
    }
    if (draft.imageUrl && !/^https:\/\//i.test(draft.imageUrl)) {
      codes.push("INVALID_IMAGE_URL"); messages.push("La imagen debe usar HTTPS");
    }
    const normalizedCode = normalizeCatalogText(draft.internalCode);
    const normalizedNameKey = draft.name && draft.category
      ? `${normalizeCatalogText(draft.category)}:${normalizeCatalogText(draft.name)}`
      : "";
    if (normalizedNameKey) {
      if (fileNames.has(normalizedNameKey)) {
        codes.push("DUPLICATE_NAME_IN_FILE");
        messages.push("Nombre repetido dentro de la misma categoría");
      }
      fileNames.add(normalizedNameKey);
    }
    if (normalizedCode) {
      if (fileCodes.has(normalizedCode)) {
        codes.push("DUPLICATE_CODE_IN_FILE"); messages.push(`Código duplicado en archivo: ${draft.internalCode}`);
      }
      fileCodes.add(normalizedCode);
      const existing = context.productsByCode.get(normalizedCode);
      if (existing) {
        existingProductId = existing.id;
        action = context.allowOverwrite ? "update" : "skip";
        codes.push("DUPLICATE_CODE_IN_DB");
        messages.push(context.allowOverwrite ? "Se actualizará con autorización" : "Se omitirá; ya existe");
      }
    } else if (draft.name && draft.category) {
      const matches = context.productsByNameCategory.get(normalizedNameKey) ?? [];
      if (matches.length) {
        existingProductId = matches[0].id;
        action = context.allowOverwrite ? "update" : "skip";
        codes.push("DUPLICATE_NAME_CATEGORY");
        messages.push(context.allowOverwrite ? "Se actualizará con autorización" : "Nombre duplicado; se omitirá");
      }
    }
    if (!context.categoryNames.has(normalizeCatalogText(draft.category)) && draft.category) {
      codes.push("WILL_CREATE_CATEGORY"); messages.push(`Se creará la categoría ${draft.category}`);
    }
    const hasError = codes.some((code) => [
      "MISSING_NAME", "MISSING_CATEGORY", "INVALID_PRICE", "INVALID_TAX",
      "INVALID_DEPARTMENT", "INVALID_ALLERGEN", "INVALID_IMAGE_URL", "DUPLICATE_CODE_IN_FILE",
    ].includes(code));
    return {
      rowIndex: index + 2,
      draft,
      severity: hasError ? "error" : codes.length ? "warning" : "ok",
      codes,
      messages,
      action,
      existingProductId,
    };
  });
}

function sessionPath(sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("INVALID_IMPORT_SESSION");
  const root = path.resolve(
    process.env["PICCOLO_UPLOAD_ROOT"] ?? path.join(process.cwd(), "uploads"),
    "catalog-imports",
  );
  return path.join(root, sessionId, "manifest.json");
}

export function createCatalogImportSession(
  input: Omit<CatalogImportManifest, "sessionId" | "createdAt" | "expiresAt">,
) {
  const sessionId = crypto.randomUUID();
  const createdAt = new Date();
  const manifest: CatalogImportManifest = {
    ...input,
    sessionId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 72 * 60 * 60_000).toISOString(),
  };
  writeCatalogImportSession(manifest);
  return manifest;
}

export function readCatalogImportSession(sessionId: string) {
  const manifest = JSON.parse(fs.readFileSync(sessionPath(sessionId), "utf8")) as CatalogImportManifest;
  if (new Date(manifest.expiresAt).getTime() < Date.now() && manifest.status !== "confirmed") {
    throw new Error("IMPORT_SESSION_EXPIRED");
  }
  return manifest;
}

export function writeCatalogImportSession(manifest: CatalogImportManifest) {
  const target = sessionPath(manifest.sessionId);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function catalogImportFileHash(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

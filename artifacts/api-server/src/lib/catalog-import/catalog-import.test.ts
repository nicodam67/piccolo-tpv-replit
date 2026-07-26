import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCatalogImportSession,
  parseCatalogFile,
  readCatalogImportSession,
  validateCatalogRows,
} from ".";

describe("initial catalog import", () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-import-"));
  const originalRoot = process.env.PICCOLO_UPLOAD_ROOT;

  beforeAll(() => { process.env.PICCOLO_UPLOAD_ROOT = uploadRoot; });
  afterAll(() => {
    if (originalRoot === undefined) delete process.env.PICCOLO_UPLOAD_ROOT;
    else process.env.PICCOLO_UPLOAD_ROOT = originalRoot;
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });

  it("parses semicolon CSV exported by Piccolo with QR-rich fields", async () => {
    const csv = [
      "nombre;codigo;categoria;precio;iva;zona_prep;alergenos;visible_qr;precio_media;agotado",
      "Paella;PAE-1;Arroces;18,50;10;cocina;crustaceos|moluscos;si;11,00;no",
    ].join("\n");
    const parsed = await parseCatalogFile(Buffer.from(csv), "carta.csv");
    expect(parsed.format).toBe("csv");
    expect(parsed.drafts[0]).toMatchObject({
      name: "Paella",
      internalCode: "PAE-1",
      category: "Arroces",
      price: 18.5,
      halfPortionPrice: 11,
      allergens: ["crustaceos", "moluscos"],
      qrVisible: true,
      outOfStock: false,
    });
  });

  it("parses QR Menu JSON categories, translations, tags, sold-out and images", async () => {
    const payload = {
      categories: [{
        id: "cat-1",
        name: "Entrantes",
        translations: { en: { name: "Starters" } },
        products: [{
          name: "Ensalada",
          price: 9.5,
          halfPortionPrice: 6,
          available: true,
          outOfStock: true,
          tags: ["vegetarian", "gluten-free"],
          allergens: ["milk"],
          translations: { en: { name: "Salad" } },
          imageUrl: "https://cdn.example/salad.jpg",
        }],
      }],
    };
    const parsed = await parseCatalogFile(Buffer.from(JSON.stringify(payload)), "qr-menu.json");
    expect(parsed.format).toBe("qr_json");
    expect(parsed.drafts[0]).toMatchObject({
      category: "Entrantes",
      name: "Ensalada",
      isVegetariano: true,
      isSinGluten: true,
      allergens: ["leche"],
      outOfStock: true,
      imageUrl: "https://cdn.example/salad.jpg",
    });
    expect(parsed.drafts[0].translations?.en?.name).toBe("Salad");
    expect(parsed.drafts[0].categoryTranslations?.en?.name).toBe("Starters");
  });

  it("parses XLSX and validates errors, departments, allergens and duplicates", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Productos");
    sheet.addRow(["nombre", "codigo", "categoria", "precio", "iva", "zona_prep", "alergenos"]);
    sheet.addRow(["Pizza", "PIZ-1", "Pizzas", 12, 10, "pizza", "gluten"]);
    sheet.addRow(["Pizza repetida", "PIZ-1", "Pizzas", -1, 8, "inexistente", "inventado"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseCatalogFile(buffer, "carta.xlsx");
    const rows = validateCatalogRows(parsed.drafts, {
      categoryNames: new Set(),
      productsByCode: new Map(),
      productsByNameCategory: new Map(),
      departmentCodes: new Set(["cocina", "pizza"]),
      allowOverwrite: false,
    });
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].codes).toContain("WILL_CREATE_CATEGORY");
    expect(rows[1].severity).toBe("error");
    expect(rows[1].codes).toEqual(expect.arrayContaining([
      "INVALID_PRICE", "INVALID_TAX", "INVALID_DEPARTMENT",
      "INVALID_ALLERGEN", "DUPLICATE_CODE_IN_FILE",
    ]));
  });

  it("skips existing products unless an administrator explicitly authorizes update", () => {
    const draft = {
      name: "Café", internalCode: "CAF-1", category: "Bebidas", categoryTranslations: null,
      price: 2, cost: null, taxRate: 10, prepZone: "barra", allergens: [], description: "",
      tpvVisible: true, qrVisible: true, deliveryVisible: false, active: true, outOfStock: false,
      halfPortionPrice: null, quantity: "", isVegetariano: false, isVegano: false,
      isSinGluten: false, isPicante: false, imageUrl: "", translations: null,
    };
    const base = {
      categoryNames: new Set(["bebidas"]),
      productsByCode: new Map([["caf-1", { id: "existing" }]]),
      productsByNameCategory: new Map(),
      departmentCodes: new Set(["barra"]),
    };
    expect(validateCatalogRows([draft], { ...base, allowOverwrite: false })[0]).toMatchObject({
      action: "skip",
      existingProductId: "existing",
    });
    expect(validateCatalogRows([draft], { ...base, allowOverwrite: true })[0]).toMatchObject({
      action: "update",
      existingProductId: "existing",
    });
  });

  it("persists a private preview session without touching catalog data", () => {
    const manifest = createCatalogImportSession({
      status: "ready",
      createdById: "user-1",
      createdByName: "Admin",
      filename: "carta.csv",
      fileHash: "abc",
      sourceFormat: "csv",
      rows: [],
    });
    expect(readCatalogImportSession(manifest.sessionId)).toMatchObject({
      sessionId: manifest.sessionId,
      status: "ready",
      filename: "carta.csv",
    });
    const file = path.join(uploadRoot, "catalog-imports", manifest.sessionId, "manifest.json");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

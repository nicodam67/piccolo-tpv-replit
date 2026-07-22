import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  categoriesTable,
  db,
  productsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

const enabled = process.env["RUN_DB_INTEGRATION_TESTS"] === "1";
const describeWithDatabase = enabled ? describe : describe.skip;
const TOKEN = "integration-qr-api-token-at-least-32-characters";
const CATEGORY_ID = "28000000-0000-4000-8000-000000000001";
const VISIBLE_ID = "28000000-0000-4000-8000-000000000002";
const HIDDEN_ID = "28000000-0000-4000-8000-000000000003";
const INACTIVE_ID = "28000000-0000-4000-8000-000000000004";

describeWithDatabase("QR Menu API v1 PostgreSQL integration", () => {
  beforeAll(async () => {
    process.env["PICCOLO_QR_MENU_API_TOKEN"] = TOKEN;
    await db.insert(categoriesTable).values({
      id: CATEGORY_ID,
      name: "E28 Integration",
      sortOrder: 280,
      active: true,
      translations: { en: { name: "E28 Integration" } },
    }).onConflictDoNothing();
    await db.insert(productsTable).values([
      {
        id: VISIBLE_ID,
        categoryId: CATEGORY_ID,
        name: "Visible OOS",
        description: "Integration fixture",
        price: "12.30",
        active: true,
        qrVisible: true,
        outOfStock: true,
        sortOrder: 1,
        imageUrl: "file:///etc/passwd",
      },
      {
        id: HIDDEN_ID,
        categoryId: CATEGORY_ID,
        name: "Hidden",
        price: "10.00",
        active: true,
        qrVisible: false,
        sortOrder: 2,
      },
      {
        id: INACTIVE_ID,
        categoryId: CATEGORY_ID,
        name: "Inactive",
        price: "10.00",
        active: false,
        qrVisible: true,
        sortOrder: 3,
      },
    ]).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!enabled) return;
    await db.delete(productsTable).where(inArray(productsTable.id, [
      VISIBLE_ID, HIDDEN_ID, INACTIVE_ID,
    ]));
    await db.delete(categoriesTable).where(eq(categoriesTable.id, CATEGORY_ID));
    delete process.env["PICCOLO_QR_MENU_API_TOKEN"];
  });

  it("exposes only visible active products with safe public fields", async () => {
    const res = await request(app)
      .get("/api/v1/qr-menu/catalog")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const products = res.body.categories.flatMap((category: { products: unknown[] }) => category.products);
    const visible = products.find((product: { id: string }) => product.id === VISIBLE_ID);
    expect(visible).toMatchObject({
      priceCents: 1230,
      visible: true,
      outOfStock: true,
      imageUrl: null,
      updatedAt: null,
    });
    expect(products.some((product: { id: string }) => product.id === HIDDEN_ID)).toBe(false);
    expect(products.some((product: { id: string }) => product.id === INACTIVE_ID)).toBe(false);
    expect(JSON.stringify(visible)).not.toMatch(/cost|margin|supplier|taxRate|employee|client/i);
  });
});

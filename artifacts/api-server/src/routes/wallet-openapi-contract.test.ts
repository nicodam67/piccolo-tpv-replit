import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";
import {
  db,
  crmAuditLogTable,
  crmClientsTable,
  crmGiftCardsTable,
  crmGiftCardTransactionsTable,
  crmWalletTable,
  crmWalletTransactionsTable,
  employeesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;
const employeeId = "51000000-0000-4000-8000-000000000001";
let clientId = "";
let giftCardId = "";
let giftCardCode = "";
let adminToken = "";
let waiterToken = "";

function collectWalletOperations() {
  const operations: Array<[string, string, string[], string[]]> = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation?.tags?.includes("phase51-wallet")) continue;
      operations.push([
        method,
        pathname,
        operation["x-roles"] ?? [],
        Object.keys(operation.responses).sort(),
      ]);
    }
  }
  return operations.sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
}

const operations = collectWalletOperations();

function auth(token = adminToken) {
  return { Authorization: `Bearer ${token}` };
}

function validate(pathname: string, method: string, status: number, body: unknown) {
  const operation = spec.paths[pathname][method];
  const responses = Object.fromEntries(Object.entries(operation.responses).map(([code, response]: [string, any]) => {
    if (!response?.$ref) return [code, response];
    return [code, spec.components.responses[response.$ref.split("/").at(-1)]];
  }));
  return new OpenAPIResponseValidator({ responses, components: spec.components })
    .validateResponse(status, body);
}

describe("wallet OpenAPI metadata", () => {
  it(`documents all ${operations.length} operations with auth, RBAC and real status codes`, () => {
    expect(operations.length).toBe(11);
    for (const [method, pathname, roles, statuses] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.tags).toContain("phase51-wallet");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]).toEqual(roles);
      expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
    }
  });
});

describeWithDatabase("wallet OpenAPI integration contract", () => {
  beforeAll(async () => {
    await db.insert(employeesTable).values({
      id: employeeId, name: "Wallet Contract Admin", role: "admin", active: true,
    }).onConflictDoNothing();
    const secret = process.env.SESSION_SECRET!;
    adminToken = jwt.sign({ id: employeeId, name: "Admin", role: "admin", jti: "wallet-admin" }, secret);
    waiterToken = jwt.sign({ id: employeeId, name: "Waiter", role: "waiter", jti: "wallet-waiter" }, secret);
  });

  afterAll(async () => {
    await db.delete(crmGiftCardTransactionsTable)
      .where(eq(crmGiftCardTransactionsTable.empleadoId, employeeId));
    await db.delete(crmWalletTransactionsTable)
      .where(eq(crmWalletTransactionsTable.empleadoId, employeeId));
    const employeeCards = await db.select({ id: crmGiftCardsTable.id })
      .from(crmGiftCardsTable)
      .where(eq(crmGiftCardsTable.empleadoId, employeeId));
    if (employeeCards.length) {
      const ids = employeeCards.map((card) => card.id);
      await db.delete(crmGiftCardTransactionsTable)
        .where(inArray(crmGiftCardTransactionsTable.giftCardId, ids));
      await db.delete(crmGiftCardsTable).where(inArray(crmGiftCardsTable.id, ids));
    }
    if (giftCardId) {
      await db.delete(crmGiftCardTransactionsTable)
        .where(eq(crmGiftCardTransactionsTable.giftCardId, giftCardId));
    }
    if (giftCardId) await db.delete(crmGiftCardsTable).where(eq(crmGiftCardsTable.id, giftCardId));
    if (clientId) {
      await db.delete(crmWalletTransactionsTable)
        .where(eq(crmWalletTransactionsTable.clientId, clientId));
      await db.delete(crmWalletTable).where(eq(crmWalletTable.clientId, clientId));
    }
    if (clientId) await db.delete(crmClientsTable).where(eq(crmClientsTable.id, clientId));
    await db.delete(crmAuditLogTable).where(eq(crmAuditLogTable.empleadoId, employeeId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  });

  it("validates gift card and wallet responses", async () => {
    const createdClient = await request(app).post("/api/crm/clients").set(auth()).send({
      nombre: "Wallet Contract",
      telefono: `6${Date.now().toString().slice(-8)}`,
      rgpdConsentimiento: true,
    });
    expect(createdClient.status).toBe(201);
    clientId = createdClient.body.id;

    const createdCard = await request(app).post("/api/crm/gift-cards").set(auth()).send({
      saldo: "25.00", notas: "contract test",
    });
    expect(createdCard.status).toBe(201);
    expect(validate("/crm/gift-cards", "post", 201, createdCard.body)).toBeUndefined();
    giftCardId = createdCard.body.id;
    giftCardCode = createdCard.body.codigo;

    const list = await request(app).get("/api/crm/gift-cards").set(auth());
    expect(validate("/crm/gift-cards", "get", 200, list.body)).toBeUndefined();

    const lookup = await request(app).get(`/api/crm/gift-cards/lookup?codigo=${giftCardCode}`).set(auth(waiterToken));
    expect(validate("/crm/gift-cards/lookup", "get", 200, lookup.body)).toBeUndefined();

    const detail = await request(app).get(`/api/crm/gift-cards/${giftCardId}`).set(auth());
    expect(validate("/crm/gift-cards/{id}", "get", 200, detail.body)).toBeUndefined();

    const wallet = await request(app).get(`/api/crm/clients/${clientId}/wallet`).set(auth(waiterToken));
    expect(validate("/crm/clients/{id}/wallet", "get", 200, wallet.body)).toBeUndefined();

    const addBalance = await request(app).post(`/api/crm/clients/${clientId}/wallet/add`).set(auth()).send({
      importe: "10.00", subtipo: "promo", descripcion: "contract recharge",
    });
    expect(validate("/crm/clients/{id}/wallet/add", "post", 200, addBalance.body)).toBeUndefined();
  });
});

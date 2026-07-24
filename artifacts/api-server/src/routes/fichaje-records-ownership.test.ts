import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  breaksTable,
  db,
  employeesTable,
  fichajeAuditTable,
  timeCorrectionsTable,
  timeRecordsTable,
} from "@workspace/db";
import { inArray, or } from "drizzle-orm";
import app from "../app";

const describeWithDatabase =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const employeeIds = {
  owner: "58100000-0000-4000-8000-000000000001",
  other: "58100000-0000-4000-8000-000000000002",
  admin: "58100000-0000-4000-8000-000000000003",
  manager: "58100000-0000-4000-8000-000000000004",
  encargado: "58100000-0000-4000-8000-000000000005",
  insufficient: "58100000-0000-4000-8000-000000000006",
} as const;

const recordIds = {
  owner: "58200000-0000-4000-8000-000000000001",
  other: "58200000-0000-4000-8000-000000000002",
  missing: "58200000-0000-4000-8000-000000000099",
} as const;

const breakIds = {
  owner: "58300000-0000-4000-8000-000000000001",
  other: "58300000-0000-4000-8000-000000000002",
} as const;

const orphanEmployeeId = "58100000-0000-4000-8000-000000000099";
const allEmployeeIds = Object.values(employeeIds);
const allRecordIds = [recordIds.owner, recordIds.other];

function signToken(id: string, role: string) {
  return jwt.sign(
    { id, name: `Ownership ${role}`, role },
    process.env.SESSION_SECRET!,
  );
}

function auth(id: string, role: string) {
  return { Authorization: `Bearer ${signToken(id, role)}` };
}

async function removeFixtures() {
  await db
    .delete(fichajeAuditTable)
    .where(
      or(
        inArray(fichajeAuditTable.employeeId, allEmployeeIds),
        inArray(fichajeAuditTable.performedBy, allEmployeeIds),
      ),
    );
  await db
    .delete(timeCorrectionsTable)
    .where(inArray(timeCorrectionsTable.recordId, allRecordIds));
  await db.delete(timeRecordsTable).where(inArray(timeRecordsTable.id, allRecordIds));
  await db.delete(employeesTable).where(inArray(employeesTable.id, allEmployeeIds));
}

describeWithDatabase("fichaje record and break ownership", () => {
  beforeAll(async () => {
    await removeFixtures();

    await db.insert(employeesTable).values([
      { id: employeeIds.owner, name: "Ownership Owner", role: "employee", active: true },
      { id: employeeIds.other, name: "Ownership Other", role: "employee", active: true },
      { id: employeeIds.admin, name: "Ownership Admin", role: "admin", active: true },
      { id: employeeIds.manager, name: "Ownership Manager", role: "manager", active: true },
      { id: employeeIds.encargado, name: "Ownership Encargado", role: "encargado", active: true },
      { id: employeeIds.insufficient, name: "Ownership Cashier", role: "cashier", active: true },
    ]);

    await db.insert(timeRecordsTable).values([
      {
        id: recordIds.owner,
        employeeId: employeeIds.owner,
        clockIn: new Date("2026-07-24T08:00:00.000Z"),
        clockOut: new Date("2026-07-24T16:00:00.000Z"),
        source: "manual",
        isManual: true,
        createdBy: employeeIds.admin,
      },
      {
        id: recordIds.other,
        employeeId: employeeIds.other,
        clockIn: new Date("2026-07-24T09:00:00.000Z"),
        clockOut: new Date("2026-07-24T17:00:00.000Z"),
        source: "manual",
        isManual: true,
        createdBy: employeeIds.admin,
      },
    ]);

    await db.insert(breaksTable).values([
      {
        id: breakIds.owner,
        recordId: recordIds.owner,
        breakStart: new Date("2026-07-24T12:00:00.000Z"),
        breakEnd: new Date("2026-07-24T12:30:00.000Z"),
      },
      {
        id: breakIds.other,
        recordId: recordIds.other,
        breakStart: new Date("2026-07-24T13:00:00.000Z"),
        breakEnd: new Date("2026-07-24T13:30:00.000Z"),
      },
    ]);
  });

  afterAll(removeFixtures);

  it("allows an employee to read breaks for their own record", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set(auth(employeeIds.owner, "employee"));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(breakIds.owner);
  });

  it("does not reveal another employee's record when its ID is supplied", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.other}/breaks`)
      .set(auth(employeeIds.owner, "employee"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Registro no encontrado" });
  });

  it("denies a manually substituted record ID", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set(auth(employeeIds.other, "employee"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Registro no encontrado" });
  });

  it("denies a valid session whose employee no longer exists", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set(auth(orphanEmployeeId, "admin"));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "No tienes permisos para realizar esta acción" });
  });

  it.each([
    ["admin", employeeIds.admin],
    ["manager", employeeIds.manager],
    ["encargado", employeeIds.encargado],
  ])("allows %s to read an employee's breaks", async (role, id) => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set(auth(id, role));

    expect(response.status).toBe(200);
    expect(response.body[0].id).toBe(breakIds.owner);
  });

  it("denies an insufficient role access to another employee's breaks", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set(auth(employeeIds.insufficient, "cashier"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Registro no encontrado" });
  });

  it("uses the same safe response for a missing record", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records/${recordIds.missing}/breaks`)
      .set(auth(employeeIds.owner, "employee"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Registro no encontrado" });
  });

  it("returns 401 for a missing or invalid token", async () => {
    const missing = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`);
    const invalid = await request(app)
      .get(`/api/fichaje/records/${recordIds.owner}/breaks`)
      .set({ Authorization: "Bearer invalid-token" });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("keeps record lists self-scoped when employeeId is tampered with", async () => {
    const response = await request(app)
      .get(`/api/fichaje/records?employeeId=${employeeIds.other}`)
      .set(auth(employeeIds.owner, "employee"));

    expect(response.status).toBe(200);
    expect(response.body.map((record: { id: string }) => record.id)).toContain(recordIds.owner);
    expect(response.body.map((record: { id: string }) => record.id)).not.toContain(recordIds.other);
  });

  it("keeps record corrections restricted to administrative roles", async () => {
    const denied = await request(app)
      .put(`/api/fichaje/records/${recordIds.owner}`)
      .set(auth(employeeIds.owner, "employee"))
      .send({ notes: "must not be applied" });
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .put(`/api/fichaje/records/${recordIds.owner}`)
      .set(auth(employeeIds.admin, "admin"))
      .send({ notes: "authorized correction", reason: "Ownership regression test" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.notes).toBe("authorized correction");
  });
});

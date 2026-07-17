import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { employeesTable, employeePinsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { AuthWithPinBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Rate-limit PIN login attempts: max 10 attempts per IP per 15-minute window.
// This prevents brute-forcing a 4-digit PIN space (10,000 combinations) —
// an attacker is locked out after 10 failures and must wait before retrying.
const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Inténtelo de nuevo más tarde." },
});

router.get("/employees/login-list", async (_req, res): Promise<void> => {
  // role is intentionally omitted: it is not needed by the PIN login UI and
  // disclosing it publicly would let an attacker identify and prioritise
  // admin accounts for targeted brute-force attempts.
  const employees = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
    })
    .from(employeesTable)
    .where(eq(employeesTable.active, true))
    .orderBy(employeesTable.name);

  res.json(employees);
});

router.post("/auth/pin", pinLoginLimiter, async (req, res): Promise<void> => {
  const parsed = AuthWithPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Empleado y PIN son obligatorios" });
    return;
  }

  const { employeeId, pin } = parsed.data;

  const rows = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      role: employeesTable.role,
      pinHash: employeePinsTable.pinHash,
    })
    .from(employeesTable)
    .innerJoin(employeePinsTable, eq(employeePinsTable.employeeId, employeesTable.id))
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.active, true)));

  const employee = rows[0];
  if (!employee || !(await bcrypt.compare(pin, employee.pinHash))) {
    res.status(401).json({ error: "PIN incorrecto" });
    return;
  }

  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "Configuración de servidor incompleta" });
    return;
  }

  const token = jwt.sign(
    { id: employee.id, name: employee.name, role: employee.role },
    secret,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    employee: { id: employee.id, name: employee.name, role: employee.role },
  });
});

// ── One-time bootstrap endpoint ───────────────────────────────────────────────
// Seeds the two default employees (Admin + Carmen) only when the table is
// completely empty. Safe to call multiple times — returns 409 if already seeded.
// Remove or gate behind an env flag once production data is established.
router.post("/setup/seed-employees", async (_req, res): Promise<void> => {
  const [{ value: existing }] = await db.select({ value: count() }).from(employeesTable);
  if (Number(existing) > 0) {
    res.status(409).json({ error: "Ya existen empleados. Seed no aplicado." });
    return;
  }

  // Insert Admin
  const [admin] = await db.insert(employeesTable).values({
    id: "5f78bf82-842d-4b42-b0e0-eb26c9687437",
    name: "Admin",
    role: "admin",
    active: true,
  }).returning();

  // Insert Carmen
  const [carmen] = await db.insert(employeesTable).values({
    id: "5ac8e169-90ed-4e6f-aa02-89d1cb4b19a2",
    name: "Carmen",
    role: "waiter",
    active: true,
  }).returning();

  // Insert their PIN hashes (same as dev so existing PINs work)
  await db.insert(employeePinsTable).values([
    { employeeId: admin.id, pinHash: "$2a$06$wsZ.tTKkYlDQIDlJpo31BuRKhQYyTNu9c8b5x.74iu7LERWohilcG" },
    { employeeId: carmen.id, pinHash: "$2a$06$rD9WJftFkpppIo3nrkUQ4OSvAMX33Ao9628DR4OTuWQetpEbOKGju" },
  ]);

  res.json({ seeded: [admin.name, carmen.name] });
});

export default router;

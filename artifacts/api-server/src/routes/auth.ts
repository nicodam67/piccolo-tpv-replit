import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { employeesTable, employeePinsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

export default router;

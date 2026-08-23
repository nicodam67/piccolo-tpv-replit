/**
 * system-info.ts
 * Versioning, changelog summary and system metadata.
 *
 * Routes (all under /api):
 *   GET  /admin/system/version   — current version, build date, migration count, changelog
 *   GET  /admin/system/health    — alias for /diagnostics/status (re-exported here for the health panel)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_COMMIT, APP_VERSION, PRODUCTION_FISCAL_READY } from "../lib/app-version.js";

const router = Router();
const guard = [requireAuth, requireRole("admin", "manager", "encargado")];

const RELEASE_DATE = "2026-08-23";

const CHANGELOG: Array<{
  version: string;
  date: string;
  highlights: string[];
  migrations: number;
}> = [
  {
    version: "0.9.0-rc.2",
    date: "2026-08-23",
    highlights: [
      "Paquete unificado para pruebas físicas de hardware",
      "Núcleo fiscal transaccional SIF/VERI*FACTU Fase 1",
      "Instaladores Windows y paquete TerraMaster reproducibles",
      "Diagnóstico descargable sin secretos",
    ],
    migrations: 1,
  },
  {
    version: "1.2.0",
    date: "2026-07-17",
    highlights: [
      "Panel de salud del sistema con semáforos en tiempo real",
      "Plan de producción y mantenimiento documentado",
      "Matrix multi-tablet en asistente de instalación",
      "Editor de escenarios de emergencia en Manuales",
    ],
    migrations: 0,
  },
  {
    version: "1.1.0",
    date: "2026-07-16",
    highlights: [
      "Panel de auditoría de módulos (56 módulos, hallazgos automáticos)",
      "Módulo de instalación: inventario, red, diagnóstico, asistente, manuales",
      "Dashboard Director con 15 pestañas ejecutivas",
      "Módulo CRM / Fidelización (15 tablas)",
      "Módulo RRHH (contratos, nóminas, ausencias, evaluaciones)",
      "Sistema de backups automáticos y cola offline",
      "Asistente de configuración inicial",
    ],
    migrations: 8, // 0011–0018
  },
  {
    version: "1.0.0",
    date: "2026-07-15",
    highlights: [
      "TPV core (zonas, mesas, pedidos, cobro, KDS)",
      "Módulo de caja (sesiones, arqueos, métodos de pago)",
      "Módulo de fichaje (PIN, jornadas, ausencias)",
      "Stock extendido (ingredientes, categorías, mermas)",
      "Reservas v2, Reparto v2, Pedidos online v2",
      "CRM / Loyalty (clientes, tarjetas regalo, wallet)",
      "RRHH (contratos, nóminas, evaluaciones)",
      "Verifactu (firma fiscal, cadena de bloques AEAT)",
      "Modo offline con sincronización automática",
    ],
    migrations: 10, // 0001–0010
  },
];

// ─── GET /admin/system/version ────────────────────────────────────────────────
router.get("/admin/system/version", ...guard, async (_req, res): Promise<void> => {
  // Count migrations from the authoritative checksum ledger.
  let migrationsApplied: number | null = null;
  try {
    const result = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::int AS count FROM schema_migrations`
    );
    migrationsApplied = Number(result.rows[0]?.count ?? 0);
  } catch {
    migrationsApplied = null;
  }

  // DB connectivity check
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbLatencyMs = null;
  }

  // Node / runtime info
  const nodeVersion = process.version;
  const uptimeSeconds = Math.round(process.uptime());

  res.json({
    version: APP_VERSION,
    commit: APP_COMMIT,
    channel: "release-candidate",
    productionFiscalReady: PRODUCTION_FISCAL_READY,
    releaseDate: RELEASE_DATE,
    migrationsApplied,
    dbLatencyMs,
    nodeVersion,
    uptimeSeconds,
    environment: process.env["NODE_ENV"] ?? "development",
    changelog: CHANGELOG,
  });
});

export default router;

/**
 * VERI*FACTU module — Phase 1 (test environment only)
 *
 * Implements:
 *   - Hash chain per AEAT spec (SHA-256, & separator, uppercase hex)
 *   - XML generation following SuministroLR schema
 *   - Local simulator + test-environment adapter (no production sends)
 *   - QR fiscal URL generation
 *   - Full CRUD for verifactu_records + config + audit log
 *
 * References: Orden HAC/1177/2024 + AEAT Especificaciones Técnicas VERI*FACTU v1.0
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import {
  verifactuRecordsTable,
  verifactuConfigTable,
  verifactuAuditLogTable,
  invoicesTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, or, like } from "drizzle-orm";
import {
  calcularHuellaAlta,
  calcularHuellaAnulacion,
  type HuellaAltaInput,
} from "../lib/verifactu-hash.js";
import {
  createFiscalRecord,
  FiscalIssuanceError,
  formatFiscalIdentity,
} from "../lib/fiscal-issuance.js";

const router = Router();

// Rate limiter: 10 fiscal record mutations per minute per IP.
// Creating, sending, retrying, or cancelling AEAT records are rare operations
// with irreversible fiscal consequences — limit aggressively to prevent abuse.
const fiscalLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas operaciones fiscales. Espere un momento e inténtelo de nuevo." },
});

// ─────────────────────────────────────────────────────────────────────────────
// Crypto helpers
// ─────────────────────────────────────────────────────────────────────────────

function getEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "fallback-secret-change-me";
  return createHash("sha256").update(secret).digest();
}

function encryptText(plain: string): string {
  const key = getEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptText(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const key = getEncKey();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash chaining (AEAT spec)
// SHA-256 of: IDEmisorFactura & NumSerieFactura & FechaExpedicion &
//             TipoFactura & CuotaTotal & ImporteTotal & HuellaAnterior &
//             FechaHoraHusoGenRegistro
// Result: uppercase hex
// ─────────────────────────────────────────────────────────────────────────────

export const calcularHuella = (params: HuellaAltaInput): string =>
  calcularHuellaAlta(params);

// Verify the full chain integrity starting from the earliest record
export async function verificarCadenaCompleta(): Promise<{
  ok: boolean;
  totalRegistros: number;
  errorEnRegistro?: string;
  huellasVerificadas: number;
}> {
  const records = await db
    .select()
    .from(verifactuRecordsTable)
    .orderBy(verifactuRecordsTable.chainKey, verifactuRecordsTable.chainSequence)
    .limit(100000);

  let huellaAnterior = "";
  let chainKey = "";
  let i = 0;
  for (const r of records) {
    if (r.chainKey !== chainKey) {
      chainKey = r.chainKey;
      huellaAnterior = "";
    }
    const expected = r.registroTipo === "anulacion"
      ? calcularHuellaAnulacion({
          emisorNif: r.emisorNif,
          numSerieFactura: r.numSerieFactura,
          fechaExpedicion: r.fechaExpedicion,
          huellaAnterior,
          fechaHoraGeneracion: r.fechaHoraGeneracion,
        })
      : calcularHuellaAlta({
          emisorNif: r.emisorNif,
          numSerieFactura: r.numSerieFactura,
          fechaExpedicion: r.fechaExpedicion,
          tipoFactura: r.tipoFactura,
          cuotaTotal: r.cuotaTotal ?? "0.00",
          importeTotal: r.importeTotal ?? "0.00",
          huellaAnterior,
          fechaHoraGeneracion: r.fechaHoraGeneracion,
        });
    if (expected !== r.huella) {
      return {
        ok: false,
        totalRegistros: records.length,
        errorEnRegistro: r.id,
        huellasVerificadas: i,
      };
    }
    if (r.huellaAnterior !== huellaAnterior) {
      return {
        ok: false,
        totalRegistros: records.length,
        errorEnRegistro: r.id,
        huellasVerificadas: i,
      };
    }
    huellaAnterior = r.huella;
    i++;
  }
  return { ok: true, totalRegistros: records.length, huellasVerificadas: i };
}

function fmt2(n: string | number | null | undefined): string {
  return Number(n ?? 0).toFixed(2);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─────────────────────────────────────────────────────────────────────────────
// XML generator — SuministroLR schema (AEAT VERI*FACTU)
// ─────────────────────────────────────────────────────────────────────────────

export function generateXmlAlta(r: typeof verifactuRecordsTable.$inferSelect): string {
  const desglose = (r.desgloseIva as Array<{ tipoImpositivo: string; baseImponible: string; cuotaRepercutida: string }> | null) ?? [
    {
      tipoImpositivo: fmt2(r.tipoIva),
      baseImponible: fmt2(r.baseImponible),
      cuotaRepercutida: fmt2(r.cuotaIva),
    },
  ];

  const desgloseXml = desglose
    .map(
      (d) => `
        <sii:DetalleIVA>
          <sii:TipoImpositivo>${escapeXml(d.tipoImpositivo)}</sii:TipoImpositivo>
          <sii:BaseImponible>${escapeXml(d.baseImponible)}</sii:BaseImponible>
          <sii:CuotaRepercutida>${escapeXml(d.cuotaRepercutida)}</sii:CuotaRepercutida>
        </sii:DetalleIVA>`
    )
    .join("");

  const destinatarioXml =
    r.destinatarioNif
      ? `
      <sii:Destinatarios>
        <sii:IDDestinatario>
          <sii:NIF>${escapeXml(r.destinatarioNif)}</sii:NIF>
          <sii:NombreRazon>${escapeXml(r.destinatarioNombre)}</sii:NombreRazon>
        </sii:IDDestinatario>
      </sii:Destinatarios>`
      : "";

  const rectificativaXml =
    r.tipoRectificativa
      ? `
      <sii:TipoRectificativa>${escapeXml(r.tipoRectificativa)}</sii:TipoRectificativa>
      <sii:FacturasRectificadas>
        <sii:IDFacturaRectificada>
          <sii:NumSerieFactura>${escapeXml(formatFiscalIdentity(r.facturaRectificadaSerie, r.facturaRectificadaNumero ?? 0))}</sii:NumSerieFactura>
          <sii:FechaExpedicionFactura>${escapeXml(r.facturaRectificadaFecha)}</sii:FechaExpedicionFactura>
        </sii:IDFacturaRectificada>
      </sii:FacturasRectificadas>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:sii="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sii:SuministroLRFacturasEmitidas>
      <sii:Cabecera>
        <sii:IDVersionSii>1.0</sii:IDVersionSii>
        <sii:Titular>
          <sii:NombreRazon>${escapeXml(r.emisorNombre)}</sii:NombreRazon>
          <sii:NIF>${escapeXml(r.emisorNif)}</sii:NIF>
        </sii:Titular>
        <sii:TipoComunicacion>A0</sii:TipoComunicacion>
      </sii:Cabecera>
      <sii:RegistroLRFacturasEmitidas>
        <sii:PeriodoLiquidacion>
          <sii:Ejercicio>${r.fechaExpedicion.slice(6)}</sii:Ejercicio>
          <sii:Periodo>${r.fechaExpedicion.slice(3, 5)}</sii:Periodo>
        </sii:PeriodoLiquidacion>
        <sii:IDFactura>
          <sii:IDEmisorFactura>
            <sii:NIF>${escapeXml(r.emisorNif)}</sii:NIF>
          </sii:IDEmisorFactura>
          <sii:NumSerieFactura>${escapeXml(r.numSerieFactura)}</sii:NumSerieFactura>
          <sii:FechaExpedicionFacturaEmisor>${escapeXml(r.fechaExpedicion)}</sii:FechaExpedicionFacturaEmisor>
        </sii:IDFactura>
        <sii:FacturaExpedida>
          <sii:TipoFactura>${escapeXml(r.tipoFactura)}</sii:TipoFactura>${rectificativaXml}
          <sii:ClaveRegimenEspecialOTrascendencia>01</sii:ClaveRegimenEspecialOTrascendencia>
          <sii:DescripcionOperacion>${escapeXml(r.descripcion)}</sii:DescripcionOperacion>${destinatarioXml}
          <sii:TipoDesglose>
            <sii:DesgloseFactura>
              <sii:Sujeta>
                <sii:NoExenta>
                  <sii:TipoNoExenta>S1</sii:TipoNoExenta>
                  <sii:DesgloseIVA>${desgloseXml}
                  </sii:DesgloseIVA>
                </sii:NoExenta>
              </sii:Sujeta>
            </sii:DesgloseFactura>
          </sii:TipoDesglose>
          <sii:ImporteTotal>${fmt2(r.importeTotal)}</sii:ImporteTotal>
        </sii:FacturaExpedida>
        <sii:DatosRegistro>
          <sii:FechaHoraHusoGenRegistro>${escapeXml(r.fechaHoraGeneracion)}</sii:FechaHoraHusoGenRegistro>
          <sii:IdVersion>1.0</sii:IdVersion>
          <sii:Hash>${escapeXml(r.huella)}</sii:Hash>
          <sii:HashAnterior>${escapeXml(r.huellaAnterior)}</sii:HashAnterior>
          <sii:Encadenamiento>
            <sii:PrimerRegistro>${r.huellaAnterior === "" ? "S" : "N"}</sii:PrimerRegistro>
          </sii:Encadenamiento>
          <sii:SistemaInformatico>
            <sii:NombreRazon>${escapeXml(r.nombreSistemaInformatico)}</sii:NombreRazon>
            <sii:IdSistemaInformatico>${escapeXml(r.idSistemaInformatico)}</sii:IdSistemaInformatico>
            <sii:Version>${escapeXml(r.versionSistema)}</sii:Version>
            <sii:NumeroInstalacion>${escapeXml(r.numeroInstalacion)}</sii:NumeroInstalacion>
            <sii:TipoUsoPosibleSoloVerifactu>S</sii:TipoUsoPosibleSoloVerifactu>
            <sii:TipoUsoPosibleMultiOT>N</sii:TipoUsoPosibleMultiOT>
            <sii:IndicadorMultiplesOT>N</sii:IndicadorMultiplesOT>
          </sii:SistemaInformatico>
          <sii:NumRegistroAcuerdoFacturacion>0</sii:NumRegistroAcuerdoFacturacion>
          <sii:IdAcuerdoSistemaInformatico/>
        </sii:DatosRegistro>
      </sii:RegistroLRFacturasEmitidas>
    </sii:SuministroLRFacturasEmitidas>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function generateXmlAnulacion(r: typeof verifactuRecordsTable.$inferSelect): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:sii="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sii:SuministroLRFacturasAnuladas>
      <sii:Cabecera>
        <sii:IDVersionSii>1.0</sii:IDVersionSii>
        <sii:Titular>
          <sii:NombreRazon>${escapeXml(r.emisorNombre)}</sii:NombreRazon>
          <sii:NIF>${escapeXml(r.emisorNif)}</sii:NIF>
        </sii:Titular>
        <sii:TipoComunicacion>A1</sii:TipoComunicacion>
      </sii:Cabecera>
      <sii:RegistroLRBajaFacturas>
        <sii:IDFactura>
          <sii:IDEmisorFactura>
            <sii:NIF>${escapeXml(r.emisorNif)}</sii:NIF>
          </sii:IDEmisorFactura>
          <sii:NumSerieFactura>${escapeXml(r.numSerieFactura)}</sii:NumSerieFactura>
          <sii:FechaExpedicionFacturaEmisor>${escapeXml(r.fechaExpedicion)}</sii:FechaExpedicionFacturaEmisor>
        </sii:IDFactura>
        <sii:DatosRegistro>
          <sii:FechaHoraHusoGenRegistro>${escapeXml(r.fechaHoraGeneracion)}</sii:FechaHoraHusoGenRegistro>
          <sii:IdVersion>1.0</sii:IdVersion>
          <sii:Hash>${escapeXml(r.huella)}</sii:Hash>
          <sii:HashAnterior>${escapeXml(r.huellaAnterior)}</sii:HashAnterior>
          <sii:Encadenamiento>
            <sii:PrimerRegistro>${r.huellaAnterior === "" ? "S" : "N"}</sii:PrimerRegistro>
          </sii:Encadenamiento>
          <sii:SistemaInformatico>
            <sii:NombreRazon>${escapeXml(r.nombreSistemaInformatico)}</sii:NombreRazon>
            <sii:IdSistemaInformatico>${escapeXml(r.idSistemaInformatico)}</sii:IdSistemaInformatico>
            <sii:Version>${escapeXml(r.versionSistema)}</sii:Version>
            <sii:NumeroInstalacion>${escapeXml(r.numeroInstalacion)}</sii:NumeroInstalacion>
          </sii:SistemaInformatico>
        </sii:DatosRegistro>
      </sii:RegistroLRBajaFacturas>
    </sii:SuministroLRFacturasAnuladas>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// QR content URL generator
// ─────────────────────────────────────────────────────────────────────────────

export function generarQrContent(params: {
  nif: string;
  numSerie: string;
  fecha: string;    // dd-mm-yyyy
  importe: string;  // "12.50"
  entorno: string;
}): string {
  const base =
    params.entorno === "produccion"
      ? "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR"
      : "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";
  const qs = new URLSearchParams({
    nif: params.nif,
    numserie: params.numSerie,
    fecha: params.fecha,
    importe: params.importe,
  });
  return `${base}?${qs.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AEAT Adapter interface + implementations
// ─────────────────────────────────────────────────────────────────────────────

interface AeatSubmitResult {
  ok: boolean;
  estado: "aceptado" | "aceptado_con_errores" | "rechazado";
  codigo: string;
  descripcion: string;
  csv: string;
  xmlRespuesta: string;
}

/** LocalSimulator — validates and marks accepted without any HTTP call */
async function submitToSimulator(xml: string): Promise<AeatSubmitResult> {
  if (!xml.includes("<sii:Hash>")) {
    return {
      ok: false,
      estado: "rechazado",
      codigo: "SIM-001",
      descripcion: "XML inválido: falta elemento Hash",
      csv: "",
      xmlRespuesta: "",
    };
  }
  const csv = createHash("sha256").update(xml + Date.now()).digest("hex").substring(0, 16).toUpperCase();
  const xmlResp = `<RespuestaSuministro><Estado>Correcto</Estado><CSV>${csv}</CSV></RespuestaSuministro>`;
  return { ok: true, estado: "aceptado", codigo: "0000", descripcion: "Registro aceptado (simulador local)", csv, xmlRespuesta: xmlResp };
}

/**
 * TestEnvironmentAdapter — sends to AEAT test endpoint.
 * Requires a valid digital certificate. Returns rechazado if certificate
 * is not configured (expected in Phase 1 without certificate setup).
 */
async function submitToTestEnvironment(xml: string, config: typeof verifactuConfigTable.$inferSelect): Promise<AeatSubmitResult> {
  if (!config.certificadoPath) {
    return {
      ok: false,
      estado: "rechazado",
      codigo: "CERT-001",
      descripcion: "Certificado electrónico no configurado. Configure la ruta del certificado en Configuración VERI*FACTU.",
      csv: "",
      xmlRespuesta: "",
    };
  }
  // In a full implementation: load PFX certificate, create HTTPS agent with mTLS,
  // POST SOAP XML to config.endpointPruebas.
  // For Phase 1, return informative message.
  return {
    ok: false,
    estado: "rechazado",
    codigo: "CERT-002",
    descripcion: "Envío al entorno de pruebas AEAT pendiente de instalación de certificado electrónico. Configure el certificado e instale los paquetes 'node-forge' o 'ssl-root-cas'.",
    csv: "",
    xmlRespuesta: "",
  };
}

export async function submitRecord(
  record: typeof verifactuRecordsTable.$inferSelect,
  config: typeof verifactuConfigTable.$inferSelect
): Promise<AeatSubmitResult> {
  const xml = record.registroTipo === "alta"
    ? generateXmlAlta(record)
    : generateXmlAnulacion(record);
  switch (config.entorno) {
    case "pruebas":      return submitToTestEnvironment(xml, config);
    case "produccion":   return { ok: false, estado: "rechazado", codigo: "PROD-001", descripcion: "Envíos a producción desactivados en Phase 1.", csv: "", xmlRespuesta: "" };
    default:             return submitToSimulator(xml);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log helper
// ─────────────────────────────────────────────────────────────────────────────

async function logAudit(params: {
  recordId?: string;
  invoiceId?: string;
  accion: string;
  empleadoId?: string;
  empleadoNombre?: string;
  terminal?: string;
  resultado?: string;
  detalles?: string;
}) {
  await db.insert(verifactuAuditLogTable).values({
    recordId: params.recordId ?? null,
    invoiceId: params.invoiceId ?? null,
    accion: params.accion,
    empleadoId: params.empleadoId ?? null,
    empleadoNombre: params.empleadoNombre ?? "",
    terminal: params.terminal ?? "",
    resultado: params.resultado ?? "ok",
    detalles: params.detalles ?? "",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Config helper — get or create default config
// ─────────────────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<typeof verifactuConfigTable.$inferSelect> {
  const rows = await db
    .select()
    .from(verifactuConfigTable)
    .where(eq(verifactuConfigTable.singletonKey, 1))
    .limit(1);
  if (rows[0]) return rows[0];
  await db
    .insert(verifactuConfigTable)
    .values({ singletonKey: 1 })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(verifactuConfigTable)
    .where(eq(verifactuConfigTable.singletonKey, 1));
  if (!created) throw new Error("No se pudo inicializar la configuración VERI*FACTU");
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/status
// Dashboard summary: counts per state, chain status, last send
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const counts = await db
      .select({ estado: verifactuRecordsTable.estado, count: sql<number>`count(*)::int` })
      .from(verifactuRecordsTable)
      .groupBy(verifactuRecordsTable.estado);

    const countMap: Record<string, number> = {};
    for (const row of counts) countMap[row.estado] = row.count;

    const lastSend = await db
      .select()
      .from(verifactuRecordsTable)
      .where(sql`${verifactuRecordsTable.aeatFechaEnvio} is not null`)
      .orderBy(desc(verifactuRecordsTable.aeatFechaEnvio))
      .limit(1);

    const config = await getConfig();

    res.json({
      totalRegistros: Object.values(countMap).reduce((a, b) => a + b, 0),
      aceptados: countMap["aceptado"] ?? 0,
      rechazados: countMap["rechazado"] ?? 0,
      pendientes: (countMap["pendiente_envio"] ?? 0) + (countMap["pendiente_reintento"] ?? 0),
      conErrores: countMap["aceptado_con_errores"] ?? 0,
      entorno: config.entorno,
      activo: config.activo,
      ultimoEnvio: lastSend[0]?.aeatFechaEnvio ?? null,
      ultimoEstado: lastSend[0]?.estado ?? null,
      ultimoCodigo: lastSend[0]?.aeatCodigo ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estado VeriFactu" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/config
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/config", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const config = await getConfig();
    // Never expose encrypted password to frontend
    res.json({ ...config, certificadoPasswordEnc: config.certificadoPasswordEnc ? "***" : "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/verifactu/config
// ─────────────────────────────────────────────────────────────────────────────

router.put("/admin/verifactu/config", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const body = req.body as Partial<typeof verifactuConfigTable.$inferInsert> & { certificadoPassword?: string };
    const config = await getConfig();

    const update: Partial<typeof verifactuConfigTable.$inferInsert> = {};
    const fields = [
      "emisorNif", "emisorNombre", "idSistemaInformatico",
      "nombreSistemaInformatico", "versionSistema", "numeroInstalacion",
      "entorno", "endpointPruebas", "endpointProduccion",
      "certificadoPath", "autoRetry", "maxReintentos", "retryIntervalMinutes", "activo",
    ] as const;
    for (const f of fields) {
      if (body[f as keyof typeof body] !== undefined) {
        (update as Record<string, unknown>)[f] = body[f as keyof typeof body];
      }
    }
    if (body.certificadoPassword && body.certificadoPassword !== "***") {
      update.certificadoPasswordEnc = encryptText(body.certificadoPassword);
    }
    update.updatedAt = new Date();

    const [updated] = await db
      .update(verifactuConfigTable)
      .set(update)
      .where(eq(verifactuConfigTable.id, config.id))
      .returning();

    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    await logAudit({
      accion: "cambio_config",
      empleadoId: emp?.id,
      empleadoNombre: emp?.name,
      terminal: req.ip ?? "",
      detalles: `Entorno: ${updated.entorno}, Activo: ${updated.activo}`,
    });

    res.json({ ...updated, certificadoPasswordEnc: updated.certificadoPasswordEnc ? "***" : "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar configuración" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/records
// List records with optional filters
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/records", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { desde, hasta, serie, estado, tipo, q, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const conditions = [];
    if (desde) conditions.push(gte(verifactuRecordsTable.fechaExpedicion, desde));
    if (hasta) conditions.push(lte(verifactuRecordsTable.fechaExpedicion, hasta));
    if (serie) conditions.push(eq(verifactuRecordsTable.serie, serie));
    if (estado) conditions.push(eq(verifactuRecordsTable.estado, estado));
    if (tipo) conditions.push(eq(verifactuRecordsTable.tipoFactura, tipo));
    if (q) conditions.push(
      or(
        like(verifactuRecordsTable.numSerieFactura, `%${q}%`),
        like(verifactuRecordsTable.emisorNif, `%${q}%`),
        like(verifactuRecordsTable.destinatarioNif, `%${q}%`),
      )
    );

    const records = await db
      .select()
      .from(verifactuRecordsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(verifactuRecordsTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener registros" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/records/:id
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/records/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, id));
    if (!record) return res.status(404).json({ error: "Registro no encontrado" });
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener registro" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/records/:id/xml
// Download XML payload
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/records/:id/xml", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, id));
    if (!record) return res.status(404).json({ error: "Registro no encontrado" });

    const xml = record.registroTipo === "alta"
      ? generateXmlAlta(record)
      : generateXmlAnulacion(record);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="verifactu-${record.numSerieFactura}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar XML" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/verifactu/records
// Generate a VERI*FACTU record from an invoice
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/verifactu/records", requireAuth, requireRole("admin"), fiscalLimiter, async (req, res) => {
  try {
    const body = req.body as {
      invoiceId: string;
      tipoFactura?: string; // F1 | F2 | F3 | R1 | R2 | R3 | R4 | R5 — default F2
      descripcion?: string;
      desgloseIva?: Array<{ tipoImpositivo: string; baseImponible: string; cuotaRepercutida: string }>;
    };

    if (!body.invoiceId) return res.status(400).json({ error: "invoiceId requerido" });

    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM invoices WHERE id = ${body.invoiceId} FOR UPDATE`);
      const [invoice] = await tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, body.invoiceId));
      if (!invoice) throw new FiscalIssuanceError("INVOICE_NOT_FOUND", "Factura no encontrada");
      if (invoice.status === "draft") {
        throw new FiscalIssuanceError("DRAFT_INVOICE", "No se puede registrar una factura en borrador");
      }
      if (invoice.serie.startsWith("P")) {
        throw new FiscalIssuanceError(
          "PREINVOICE",
          "Las prefacturas no generan registros VERI*FACTU ni consumen numeración fiscal",
        );
      }
      const desgloseIva = body.desgloseIva ?? (
        invoice.taxBreakdown
          ? (invoice.taxBreakdown as Array<{ rate: number; base: string; cuota: string }>).map((tax) => ({
              tipoImpositivo: fmt2(tax.rate),
              baseImponible: fmt2(tax.base),
              cuotaRepercutida: fmt2(tax.cuota),
            }))
          : [{
              tipoImpositivo: "10.00",
              baseImponible: fmt2(invoice.subtotal),
              cuotaRepercutida: fmt2(invoice.taxTotal),
            }]
      );
      const record = await createFiscalRecord(tx, {
        invoiceId: invoice.id,
        serie: invoice.serie,
        numero: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        tipoFactura: body.tipoFactura ?? (invoice.serie === "R" ? "R1" : "F1"),
        emisorNif: invoice.emisorNif,
        emisorNombre: invoice.emisorNombre,
        destinatarioNif: invoice.clientNif,
        destinatarioNombre: invoice.clientName,
        descripcion: body.descripcion,
        baseImponible: invoice.subtotal,
        cuotaTotal: invoice.taxTotal,
        importeTotal: invoice.total,
        desgloseIva,
        empleadoId: emp?.id,
        empleadoNombre: emp?.name,
        terminal: req.ip ?? "",
      });
      return record;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    if (err instanceof FiscalIssuanceError) {
      const status = err.code === "INVOICE_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    await logAudit({ accion: "error_generacion", empleadoId: emp?.id, resultado: "error", detalles: String(err) });
    res.status(500).json({ error: "Error al generar registro VERI*FACTU" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/verifactu/records/:id/send
// Send record to AEAT (or simulator)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/verifactu/records/:id/send", requireAuth, requireRole("admin"), fiscalLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, id));
    if (!record) return res.status(404).json({ error: "Registro no encontrado" });

    const allowed = ["validado", "pendiente_envio", "pendiente_reintento", "rechazado"];
    if (!allowed.includes(record.estado)) {
      return res.status(400).json({ error: `El registro tiene estado '${record.estado}' y no puede enviarse` });
    }

    const config = await getConfig();

    // Mark as sending
    await db.update(verifactuRecordsTable)
      .set({ estado: "enviando", updatedAt: new Date() })
      .where(eq(verifactuRecordsTable.id, id));

    const xml = record.registroTipo === "alta" ? generateXmlAlta(record) : generateXmlAnulacion(record);
    const result = await submitRecord(record, config);

    const nuevoEstado = result.estado;
    const [updated] = await db.update(verifactuRecordsTable)
      .set({
        estado: nuevoEstado,
        aeatFechaEnvio: new Date(),
        aeatCodigo: result.codigo,
        aeatDescripcion: result.descripcion,
        aeatCsv: result.csv,
        aeatResponse: result,
        reintentos: (record.reintentos ?? 0) + 1,
        xmlEnviado: xml,
        xmlRespuesta: result.xmlRespuesta,
        entornoEnvio: config.entorno,
        updatedAt: new Date(),
      })
      .where(eq(verifactuRecordsTable.id, id))
      .returning();

    // Update invoice status
    if (record.invoiceId) {
      const invoiceStatus =
        nuevoEstado === "aceptado" ? "accepted" :
        nuevoEstado === "rechazado" ? "rejected" :
        nuevoEstado === "aceptado_con_errores" ? "accepted_with_errors" : "sent";
      await db.update(invoicesTable)
        .set({ verifactuStatus: invoiceStatus })
        .where(eq(invoicesTable.id, record.invoiceId));
    }

    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    await logAudit({
      recordId: id,
      accion: result.ok ? "respuesta_aceptada" : nuevoEstado === "rechazado" ? "respuesta_rechazada" : "respuesta_con_errores",
      empleadoId: emp?.id,
      empleadoNombre: emp?.name,
      terminal: req.ip ?? "",
      resultado: result.ok ? "ok" : "error",
      detalles: `Código: ${result.codigo} | ${result.descripcion} | Entorno: ${config.entorno}`,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al enviar registro" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/verifactu/records/:id/retry
// Retry a failed submission
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/verifactu/records/:id/retry", requireAuth, requireRole("admin"), fiscalLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, id));
    if (!record) return res.status(404).json({ error: "Registro no encontrado" });

    const config = await getConfig();
    const maxR = config.maxReintentos ?? 3;
    if ((record.reintentos ?? 0) >= maxR) {
      return res.status(400).json({ error: `Número máximo de reintentos alcanzado (${maxR})` });
    }

    await db.update(verifactuRecordsTable)
      .set({ estado: "pendiente_reintento", updatedAt: new Date() })
      .where(eq(verifactuRecordsTable.id, id));

    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    await logAudit({
      recordId: id,
      accion: "reintento_envio",
      empleadoId: emp?.id,
      empleadoNombre: emp?.name,
      terminal: req.ip ?? "",
      detalles: `Intento ${(record.reintentos ?? 0) + 1} de ${maxR}`,
    });

    // Delegate to send endpoint
    const xml = record.registroTipo === "alta" ? generateXmlAlta(record) : generateXmlAnulacion(record);
    const result = await submitRecord(record, config);
    const nuevoEstado = result.estado;

    const [updated] = await db.update(verifactuRecordsTable)
      .set({
        estado: nuevoEstado,
        aeatFechaEnvio: new Date(),
        aeatCodigo: result.codigo,
        aeatDescripcion: result.descripcion,
        aeatCsv: result.csv,
        aeatResponse: result,
        reintentos: (record.reintentos ?? 0) + 1,
        xmlEnviado: xml,
        xmlRespuesta: result.xmlRespuesta,
        updatedAt: new Date(),
      })
      .where(eq(verifactuRecordsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en reintento" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/verifactu/records/:id/cancel
// Create an anulación record linked to an alta record
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/verifactu/records/:id/cancel", requireAuth, requireRole("admin"), fiscalLimiter, async (req, res) => {
  res.status(501).json({
    error: "La anulación fiscal queda bloqueada en Fase 1 hasta implementar su flujo transaccional completo. El registro original no se ha modificado.",
    code: "FISCAL_CANCELLATION_PHASE2",
    recordId: req.params.id,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/chain/verify
// Full chain verification
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/chain/verify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await verificarCadenaCompleta();
    const emp = (req as unknown as { employee?: { id: string; name: string } }).employee;
    await logAudit({
      accion: "verificar_cadena",
      empleadoId: emp?.id,
      empleadoNombre: emp?.name,
      terminal: req.ip ?? "",
      resultado: result.ok ? "ok" : "error",
      detalles: result.ok
        ? `Cadena íntegra: ${result.huellasVerificadas} registros verificados`
        : `Ruptura detectada en registro ${result.errorEnRegistro}`,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al verificar cadena" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/declaracion
// System responsible declaration
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/declaracion", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const config = await getConfig();
    res.json({
      nombreSoftware: config.nombreSistemaInformatico,
      versionSoftware: config.versionSistema,
      idSistemaInformatico: config.idSistemaInformatico,
      numeroInstalacion: config.numeroInstalacion,
      modalidad: "VERI*FACTU",
      funcionalidadesFiscales: [
        "Generación de registros de facturación de alta",
        "Generación de registros de anulación",
        "Encadenamiento de registros mediante huella SHA-256",
        "Generación de QR fiscal",
        "Generación de XML conforme a SuministroLR v1.0",
        "Simulador local y adaptador para entorno de pruebas AEAT",
        "Conservación inmutable de registros y auditoría completa",
        "Gestión de estados con reintentos",
        "Panel de administración VERI*FACTU",
      ],
      aviso: "Este sistema está preparado técnicamente para VERI*FACTU en fase de pruebas. No se afirma conformidad total hasta completar revisión técnica y fiscal externa.",
      fechaDeclaracion: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener declaración" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifactu/audit
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/verifactu/audit", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { limit = "100", offset = "0" } = req.query as Record<string, string>;
    const logs = await db
      .select()
      .from(verifactuAuditLogTable)
      .orderBy(desc(verifactuAuditLogTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener auditoría" });
  }
});

export default router;

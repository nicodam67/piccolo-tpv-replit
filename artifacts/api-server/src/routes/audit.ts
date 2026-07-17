/**
 * Audit module — Panel de diagnóstico y clasificación de módulos
 *
 * GET  /api/admin/audit/modules          — Module catalog with current status
 * GET  /api/admin/audit/findings         — All findings (filterable)
 * POST /api/admin/audit/findings         — Manually add a finding
 * POST /api/admin/audit/run              — Execute automated audit checks
 * PATCH /api/admin/audit/findings/:id/resolve — Mark a finding resolved
 * GET  /api/admin/audit/report           — Downloadable report (JSON or Markdown)
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditFindingsTable, auditRunsTable } from "@workspace/db";
import { eq, desc, isNull, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Module catalog ───────────────────────────────────────────────────────────
// Static classification of every module. Status reflects backend reality.
// Statuses: 'ok' | 'warning' | 'partial' | 'critical' | 'simulated'

export type ModuleStatus = "ok" | "warning" | "partial" | "critical" | "simulated";

interface ModuleDef {
  id: string;
  name: string;
  area: string;
  description: string;
  baseStatus: ModuleStatus;
  knownIssues: string[];
  /** How status is determined dynamically */
  dynamicCheck?: string;
}

const MODULE_CATALOG: ModuleDef[] = [
  // ── Auth & Users ─────────────────────────────────────────────────────────────
  {
    id: "auth",
    name: "Autenticación y sesiones",
    area: "Seguridad",
    description: "Login por PIN/contraseña con JWT. Roles: admin, manager, waiter, cashier.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "roles",
    name: "Control de roles y permisos",
    area: "Seguridad",
    description: "Middleware requireRole aplicado en rutas admin. Sin tabla de permisos granulares.",
    baseStatus: "warning",
    knownIssues: ["No hay permisos granulares por acción — un rol tiene acceso total a su nivel. Sin auditoría de accesos denegados."],
  },
  {
    id: "employees",
    name: "Empleados y PINs",
    area: "RRHH",
    description: "CRUD de empleados con PIN para fichaje y login.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "hr",
    name: "Gestión de personal (HR)",
    area: "RRHH",
    description: "Contratos, nóminas, documentos, vacaciones, incidencias. 7 pestañas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "fichaje",
    name: "Control horario (Fichaje)",
    area: "RRHH",
    description: "Reloj biométrico / PIN, registros, turnos, ausencias, importación Anviz, informes.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Floor plan & Orders ───────────────────────────────────────────────────────
  {
    id: "floor_plan",
    name: "Plano de mesas y zonas",
    area: "TPV",
    description: "Zonas, mesas, canvas de disposición, estados de mesa en tiempo real.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "orders",
    name: "Pedidos y comandas",
    area: "TPV",
    description: "Ciclo de vida completo: open → sent → ready → bill_requested → paid/completed.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "modifiers",
    name: "Modificadores de producto",
    area: "TPV",
    description: "Grupos de modificadores vinculados a productos con precio diferencial.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "splits",
    name: "División de cuenta (Splits)",
    area: "TPV",
    description: "División por ítems o por importe entre varios pagadores.",
    baseStatus: "warning",
    knownIssues: ["El flujo de split no tiene cobertura de pruebas automatizadas. Verificar manualmente antes del go-live."],
  },
  {
    id: "kds",
    name: "KDS — Pantalla de cocina",
    area: "Producción",
    description: "5 partidas: cocina, pizza, ensalada, barra, expedición/pase.",
    baseStatus: "warning",
    knownIssues: [
      "Máquina de estados única para todas las partidas — Pizza no tiene estado 'En horno', Barra no diferencia 'Preparando'/'Listo'.",
      "Sin reconexión automática del servidor WebSocket — KDS debe recargarse manualmente tras desconexión.",
      "prepZone en productos usa valores que no coinciden con constantes KDS (frío, postres, sala → sin ruta KDS válida).",
    ],
  },
  // ── Billing & Payments ────────────────────────────────────────────────────────
  {
    id: "payments",
    name: "Cobros y métodos de pago",
    area: "Facturación",
    description: "Efectivo, tarjeta, Bizum, PayPal, voucher. Registro en BD con audit trail.",
    baseStatus: "warning",
    knownIssues: [
      "POST /orders/:id/payments no tiene clave de idempotencia — doble clic o reintento puede crear dos registros de pago.",
      "No hay bloqueo de concurrencia al cobrar — dos cajas pueden procesar el mismo pedido simultáneamente.",
    ],
  },
  {
    id: "cash",
    name: "Caja — Apertura y cierre",
    area: "Facturación",
    description: "Sesiones de caja, movimientos, informes X/Z, arqueo.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "prefactura",
    name: "Prefactura (cuenta provisional)",
    area: "Facturación",
    description: "Impresión de cuenta sin cerrar pedido. Audit trail si se modifica tras imprimir.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "tickets",
    name: "Tickets simplificados",
    area: "Facturación",
    description: "Ticket sin datos fiscales del cliente para consumidores finales.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "invoices",
    name: "Facturas completas",
    area: "Facturación",
    description: "Facturas con datos fiscales, serie, numeración correlativa, XML.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "credit_notes",
    name: "Facturas rectificativas",
    area: "Facturación",
    description: "Notas de crédito / abono sobre facturas emitidas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "iva",
    name: "Tipos de IVA",
    area: "Facturación",
    description: "IVA configurable por producto (4% / 10% / 21%). Desglose multi-tipo en facturas.",
    baseStatus: "warning",
    knownIssues: [
      "IVA se hereda del producto en el momento de añadir el ítem, pero no existe validación de que todos los productos tengan un tipo asignado — productos sin taxRate usan el defecto 10% silenciosamente.",
    ],
  },
  {
    id: "verifactu",
    name: "VERI*FACTU",
    area: "Facturación",
    description: "Cadena de hash SHA-256 conforme AEAT. XML SuministroLR. QR fiscal.",
    baseStatus: "warning",
    knownIssues: [
      "Los registros verifactu_records se crean con estado 'pendiente_envio' en el momento del cobro, pero no existe ningún proceso en segundo plano que los envíe a la AEAT. Deben enviarse manualmente desde el panel.",
      "El envío al entorno de pruebas AEAT requiere certificado electrónico mTLS aún no configurado.",
    ],
  },
  {
    id: "verifactu_aeat",
    name: "VERI*FACTU — Envío real AEAT",
    area: "Facturación",
    description: "Comunicación HTTP con los servidores AEAT (producción y pruebas).",
    baseStatus: "simulated",
    knownIssues: [
      "Producción bloqueada explícitamente en el código (código PROD-001). Envíos simulados localmente.",
      "Entorno de pruebas requiere certificado PFX instalado (código CERT-002). Sin certificado, todos los envíos son simulados.",
    ],
  },
  // ── Products & Catalog ────────────────────────────────────────────────────────
  {
    id: "products",
    name: "Productos y carta",
    area: "Catálogo",
    description: "CRUD de productos, formatos, precios, IVA, imágenes, escandallos.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "categories",
    name: "Categorías",
    area: "Catálogo",
    description: "Grupos y secciones de la carta con orden, color e imagen.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "qr_menu",
    name: "Carta QR pública",
    area: "Catálogo",
    description: "Menú digital público accesible via QR, con branding y filtros de alérgenos.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "allergens",
    name: "Alérgenos y seguridad alimentaria",
    area: "Catálogo",
    description: "14 alérgenos reglamentarios, notas por mesa, fichas técnicas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Online Orders ─────────────────────────────────────────────────────────────
  {
    id: "online_orders",
    name: "Pedidos online (v1 + v2)",
    area: "Online",
    description: "Módulo de pedidos take-away / delivery con carta pública y gestión de estado.",
    baseStatus: "partial",
    knownIssues: [
      "Coexistencia de dos versiones registradas simultáneamente: online-orders.ts (v1) y online-orders-v2.ts (v2). Comparten las mismas tablas DB pero tienen rutas públicas distintas. El cliente QR usa v2 (POST /public/orders/online-v2) pero la inbox y los webhooks están en v1. Esto crea confusión y posibles inconsistencias.",
      "Los números de pedido usan Math.random() — pueden colisionar. v2 tiene idempotency_key pero v1 no.",
      "Las notificaciones al cliente son simuladas (tabla notification_log, simulated: true). No se envían SMS/email reales.",
    ],
  },
  {
    id: "takeaway",
    name: "Recogida en local (Take-away)",
    area: "Online",
    description: "Pedidos online con recogida en el establecimiento.",
    baseStatus: "partial",
    knownIssues: ["Funcional solo si online-orders-v2 está configurado. Sin integración con sistema de tickets de espera."],
  },
  {
    id: "delivery",
    name: "Reparto a domicilio (Delivery)",
    area: "Online",
    description: "Zonas de reparto, repartidores, seguimiento de estado, estimación de entrega.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "stripe",
    name: "Pago online (Stripe)",
    area: "Online",
    description: "Payment intents de Stripe para pedidos online. Webhook de confirmación.",
    baseStatus: "simulated",
    knownIssues: [
      "Sin STRIPE_SECRET_KEY configurada, todos los pagos usan un simulador interno (proveedor 'simulator'). Funcional para pruebas pero no cobra dinero real.",
    ],
  },
  {
    id: "table_sessions",
    name: "Sesiones de mesa (QR dine-in)",
    area: "Online",
    description: "Clientes escanean QR de mesa y piden desde su móvil.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Stock & Kitchen ───────────────────────────────────────────────────────────
  {
    id: "stock_deduction",
    name: "Descuento de stock automático",
    area: "Stock",
    description: "Al enviar comanda, consume ingredientes según receta. Al anular, los restaura.",
    baseStatus: "warning",
    knownIssues: [
      "El descuento de stock en POST /orders/:id/send es fire-and-forget: si la transacción de stock falla, el pedido continúa y el fallo se registra solo en logs. No hay alerta al usuario ni reintento.",
    ],
  },
  {
    id: "stock",
    name: "Stock e inventario",
    area: "Stock",
    description: "Ingredientes, movimientos de stock, alertas de mínimos, mermas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "recipes",
    name: "Escandallos y recetas",
    area: "Stock",
    description: "Recetas por producto/formato, coste teórico, margen, food cost.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "subrecipes",
    name: "Subrecetas / elaboraciones base",
    area: "Stock",
    description: "Elaboraciones reutilizables en múltiples recetas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "inventory_count",
    name: "Inventario físico",
    area: "Stock",
    description: "Formulario de recuento manual con generación automática de movimientos de ajuste.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "waste",
    name: "Mermas",
    area: "Stock",
    description: "Registro de mermas con motivo, coste y movimiento de stock negativo.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Purchasing ────────────────────────────────────────────────────────────────
  {
    id: "suppliers",
    name: "Proveedores",
    area: "Compras",
    description: "Fichas de proveedores, catálogos, comparación de precios.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "purchase_orders",
    name: "Pedidos de compra",
    area: "Compras",
    description: "Ciclo: borrador → aprobado → enviado → recibido → facturado.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "goods_receipts",
    name: "Recepción de mercancía",
    area: "Compras",
    description: "Albaranes, actualización de stock, coste medio, lotes.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "supplier_invoices",
    name: "Facturas de proveedor",
    area: "Compras",
    description: "Registro, pagos, vencimientos, conciliación con pedidos y albaranes.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "traceability",
    name: "Trazabilidad de lotes",
    area: "Compras",
    description: "Búsqueda y traza completa de lotes. Retirada de lotes (recall).",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── CRM & Loyalty ─────────────────────────────────────────────────────────────
  {
    id: "crm",
    name: "CRM — Gestión de clientes",
    area: "CRM",
    description: "Ficha de cliente, historial de visitas, segmentación, RGPD.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "loyalty",
    name: "Programa de fidelización",
    area: "CRM",
    description: "Puntos, niveles, tarjetas de fidelización, beneficios por tier.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "promotions",
    name: "Promociones y descuentos",
    area: "CRM",
    description: "Descuentos por código, porcentaje, importe fijo, producto gratis.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "gift_cards",
    name: "Tarjetas regalo",
    area: "CRM",
    description: "Emisión, activación, descuento y control de saldo de tarjetas regalo.",
    baseStatus: "warning",
    knownIssues: [
      "Sin generación de código único garantizada por constraint de BD — dos emisiones simultáneas pueden producir el mismo código si la colisión ocurre antes del INSERT.",
    ],
  },
  // ── Reservations & Waiting ────────────────────────────────────────────────────
  {
    id: "reservations",
    name: "Reservas",
    area: "Sala",
    description: "Agenda de reservas con confirmación, recordatorios y gestión de disponibilidad.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "waiting_list",
    name: "Lista de espera",
    area: "Sala",
    description: "Cola de espera para clientes sin reserva.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Self-checkout & Printers ──────────────────────────────────────────────────
  {
    id: "self_checkout",
    name: "Caja automática (autocobro)",
    area: "Hardware",
    description: "Integración con terminal de autocobro. Configuración IP, modelo, estado.",
    baseStatus: "simulated",
    knownIssues: [
      "La caja automática está configurada en BD y pantalla de admin pero no hay integración de hardware real implementada. El botón de cobro llama al simulador local.",
    ],
  },
  {
    id: "printers",
    name: "Impresoras térmicas",
    area: "Hardware",
    description: "CRUD de impresoras, worker de cola, 3 reintentos, impresora fallback.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "print_routing",
    name: "Enrutamiento de impresión",
    area: "Hardware",
    description: "Reglas de enrutamiento por categoría/producto a impresora específica.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "devices",
    name: "Dispositivos registrados",
    area: "Hardware",
    description: "Registro de tablets y ordenador principal. Sync offline.",
    baseStatus: "warning",
    knownIssues: [
      "La tabla offline_devices solo almacena nombre, fingerprint y estado de sincronización — sin IP, MAC, zona asignada, impresora por defecto ni permiso de cobro por dispositivo.",
    ],
  },
  // ── Reports & Analytics ───────────────────────────────────────────────────────
  {
    id: "reports",
    name: "Informes de ventas",
    area: "Informes",
    description: "Resúmenes diarios/mensuales, tickets, facturación por período.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "profitability",
    name: "Rentabilidad",
    area: "Informes",
    description: "Margen bruto, food cost, alertas de coste, comparativas.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "director",
    name: "Panel de dirección",
    area: "Informes",
    description: "KPIs globales, presupuesto vs real, evolución de márgenes.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Backups & Offline ─────────────────────────────────────────────────────────
  {
    id: "backups",
    name: "Copias de seguridad",
    area: "Sistema",
    description: "Backup manual y programado. Descarga de SQL. Verificación de integridad.",
    baseStatus: "ok",
    knownIssues: [],
  },
  {
    id: "offline",
    name: "Modo offline",
    area: "Sistema",
    description: "Cola de operaciones offline con sincronización al reconectar.",
    baseStatus: "warning",
    knownIssues: [
      "El modo offline sincroniza operaciones pero no hay garantía de orden estricto si la cola se acumula durante una desconexión larga.",
    ],
  },
  // ── Setup ─────────────────────────────────────────────────────────────────────
  {
    id: "setup_wizard",
    name: "Asistente de configuración",
    area: "Sistema",
    description: "16 pasos guiados para configurar el TPV desde cero. Go-live con checklist.",
    baseStatus: "ok",
    knownIssues: [],
  },
  // ── Branding ──────────────────────────────────────────────────────────────────
  {
    id: "branding",
    name: "Branding y carta QR",
    area: "Marketing",
    description: "Imagen de hero, colores, horarios, descripción del restaurante.",
    baseStatus: "ok",
    knownIssues: [],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusToLabel(status: ModuleStatus): string {
  return {
    ok: "🟢 Funcional",
    warning: "🟡 Funcional con incidencias",
    partial: "🟠 Parcialmente funcional",
    critical: "🔴 No usar en producción",
    simulated: "⚫ Simulado / Sin conectar",
  }[status];
}

function statusWeight(status: ModuleStatus): number {
  return { ok: 0, warning: 1, partial: 2, critical: 3, simulated: 2 }[status];
}

/** Run automated DB-side checks and return dynamic findings */
async function runDynamicChecks(runId: string): Promise<Array<{
  module: string;
  severity: string;
  title: string;
  description: string;
}>> {
  const findings: Array<{ module: string; severity: string; title: string; description: string }> = [];

  // Check 1 — VeriFactu pending records with no background processor
  try {
    const pendingVf = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM verifactu_records WHERE estado IN ('pendiente_envio','pendiente_reintento')`
    );
    const cnt = (pendingVf.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (cnt > 0) {
      findings.push({
        module: "verifactu",
        severity: "warning",
        title: `${cnt} registro(s) VeriFactu en cola sin procesador activo`,
        description: `Hay ${cnt} registro(s) con estado pendiente_envio/pendiente_reintento. No existe ningún worker en segundo plano que los envíe a la AEAT — deben enviarse manualmente desde el panel de VeriFactu o iniciar el worker tras obtener el certificado.`,
      });
    }
  } catch { /* table may not exist yet */ }

  // Check 2 — Online orders v1/v2 both have records (duplication in use)
  try {
    const v2Check = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM orders WHERE channel = 'qr' AND table_session_id IS NOT NULL LIMIT 1`
    );
    const v2cnt = (v2Check.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (v2cnt > 0) {
      findings.push({
        module: "online_orders",
        severity: "warning",
        title: "Pedidos online registrados en ambas versiones del módulo",
        description: "Se detectan registros creados por la ruta v2 (table_session_id IS NOT NULL) coexistiendo con pedidos del flujo v1. Las dos versiones comparten la tabla orders pero tienen rutas públicas y lógica distintas. Conviene unificar o retirar v1.",
      });
    }
  } catch { /* ignore */ }

  // Check 3 — Products without taxRate set (default 10% silent fallback)
  try {
    const noTax = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM products WHERE tax_rate IS NULL AND active = true`
    );
    const cnt = (noTax.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (cnt > 0) {
      findings.push({
        module: "iva",
        severity: "warning",
        title: `${cnt} producto(s) activo(s) sin tipo de IVA explícito`,
        description: `${cnt} producto(s) activos tienen tax_rate NULL y usarán el defecto del 10% sin que el admin lo haya configurado expresamente. Revisar en el panel de Productos → columna IVA.`,
      });
    }
  } catch { /* ignore */ }

  // Check 4 — No business config (setup not started)
  try {
    const cfg = await db.execute(sql`SELECT count(*)::int AS cnt FROM business_config`);
    const cnt = (cfg.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (cnt === 0) {
      findings.push({
        module: "setup_wizard",
        severity: "critical",
        title: "Configuración de negocio no inicializada",
        description: "La tabla business_config está vacía. El asistente de configuración no se ha completado. Muchas funciones del TPV dependen de esta configuración.",
      });
    }
  } catch { /* ignore */ }

  // Check 5 — No printers configured
  try {
    const printers = await db.execute(sql`SELECT count(*)::int AS cnt FROM printers WHERE active = true`);
    const cnt = (printers.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (cnt === 0) {
      findings.push({
        module: "printers",
        severity: "warning",
        title: "Sin impresoras activas configuradas",
        description: "No hay ninguna impresora activa en el sistema. Los tickets, facturas y comandas no se imprimirán hasta que se configure al menos una impresora.",
      });
    }
  } catch { /* ignore */ }

  // Check 6 — No employees (admin) exist
  try {
    const emps = await db.execute(sql`SELECT count(*)::int AS cnt FROM employees WHERE role = 'admin' AND active = true`);
    const cnt = (emps.rows[0] as Record<string, unknown>)?.cnt as number ?? 0;
    if (cnt === 0) {
      findings.push({
        module: "auth",
        severity: "critical",
        title: "Sin ningún administrador activo",
        description: "No existe ningún empleado con rol 'admin' activo. El sistema no puede administrarse correctamente.",
      });
    }
  } catch { /* ignore */ }

  // Check 7 — Duplicate route detection (static knowledge)
  findings.push({
    module: "online_orders",
    severity: "warning",
    title: "Duplicación detectada: online-orders v1 y v2 registrados simultáneamente",
    description: "El router principal registra tanto online-orders.ts (v1: POST /public/orders/online) como online-orders-v2.ts (v2: POST /public/orders/online-v2). Ambos usan la misma tabla 'orders'. La v1 debería retirarse o marcarse como legacy una vez v2 esté estabilizada.",
  });

  return findings;
}

// ─── GET /api/admin/audit/modules ────────────────────────────────────────────

router.get("/admin/audit/modules", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  // Fetch unresolved findings to overlay onto the catalog
  const activeFindings = await db
    .select()
    .from(auditFindingsTable)
    .where(isNull(auditFindingsTable.resolvedAt));

  const findingsByModule = new Map<string, typeof activeFindings>();
  for (const f of activeFindings) {
    if (!findingsByModule.has(f.module)) findingsByModule.set(f.module, []);
    findingsByModule.get(f.module)!.push(f);
  }

  const modules = MODULE_CATALOG.map((m) => {
    const findings = findingsByModule.get(m.id) ?? [];
    // Effective status = worst of baseStatus and any active findings
    let effectiveStatus: ModuleStatus = m.baseStatus;
    for (const f of findings) {
      const fSev = f.severity as ModuleStatus;
      if (statusWeight(fSev) > statusWeight(effectiveStatus)) effectiveStatus = fSev;
    }

    return {
      id: m.id,
      name: m.name,
      area: m.area,
      description: m.description,
      baseStatus: m.baseStatus,
      effectiveStatus,
      statusLabel: statusToLabel(effectiveStatus),
      knownIssues: m.knownIssues,
      activeFindings: findings.length,
      findings: findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        title: f.title,
        description: f.description,
        detectedAt: f.detectedAt,
      })),
    };
  });

  // Summary counts
  const counts = { ok: 0, warning: 0, partial: 0, critical: 0, simulated: 0 };
  for (const m of modules) counts[m.effectiveStatus as ModuleStatus]++;
  const total = modules.length;
  const readyPct = Math.round(((counts.ok + counts.warning) / total) * 100);

  res.json({
    modules,
    summary: { total, ...counts, readyPct },
  });
});

// ─── GET /api/admin/audit/findings ───────────────────────────────────────────

router.get("/admin/audit/findings", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { module: modFilter, severity: sevFilter, resolved } = req.query as Record<string, string | undefined>;

  let findings = await db
    .select()
    .from(auditFindingsTable)
    .orderBy(desc(auditFindingsTable.detectedAt));

  if (modFilter) findings = findings.filter((f) => f.module === modFilter);
  if (sevFilter) findings = findings.filter((f) => f.severity === sevFilter);
  if (resolved === "false") findings = findings.filter((f) => f.resolvedAt == null);
  if (resolved === "true") findings = findings.filter((f) => f.resolvedAt != null);

  res.json(findings);
});

// ─── POST /api/admin/audit/findings ──────────────────────────────────────────

router.post("/admin/audit/findings", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { module, severity = "warning", title, description = "" } = req.body as {
    module: string;
    severity?: string;
    title: string;
    description?: string;
  };

  if (!module || !title) {
    res.status(400).json({ error: "module y title son obligatorios" });
    return;
  }

  const [finding] = await db
    .insert(auditFindingsTable)
    .values({ module, severity, title, description, automated: false })
    .returning();

  res.status(201).json(finding);
});

// ─── PATCH /api/admin/audit/findings/:id/resolve ─────────────────────────────

router.patch("/admin/audit/findings/:id/resolve", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const resolvedBy = (req.user?.name ?? "admin");

  const [updated] = await db
    .update(auditFindingsTable)
    .set({ resolvedAt: new Date(), resolvedBy, updatedAt: new Date() })
    .where(eq(auditFindingsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Finding no encontrado" }); return; }
  res.json(updated);
});

// ─── POST /api/admin/audit/run ───────────────────────────────────────────────

router.post("/admin/audit/run", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const startMs = Date.now();
  const runId = `run-${new Date().toISOString()}`;
  const triggeredBy = req.user?.name ?? "admin";

  // 1. Archive findings from previous runs of the same type (keep manual ones)
  await db
    .update(auditFindingsTable)
    .set({ resolvedAt: new Date(), resolvedBy: "audit-runner (superseded)", updatedAt: new Date() })
    .where(
      sql`${auditFindingsTable.automated} = true AND ${auditFindingsTable.resolvedAt} IS NULL`
    );

  // 2. Run dynamic checks
  const dynamicFindings = await runDynamicChecks(runId);

  // 3. Also capture all known static issues from MODULE_CATALOG
  const staticFindings: typeof dynamicFindings = [];
  for (const m of MODULE_CATALOG) {
    for (const issue of m.knownIssues) {
      staticFindings.push({
        module: m.id,
        severity: m.baseStatus === "critical" ? "critical"
          : m.baseStatus === "partial" ? "partial"
          : m.baseStatus === "simulated" ? "simulated"
          : "warning",
        title: issue.slice(0, 120),
        description: issue,
      });
    }
  }

  const allFindings = [...staticFindings, ...dynamicFindings];

  // 4. Insert all findings
  let inserted = 0;
  if (allFindings.length > 0) {
    const rows = await db
      .insert(auditFindingsTable)
      .values(allFindings.map((f) => ({ ...f, runId, automated: true })))
      .returning();
    inserted = rows.length;
  }

  const durationMs = Date.now() - startMs;

  // 5. Log the run
  const critCount = allFindings.filter((f) => f.severity === "critical").length;
  const warnCount = allFindings.filter((f) => f.severity === "warning").length;

  await db.insert(auditRunsTable).values({
    runId,
    triggeredBy,
    modulesChecked: MODULE_CATALOG.length,
    findingsCount: inserted,
    criticalCount: critCount,
    warningCount: warnCount,
    durationMs,
    summary: {
      staticIssues: staticFindings.length,
      dynamicIssues: dynamicFindings.length,
    },
  }).onConflictDoNothing();

  res.json({
    runId,
    modulesChecked: MODULE_CATALOG.length,
    findingsInserted: inserted,
    criticalCount: critCount,
    warningCount: warnCount,
    durationMs,
  });
});

// ─── GET /api/admin/audit/report ─────────────────────────────────────────────

router.get("/admin/audit/report", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const accept = req.headers["accept"] ?? "";
  const wantsMarkdown = accept.includes("text/markdown") || req.query.format === "md";

  // Build current module statuses
  const activeFindings = await db
    .select()
    .from(auditFindingsTable)
    .where(isNull(auditFindingsTable.resolvedAt));

  const findingsByModule = new Map<string, typeof activeFindings>();
  for (const f of activeFindings) {
    if (!findingsByModule.has(f.module)) findingsByModule.set(f.module, []);
    findingsByModule.get(f.module)!.push(f);
  }

  const moduleSummary = MODULE_CATALOG.map((m) => {
    const findings = findingsByModule.get(m.id) ?? [];
    let effectiveStatus: ModuleStatus = m.baseStatus;
    for (const f of findings) {
      const fSev = f.severity as ModuleStatus;
      if (statusWeight(fSev) > statusWeight(effectiveStatus)) effectiveStatus = fSev;
    }
    return { ...m, effectiveStatus, findingsCount: findings.length };
  });

  const counts = { ok: 0, warning: 0, partial: 0, critical: 0, simulated: 0 };
  for (const m of moduleSummary) counts[m.effectiveStatus as ModuleStatus]++;
  const blockers = moduleSummary.filter((m) => m.effectiveStatus === "critical" || m.effectiveStatus === "partial");

  if (!wantsMarkdown) {
    res.json({
      generatedAt: new Date().toISOString(),
      totalModules: MODULE_CATALOG.length,
      summary: counts,
      blockers: blockers.map((b) => ({ id: b.id, name: b.name, status: b.effectiveStatus, issues: b.knownIssues })),
      modules: moduleSummary,
      activeFindings: activeFindings.map((f) => ({
        id: f.id,
        module: f.module,
        severity: f.severity,
        title: f.title,
        description: f.description,
        detectedAt: f.detectedAt,
      })),
    });
    return;
  }

  // ── Markdown report ────────────────────────────────────────────────────────
  const now = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const emoji: Record<string, string> = {
    ok: "🟢", warning: "🟡", partial: "🟠", critical: "🔴", simulated: "⚫",
  };

  const lines: string[] = [
    `# Informe de estado del sistema — Piccolo TPV`,
    `**Generado:** ${now}`,
    ``,
    `## Resumen ejecutivo`,
    ``,
    `| Estado | Módulos |`,
    `|--------|---------|`,
    `| 🟢 Funcional | ${counts.ok} |`,
    `| 🟡 Con incidencias | ${counts.warning} |`,
    `| 🟠 Parcialmente funcional | ${counts.partial} |`,
    `| 🔴 No usar en producción | ${counts.critical} |`,
    `| ⚫ Simulado / Sin conectar | ${counts.simulated} |`,
    `| **Total** | **${MODULE_CATALOG.length}** |`,
    ``,
    `**Preparación para go-live:** ${Math.round(((counts.ok + counts.warning) / MODULE_CATALOG.length) * 100)}%`,
    ``,
  ];

  if (blockers.length > 0) {
    lines.push(`## ⚠️ Bloqueantes antes del go-live`, ``);
    for (const b of blockers) {
      lines.push(`### ${emoji[b.effectiveStatus]} ${b.name} (\`${b.id}\`)`);
      for (const issue of b.knownIssues) lines.push(`- ${issue}`);
      lines.push(``);
    }
  }

  lines.push(`## Tabla de módulos`, ``);
  lines.push(`| Área | Módulo | Estado | Incidencias activas |`);
  lines.push(`|------|--------|--------|---------------------|`);
  for (const m of moduleSummary) {
    lines.push(`| ${m.area} | ${m.name} | ${emoji[m.effectiveStatus]} ${m.effectiveStatus} | ${m.findingsCount} |`);
  }

  lines.push(``, `## Duplicaciones detectadas`, ``);
  lines.push(`- **Online Orders v1 + v2**: Ambas versiones registradas en el router principal. Comparten la tabla \`orders\`.`);
  lines.push(`- **generateOrderNumber()**: Implementado dos veces (online-orders.ts y online-orders-v2.ts) con lógica idéntica (Math.random).`);

  if (activeFindings.length > 0) {
    lines.push(``, `## Hallazgos activos (${activeFindings.length})`, ``);
    for (const f of activeFindings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`**Módulo:** \`${f.module}\` · **Detectado:** ${f.detectedAt}`);
      if (f.description) lines.push(``, f.description);
      lines.push(``);
    }
  }

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="piccolo-audit-${Date.now()}.md"`);
  res.send(lines.join("\n"));
});

// ─── GET /api/admin/audit/runs ───────────────────────────────────────────────

router.get("/admin/audit/runs", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const runs = await db
    .select()
    .from(auditRunsTable)
    .orderBy(desc(auditRunsTable.createdAt))
    .limit(20);
  res.json(runs);
});

export default router;

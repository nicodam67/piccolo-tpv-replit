/**
 * Granular role-permission overrides
 * Allows admins to grant or deny specific (module, action) pairs per role,
 * supplementing the blanket requireRole() middleware with fine-grained control.
 *
 * Routes:
 *   GET    /admin/permissions/catalog       — list all modules+actions the system knows
 *   GET    /admin/permissions               — list current overrides
 *   PUT    /admin/permissions               — upsert an override { role, module, action, allowed }
 *   DELETE /admin/permissions/:id           — remove an override (revert to default)
 */
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, rolePermissionsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// ─── Permission catalog — all known modules and actions ───────────────────────
export const PERMISSION_CATALOG: {
  module: string;
  label: string;
  actions: { action: string; label: string; defaultRoles: string[] }[];
}[] = [
  {
    module: "orders",
    label: "Pedidos",
    actions: [
      { action: "create",               label: "Crear pedidos",                    defaultRoles: ["admin","manager","encargado","waiter"] },
      { action: "edit",                 label: "Editar pedidos abiertos",          defaultRoles: ["admin","manager","encargado","waiter"] },
      { action: "cancel",               label: "Cancelar pedidos",                 defaultRoles: ["admin","manager","encargado"] },
      { action: "apply_discount",       label: "Aplicar descuentos",               defaultRoles: ["admin","manager","encargado"] },
      { action: "modify_after_print",   label: "Modificar tras imprimir prefactura", defaultRoles: ["admin","manager"] },
      { action: "view_all_zones",       label: "Ver pedidos de todas las zonas",   defaultRoles: ["admin","manager","encargado"] },
    ],
  },
  {
    module: "payments",
    label: "Cobros",
    actions: [
      { action: "create",               label: "Procesar cobros",                  defaultRoles: ["admin","manager","encargado","waiter","cashier"] },
      { action: "refund",               label: "Emitir devoluciones",              defaultRoles: ["admin","manager"] },
      { action: "void",                 label: "Anular tickets",                   defaultRoles: ["admin","manager"] },
      { action: "split",                label: "Dividir cuenta",                   defaultRoles: ["admin","manager","encargado","cashier"] },
    ],
  },
  {
    module: "caja",
    label: "Caja",
    actions: [
      { action: "open",                 label: "Abrir caja",                       defaultRoles: ["admin","manager","encargado","cashier"] },
      { action: "close",                label: "Cerrar caja",                      defaultRoles: ["admin","manager","encargado"] },
      { action: "reopen",               label: "Reabrir caja cerrada",             defaultRoles: ["admin","manager"] },
      { action: "view_summary",         label: "Ver resumen de caja",              defaultRoles: ["admin","manager","encargado"] },
    ],
  },
  {
    module: "products",
    label: "Productos",
    actions: [
      { action: "create",               label: "Crear productos",                  defaultRoles: ["admin","manager"] },
      { action: "edit",                 label: "Editar productos",                 defaultRoles: ["admin","manager"] },
      { action: "delete",               label: "Eliminar productos",               defaultRoles: ["admin"] },
      { action: "import_export",        label: "Importar / exportar catálogo",     defaultRoles: ["admin","manager"] },
    ],
  },
  {
    module: "stock",
    label: "Inventario",
    actions: [
      { action: "view",                 label: "Ver niveles de stock",             defaultRoles: ["admin","manager","encargado"] },
      { action: "adjust",               label: "Ajustar stock manualmente",        defaultRoles: ["admin","manager"] },
      { action: "receive",              label: "Registrar recepciones de mercancía", defaultRoles: ["admin","manager","encargado"] },
    ],
  },
  {
    module: "reservations",
    label: "Reservas",
    actions: [
      { action: "create",               label: "Crear reservas",                   defaultRoles: ["admin","manager","encargado","waiter"] },
      { action: "edit",                 label: "Editar reservas",                  defaultRoles: ["admin","manager","encargado","waiter"] },
      { action: "cancel",               label: "Cancelar reservas",                defaultRoles: ["admin","manager","encargado"] },
      { action: "noshow",               label: "Marcar no presentados",            defaultRoles: ["admin","manager","encargado"] },
    ],
  },
  {
    module: "employees",
    label: "Empleados",
    actions: [
      { action: "view",                 label: "Ver listado de empleados",         defaultRoles: ["admin","manager","encargado"] },
      { action: "create",               label: "Crear empleados",                  defaultRoles: ["admin","manager"] },
      { action: "edit",                 label: "Editar empleados",                 defaultRoles: ["admin","manager"] },
      { action: "delete",               label: "Eliminar empleados",               defaultRoles: ["admin"] },
    ],
  },
  {
    module: "reports",
    label: "Informes",
    actions: [
      { action: "view",                 label: "Ver informes",                     defaultRoles: ["admin","manager","encargado"] },
      { action: "export",               label: "Exportar informes",                defaultRoles: ["admin","manager"] },
    ],
  },
  {
    module: "config",
    label: "Configuración",
    actions: [
      { action: "edit_business",        label: "Editar datos del negocio",         defaultRoles: ["admin"] },
      { action: "edit_printers",        label: "Gestionar impresoras",             defaultRoles: ["admin","manager"] },
      { action: "edit_zones_tables",    label: "Gestionar zonas y mesas",          defaultRoles: ["admin","manager"] },
      { action: "force_close_unpaid",   label: "Cerrar mesa sin cobrar",            defaultRoles: ["admin","manager"] },
      { action: "manage_roles",         label: "Gestionar permisos de roles",      defaultRoles: ["admin"] },
    ],
  },
];

const ROLES = ["admin", "manager", "encargado", "waiter", "cashier"] as const;

// ─── GET /admin/permissions/catalog ──────────────────────────────────────────
router.get("/admin/permissions/catalog", requireAuth, requireRole("admin", "manager"), (_req, res) => {
  res.json({ catalog: PERMISSION_CATALOG, roles: ROLES });
});

// ─── GET /admin/permissions ───────────────────────────────────────────────────
router.get("/admin/permissions", requireAuth, requireRole("admin", "manager"), async (_req, res) => {
  try {
    const overrides = await db.select().from(rolePermissionsTable);
    res.json({ overrides });
  } catch (err) {
    console.error("[role-permissions] GET /admin/permissions failed:", err);
    res.status(500).json({ error: "No se pudieron cargar los permisos. Inténtalo de nuevo." });
  }
});

// ─── PUT /admin/permissions ───────────────────────────────────────────────────
router.put("/admin/permissions", requireAuth, requireRole("admin"), async (req, res) => {
  const { role, module: mod, action, allowed } = req.body as {
    role: string; module: string; action: string; allowed: boolean;
  };
  if (!role || !mod || !action || typeof allowed !== "boolean") {
    res.status(400).json({ error: "Faltan campos: role, module, action, allowed" }); return;
  }
  if (!ROLES.includes(role as typeof ROLES[number])) {
    res.status(400).json({ error: `Rol desconocido: ${role}` }); return;
  }

  try {
    const [row] = await db
      .insert(rolePermissionsTable)
      .values({ role, module: mod, action, allowed, updatedBy: req.user!.id })
      .onConflictDoUpdate({
        target: [rolePermissionsTable.role, rolePermissionsTable.module, rolePermissionsTable.action],
        set: { allowed, updatedBy: req.user!.id, updatedAt: new Date() },
      })
      .returning();
    res.json({ permission: row });
  } catch (err) {
    console.error("[role-permissions] PUT /admin/permissions failed:", err);
    res.status(500).json({ error: "No se pudo guardar el permiso. Inténtalo de nuevo." });
  }
});

// ─── DELETE /admin/permissions/:id ───────────────────────────────────────────
router.delete("/admin/permissions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const [deleted] = await db
      .delete(rolePermissionsTable)
      .where(eq(rolePermissionsTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Permiso no encontrado" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[role-permissions] DELETE /admin/permissions/:id failed:", err);
    res.status(500).json({ error: "No se pudo eliminar el permiso. Inténtalo de nuevo." });
  }
});

// ─── Utility: check granular permission (for use in other routes) ─────────────
/**
 * checkPermission(role, module, action) → true if allowed (default or override).
 * If no override exists, falls back to the catalog's defaultRoles list.
 * Use this in routes that need fine-grained control beyond requireRole().
 */
export async function checkPermission(role: string, mod: string, action: string): Promise<boolean> {
  // Check for an explicit override first
  const [override] = await db
    .select()
    .from(rolePermissionsTable)
    .where(
      and(
        eq(rolePermissionsTable.role, role),
        eq(rolePermissionsTable.module, mod),
        eq(rolePermissionsTable.action, action),
      ),
    );
  if (override) return override.allowed;

  // Fall back to catalog defaults
  const catalog = PERMISSION_CATALOG.find((c) => c.module === mod);
  if (!catalog) return role === "admin"; // unknown module: only admin
  const act = catalog.actions.find((a) => a.action === action);
  if (!act) return role === "admin";
  return act.defaultRoles.includes(role);
}

export default router;

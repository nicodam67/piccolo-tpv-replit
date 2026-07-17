/**
 * admin-permisos.tsx
 * Role permission matrix — read-only view of what each role can do.
 * Driven by the MATRIX constant below, which MUST reflect the actual
 * requireRole() guards in the backend route files.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ShieldCheck, CheckCircle2, XCircle, ArrowLeft, Info, Lock,
  AlertCircle, Users, CreditCard, ClipboardList, Package, BarChart2,
  Printer, Wifi, Settings, ShoppingCart, FileText, Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'admin' | 'manager' | 'encargado' | 'camarero' | 'caja' | 'cocina' | 'repartidor';
type Access = 'yes' | 'no' | 'own'; // own = only their own data

interface PermissionRow {
  action: string;
  desc?: string;
  admin: Access;
  manager: Access;
  encargado: Access;
  camarero: Access;
  caja: Access;
  cocina: Access;
  repartidor: Access;
}

interface PermissionGroup {
  id: string;
  label: string;
  icon: typeof ShieldCheck;
  color: string;
  rows: PermissionRow[];
}

// ─── Permission matrix ────────────────────────────────────────────────────────
// This must match the requireRole() guards in artifacts/api-server/src/routes/*

const ROLES: { id: Role; label: string; color: string }[] = [
  { id: 'admin',      label: 'Admin',      color: '#f472b6' },
  { id: 'manager',    label: 'Manager',    color: '#818cf8' },
  { id: 'encargado',  label: 'Encargado',  color: '#60a5fa' },
  { id: 'camarero',   label: 'Camarero',   color: '#34d399' },
  { id: 'caja',       label: 'Caja',       color: '#fbbf24' },
  { id: 'cocina',     label: 'Cocina',     color: '#fb923c' },
  { id: 'repartidor', label: 'Repartidor', color: '#a78bfa' },
];

const MATRIX: PermissionGroup[] = [
  // ── Pedidos / Comandas ──────────────────────────────────────────────────
  {
    id: 'orders', label: 'Pedidos', icon: ClipboardList, color: 'text-blue-400',
    rows: [
      { action: 'Ver pedidos propios de mesa',    admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'yes', repartidor: 'no' },
      { action: 'Ver todos los pedidos',          admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'yes', cocina: 'yes', repartidor: 'no' },
      { action: 'Crear pedido / abrir mesa',      admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no',  repartidor: 'no' },
      { action: 'Añadir artículos al pedido',     admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no',  repartidor: 'no' },
      { action: 'Enviar comanda a cocina',        admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no',  repartidor: 'no' },
      { action: 'Cancelar artículos / pedido',   admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no',  repartidor: 'no' },
      { action: 'Cambiar estado KDS',            admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'yes', repartidor: 'no' },
    ],
  },
  // ── Pagos ───────────────────────────────────────────────────────────────
  {
    id: 'payments', label: 'Pagos y caja', icon: CreditCard, color: 'text-emerald-400',
    rows: [
      { action: 'Cobrar (efectivo, tarjeta, mixto)', admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Aplicar descuento a pedido',       admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Emitir invitación (coste 0)',       admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
      { action: 'Ver sesiones de caja',             admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Abrir / cerrar sesión de caja',    admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Ver informe Z (cierre)',            admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Reembolso / rectificativa',        admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
      { action: 'Pago con tarjeta regalo',          admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Pago con puntos de fidelidad',     admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no', repartidor: 'no' },
    ],
  },
  // ── Carta ───────────────────────────────────────────────────────────────
  {
    id: 'catalog', label: 'Carta y productos', icon: Star, color: 'text-amber-400',
    rows: [
      { action: 'Ver la carta',              admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'yes', repartidor: 'yes' },
      { action: 'Crear / editar productos',  admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Eliminar productos',        admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Marcar agotado',            admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'yes', repartidor: 'no' },
      { action: 'Gestionar categorías',      admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Configurar IVA por producto', admin: 'yes', manager: 'yes', encargado: 'no', camarero: 'no', caja: 'no',  cocina: 'no',  repartidor: 'no' },
    ],
  },
  // ── Empleados ───────────────────────────────────────────────────────────
  {
    id: 'employees', label: 'Empleados y RRHH', icon: Users, color: 'text-violet-400',
    rows: [
      { action: 'Ver lista de empleados activos',  admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Ver datos económicos (salario)', admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Crear empleado',                admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Editar empleado',               admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Desactivar empleado',           admin: 'yes', manager: 'no',  encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Cambiar PIN propio',            admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'yes', repartidor: 'yes', desc: 'Via admin panel only' },
      { action: 'Ver fichajes propios',          admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'own', caja: 'own', cocina: 'own', repartidor: 'own' },
      { action: 'Ver todos los fichajes',        admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Corregir fichajes',             admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Planificar turnos',             admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
    ],
  },
  // ── Stock e inventario ──────────────────────────────────────────────────
  {
    id: 'stock', label: 'Inventario y stock', icon: Package, color: 'text-orange-400',
    rows: [
      { action: 'Ver stock de ingredientes',    admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'yes', repartidor: 'no' },
      { action: 'Registrar entrada de stock',   admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Registrar merma',              admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'yes', repartidor: 'no' },
      { action: 'Ajuste de inventario físico',  admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Gestionar proveedores',        admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
      { action: 'Crear pedido de compra',       admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no',  repartidor: 'no' },
    ],
  },
  // ── CRM ─────────────────────────────────────────────────────────────────
  {
    id: 'crm', label: 'CRM y fidelización', icon: ShoppingCart, color: 'text-pink-400',
    rows: [
      { action: 'Ver clientes',                      admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Crear cliente',                     admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no', repartidor: 'no' },
      { action: 'Editar cliente (datos, RGPD)',      admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
      { action: 'Crear tarjeta regalo',              admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
      { action: 'Gestionar promociones',             admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
      { action: 'Ver informes de CRM',               admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no',  caja: 'no',  cocina: 'no', repartidor: 'no' },
    ],
  },
  // ── VeriFactu ───────────────────────────────────────────────────────────
  {
    id: 'verifactu', label: 'VERI*FACTU', icon: FileText, color: 'text-indigo-400',
    rows: [
      { action: 'Ver registros fiscales',        admin: 'yes', manager: 'no',  encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Enviar registro a AEAT',        admin: 'yes', manager: 'no',  encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Ver configuración VeriFactu',   admin: 'yes', manager: 'no',  encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Cambiar entorno (dev/test/prod)', admin: 'yes', manager: 'no', encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no', desc: 'Cambio a producción requiere confirmación explícita' },
      { action: 'Verificar cadena de huellas',   admin: 'yes', manager: 'no',  encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
    ],
  },
  // ── Sistema ─────────────────────────────────────────────────────────────
  {
    id: 'system', label: 'Sistema y configuración', icon: Settings, color: 'text-slate-400',
    rows: [
      { action: 'Ver diagnóstico del sistema',        admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Configurar zonas y mesas',           admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Configurar impresoras',              admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Gestionar dispositivos offline',     admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Crear / editar copia de seguridad', admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Gestionar usuarios y PINs',         admin: 'yes', manager: 'yes', encargado: 'no',  camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
      { action: 'Configuración global del negocio',  admin: 'yes', manager: 'no',  encargado: 'no',  camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
    ],
  },
  // ── Impresión / KDS ─────────────────────────────────────────────────────
  {
    id: 'printing', label: 'Impresión y KDS', icon: Printer, color: 'text-cyan-400',
    rows: [
      { action: 'Ver cola de impresión',     admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'no',  caja: 'no',  cocina: 'yes', repartidor: 'no' },
      { action: 'Imprimir ticket de cliente', admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'no',  repartidor: 'no' },
      { action: 'Ver KDS (pantalla cocina)', admin: 'yes', manager: 'yes', encargado: 'yes', camarero: 'yes', caja: 'yes', cocina: 'yes', repartidor: 'no' },
      { action: 'Configurar enrutamiento impresión', admin: 'yes', manager: 'yes', encargado: 'no', camarero: 'no', caja: 'no', cocina: 'no', repartidor: 'no' },
    ],
  },
];

// ─── Cell renderer ────────────────────────────────────────────────────────────

function AccessCell({ access }: { access: Access }) {
  if (access === 'yes') {
    return (
      <div className="flex justify-center">
        <CheckCircle2 size={16} className="text-emerald-400" />
      </div>
    );
  }
  if (access === 'own') {
    return (
      <div className="flex justify-center" title="Solo sus propios datos">
        <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5">Propio</span>
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <XCircle size={16} className="text-red-900/40" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPermisos() {
  const [, setLocation] = useLocation();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [highlightRole, setHighlightRole] = useState<Role | null>(null);

  const visibleGroups = activeGroup
    ? MATRIX.filter((g) => g.id === activeGroup)
    : MATRIX;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-full px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => setLocation('/admin')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/15">
              <Lock size={16} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight">Permisos por rol</h1>
              <p className="text-[10px] text-muted-foreground leading-none">Matriz de acceso · refleja los guards reales del backend</p>
            </div>
          </div>
        </div>

        {/* Role legend */}
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setHighlightRole(highlightRole === r.id ? null : r.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${highlightRole === r.id ? 'opacity-100' : highlightRole ? 'opacity-30' : 'opacity-100'}`}
              style={{
                background: `${r.color}18`,
                borderColor: `${r.color}40`,
                color: r.color,
              }}
            >
              {r.label}
            </button>
          ))}
          {highlightRole && (
            <button onClick={() => setHighlightRole(null)} className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground border border-border hover:bg-secondary transition-colors">
              Limpiar filtro
            </button>
          )}
        </div>
      </header>

      {/* Info banner */}
      <div className="max-w-full px-4 py-3">
        <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <Info size={15} className="text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Esta tabla refleja los guards <code className="font-mono text-xs bg-secondary px-1 rounded">requireAuth</code> + <code className="font-mono text-xs bg-secondary px-1 rounded">requireRole()</code> configurados en el servidor. Cualquier cambio en los permisos reales debe actualizarse aquí también para mantener la trazabilidad.
          </p>
        </div>
      </div>

      {/* Module filter */}
      <div className="max-w-full px-4 pb-3 flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveGroup(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!activeGroup ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
        >
          Todos
        </button>
        {MATRIX.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGroup(activeGroup === g.id ? null : g.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeGroup === g.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
            >
              <Icon size={12} className={activeGroup === g.id ? '' : g.color} />
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="max-w-full px-4 pb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-400" /> Permitido</span>
        <span className="flex items-center gap-1.5"><XCircle size={12} className="text-red-900/40" /> Denegado</span>
        <span className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1 py-0.5">Propio</span> Solo propios datos</span>
      </div>

      {/* Tables */}
      <div className="max-w-full px-4 pb-8 space-y-6">
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          const filteredRoles = highlightRole ? ROLES.filter((r) => r.id === highlightRole) : ROLES;
          return (
            <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/20">
                <Icon size={16} className={group.color} />
                <h2 className="font-bold text-sm">{group.label}</h2>
                <span className="text-xs text-muted-foreground">{group.rows.length} permisos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-bold text-muted-foreground w-64">Acción</th>
                      {filteredRoles.map((r) => (
                        <th
                          key={r.id}
                          className="px-2 py-2 font-bold text-center w-20"
                          style={{ color: r.color }}
                        >
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {group.rows.map((row) => (
                      <tr key={row.action} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium leading-tight">{row.action}</p>
                          {row.desc && <p className="text-muted-foreground mt-0.5 text-[10px]">{row.desc}</p>}
                        </td>
                        {filteredRoles.map((r) => (
                          <td key={r.id} className="px-2 py-2.5 text-center">
                            <AccessCell access={row[r.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

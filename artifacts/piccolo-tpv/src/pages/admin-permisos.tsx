/**
 * Admin — Permisos por rol
 * Manages fine-grained permission overrides per role.
 * Displays a matrix: rows = module+action, columns = roles, cells = checkboxes.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Shield, ChevronLeft, Check, X, RefreshCw, Info } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL;

const ROLES = [
  { key: "admin",     label: "Admin",     color: "#ef4444" },
  { key: "manager",   label: "Manager",   color: "#f59e0b" },
  { key: "encargado", label: "Encargado", color: "#6366f1" },
  { key: "waiter",    label: "Camarero",  color: "#10b981" },
  { key: "cashier",   label: "Cajero",    color: "#06b6d4" },
];

interface ActionEntry {
  action: string;
  label: string;
  defaultRoles: string[];
}
interface ModuleEntry {
  module: string;
  label: string;
  actions: ActionEntry[];
}
interface Override {
  id: string;
  role: string;
  module: string;
  action: string;
  allowed: boolean;
}

function getEffective(
  overrides: Override[],
  defaults: Map<string, Set<string>>,
  role: string,
  module: string,
  action: string,
): boolean {
  const ov = overrides.find((o) => o.role === role && o.module === module && o.action === action);
  if (ov) return ov.allowed;
  return defaults.get(`${module}::${action}`)?.has(role) ?? false;
}

function isOverridden(overrides: Override[], role: string, module: string, action: string): boolean {
  return overrides.some((o) => o.role === role && o.module === module && o.action === action);
}

export default function AdminPermisos() {
  const [, navigate] = useLocation();
  const [catalog, setCatalog] = useState<ModuleEntry[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Precompute defaults map: "module::action" → Set<role>
  const defaults = new Map<string, Set<string>>();
  catalog.forEach((m) =>
    m.actions.forEach((a) => {
      defaults.set(`${m.module}::${a.action}`, new Set(a.defaultRoles));
    }),
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, ovRes] = await Promise.all([
        customFetch(`${BASE}api/admin/permissions/catalog`),
        customFetch(`${BASE}api/admin/permissions`),
      ]);
      if (!catRes.ok || !ovRes.ok) throw new Error("Error al cargar permisos");
      const catData = await catRes.json();
      const ovData = await ovRes.json();
      setCatalog(catData.catalog ?? []);
      setOverrides(ovData.overrides ?? []);
      setExpandedModules(new Set((catData.catalog ?? []).map((m: ModuleEntry) => m.module)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (role: string, module: string, action: string) => {
    const current = getEffective(overrides, defaults, role, module, action);
    const newAllowed = !current;
    const key = `${role}::${module}::${action}`;
    setSaving(key);
    try {
      const res = await customFetch(`${BASE}api/admin/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, module, action, allowed: newAllowed }),
      });
      if (!res.ok) throw new Error("Error al guardar permiso");
      const data = await res.json();
      setOverrides((prev) => {
        const filtered = prev.filter(
          (o) => !(o.role === role && o.module === module && o.action === action),
        );
        return [...filtered, data.permission];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  };

  const resetToDefault = async (role: string, module: string, action: string) => {
    const ov = overrides.find((o) => o.role === role && o.module === module && o.action === action);
    if (!ov) return;
    setSaving(`${role}::${module}::${action}`);
    try {
      const res = await customFetch(`${BASE}api/admin/permissions/${ov.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar override");
      setOverrides((prev) => prev.filter((o) => o.id !== ov.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al restaurar");
    } finally {
      setSaving(null);
    }
  };

  const toggleModule = (mod: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <RefreshCw className="animate-spin mr-2" size={20} /> Cargando permisos…
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="p-2 rounded-xl bg-indigo-500/20">
          <Shield size={24} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Permisos por rol</h1>
          <p className="text-slate-400 text-sm">
            Ajusta qué puede hacer cada rol. Los cambios se aplican inmediatamente.
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          title="Recargar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-sm flex items-center gap-2">
          <X size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="mb-4 flex gap-4 text-xs text-slate-400 items-center">
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-emerald-500/30 border border-emerald-400 flex items-center justify-center"><Check size={10} className="text-emerald-400" /></span>
          Permitido (por defecto o override)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-500/20 border border-red-400/50 flex items-center justify-center"><X size={10} className="text-red-400" /></span>
          Denegado
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded border-2 border-indigo-400/60" />
          Override activo (diferente al por defecto)
        </span>
      </div>

      {/* Matrix */}
      <div className="space-y-3">
        {catalog.map((mod) => (
          <div key={mod.module} className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            {/* Module header */}
            <button
              onClick={() => toggleModule(mod.module)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors text-left"
            >
              <span className="font-semibold text-slate-200">{mod.label}</span>
              <span className="text-xs text-slate-500 ml-1">({mod.actions.length} acciones)</span>
              <span className="ml-auto text-slate-500 text-xs">
                {expandedModules.has(mod.module) ? "▲" : "▼"}
              </span>
            </button>

            {expandedModules.has(mod.module) && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-normal w-64">Acción</th>
                      {ROLES.map((r) => (
                        <th key={r.key} className="px-3 py-2 text-center" style={{ color: r.color }}>
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mod.actions.map((act) => (
                      <tr key={act.action} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-slate-300">{act.label}</td>
                        {ROLES.map((r) => {
                          const allowed = getEffective(overrides, defaults, r.key, mod.module, act.action);
                          const overridden = isOverridden(overrides, r.key, mod.module, act.action);
                          const key = `${r.key}::${mod.module}::${act.action}`;
                          const isSaving = saving === key;

                          return (
                            <td key={r.key} className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => toggle(r.key, mod.module, act.action)}
                                  disabled={isSaving}
                                  className={`w-7 h-7 rounded flex items-center justify-center border-2 transition-all ${
                                    allowed
                                      ? "bg-emerald-500/20 border-emerald-400 hover:bg-emerald-500/40"
                                      : "bg-red-500/10 border-red-400/40 hover:bg-red-500/20"
                                  } ${overridden ? "ring-1 ring-indigo-400/60" : ""} ${isSaving ? "opacity-40" : ""}`}
                                >
                                  {isSaving ? (
                                    <RefreshCw size={10} className="animate-spin text-slate-400" />
                                  ) : allowed ? (
                                    <Check size={12} className="text-emerald-400" />
                                  ) : (
                                    <X size={12} className="text-red-400" />
                                  )}
                                </button>
                                {overridden && (
                                  <button
                                    onClick={() => resetToDefault(r.key, mod.module, act.action)}
                                    title="Restaurar valor por defecto"
                                    className="w-4 h-4 rounded text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center"
                                  >
                                    <Info size={10} />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-600 text-center">
        Los permisos aquí son overrides sobre el acceso por defecto de cada rol. Al hacer clic en el ícono ⓘ junto a una celda modificada, se restaura el valor por defecto.
      </p>
    </div>
  );
}

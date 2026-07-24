/**
 * FichajeAuditoria — trazabilidad completa de cambios en registros de fichaje.
 * Usa GET /api/fichaje/audit
 */
import { useState, useEffect } from "react";
import { Shield, RefreshCw, Clock, Search } from "lucide-react";
import { getFichajeAuditLog } from "@workspace/api-client-react/timeclock";
import type { FichajeAuditEntry } from "@workspace/api-client-react/timeclock";

interface AuditEntry {
  id: string;
  action: string;
  employeeId: string | null;
  performedByName: string | null;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  clock_in:        "Entrada registrada",
  clock_out:       "Salida registrada",
  record_created:  "Registro creado",
  record_updated:  "Registro modificado",
  record_deleted:  "Registro eliminado",
  manual_entry:    "Entrada manual",
  anviz_import:    "Importación Anviz",
  settings_updated:"Configuración actualizada",
  absence_created: "Ausencia creada",
  absence_updated: "Ausencia actualizada",
  absence_deleted: "Ausencia eliminada",
  shift_created:   "Turno creado",
  shift_updated:   "Turno modificado",
  shift_deleted:   "Turno eliminado",
};

const ACTION_COLORS: Record<string, string> = {
  clock_in:        "bg-green-50 text-green-700 border-green-200",
  clock_out:       "bg-blue-50 text-blue-700 border-blue-200",
  record_updated:  "bg-amber-50 text-amber-700 border-amber-200",
  record_deleted:  "bg-red-50 text-red-700 border-red-200",
  anviz_import:    "bg-purple-50 text-purple-700 border-purple-200",
  settings_updated:"bg-gray-100 text-gray-700 border-gray-200",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function FichajeAuditoria() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);

  function load() {
    setLoading(true);
    getFichajeAuditLog({ limit: String(limit) })
      .then(d => setEntries(Array.isArray(d) ? d as AuditEntry[] : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [limit]);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.performedByName ?? "").toLowerCase().includes(q) || (e.action ?? "").toLowerCase().includes(q) || (e.entityType ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auditoría</h1>
          <p className="text-muted-foreground text-sm mt-1">{entries.length} eventos registrados</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar acción o usuario…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
        </div>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-secondary text-foreground">
          <option value={50}>Últimos 50</option>
          <option value={100}>Últimos 100</option>
          <option value={250}>Últimos 250</option>
          <option value={500}>Últimos 500</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando registros de auditoría…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Sin eventos registrados</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
          {filtered.map(entry => {
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            const colorClass = ACTION_COLORS[entry.action] ?? "bg-secondary text-muted-foreground border-border";
            return (
              <div key={entry.id} className="flex items-start gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors">
                <span className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  {entry.performedByName && (
                    <span className="text-sm font-medium text-foreground">{entry.performedByName}</span>
                  )}
                  {entry.entityType && entry.entityId && (
                    <span className="text-xs text-muted-foreground ml-2">{entry.entityType} #{entry.entityId.slice(0, 8)}</span>
                  )}
                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                      {JSON.stringify(entry.details).slice(0, 120)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 mt-0.5">
                  <Clock size={11} />
                  {fmt(entry.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

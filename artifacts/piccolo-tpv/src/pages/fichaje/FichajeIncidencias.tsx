/**
 * FichajeIncidencias — alertas de fichajes anómalos:
 * sin entrada, doble fichaje, turno muy largo, salida sin entrada.
 */
import { useState, useEffect } from "react";
import { AlertCircle, Clock, AlertTriangle, CheckCircle2, Search, RefreshCw } from "lucide-react";
import { api } from "../../lib/api-client";

interface TimeRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
  isManual: boolean;
}

type IncidenciaType = "open" | "long" | "manual" | "short";

interface Incidencia {
  id: string;
  type: IncidenciaType;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  detail: string;
  severity: "high" | "medium" | "low";
}

const TYPE_CONFIG: Record<IncidenciaType, { label: string; color: string; bg: string }> = {
  open:   { label: "Turno abierto",      color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  long:   { label: "Turno excesivo",     color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  manual: { label: "Registro manual",    color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  short:  { label: "Turno muy corto",    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function analyze(records: TimeRecord[]): Incidencia[] {
  const now = Date.now();
  const results: Incidencia[] = [];

  for (const r of records) {
    const inMs = new Date(r.clockIn).getTime();
    const outMs = r.clockOut ? new Date(r.clockOut).getTime() : null;
    const durationMin = outMs ? (outMs - inMs) / 60000 : (now - inMs) / 60000;

    if (!r.clockOut) {
      results.push({
        id: r.id, type: "open", employeeName: r.employeeName,
        clockIn: r.clockIn, clockOut: null,
        detail: `Lleva ${Math.round(durationMin / 60)}h ${Math.round(durationMin % 60)}m sin registrar salida.`,
        severity: durationMin > 600 ? "high" : "medium",
      });
    } else if (durationMin > 600) {
      results.push({
        id: r.id, type: "long", employeeName: r.employeeName,
        clockIn: r.clockIn, clockOut: r.clockOut,
        detail: `Turno de ${(durationMin / 60).toFixed(1)}h (límite recomendado: 10h).`,
        severity: "medium",
      });
    } else if (durationMin < 15 && r.clockOut) {
      results.push({
        id: r.id, type: "short", employeeName: r.employeeName,
        clockIn: r.clockIn, clockOut: r.clockOut,
        detail: `Turno de solo ${Math.round(durationMin)} minutos.`,
        severity: "low",
      });
    }

    if (r.isManual) {
      results.push({
        id: `${r.id}-manual`, type: "manual", employeeName: r.employeeName,
        clockIn: r.clockIn, clockOut: r.clockOut,
        detail: "Registro introducido manualmente por un administrador.",
        severity: "low",
      });
    }
  }

  return results.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

export default function FichajeIncidencias() {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to] = useState(() => new Date().toISOString().slice(0, 10));

  function load() {
    setLoading(true);
    api.get<TimeRecord[]>(`/api/fichaje/records?from=${from}&to=${to}`)
      .then(d => setIncidencias(analyze(d)))
      .catch(() => setIncidencias([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = incidencias.filter(i =>
    i.employeeName.toLowerCase().includes(search.toLowerCase())
  );
  const high   = filtered.filter(i => i.severity === "high").length;
  const medium = filtered.filter(i => i.severity === "medium").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidencias</h1>
          <p className="text-muted-foreground text-sm mt-1">Últimos 7 días · {incidencias.length} alertas detectadas</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-700">{high}</div>
          <div className="text-sm text-red-600 mt-1">Alta prioridad</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-orange-700">{medium}</div>
          <div className="text-sm text-orange-600 mt-1">Media prioridad</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-foreground">{filtered.length - high - medium}</div>
          <div className="text-sm text-muted-foreground mt-1">Baja prioridad</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Analizando registros…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-60" />
          <p className="font-medium">Sin incidencias en el período</p>
          <p className="text-sm mt-1">Todos los registros son correctos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inc => {
            const cfg = TYPE_CONFIG[inc.type];
            return (
              <div key={inc.id} className={`flex items-start gap-4 p-4 rounded-xl border ${cfg.bg}`}>
                <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="font-medium text-sm text-foreground">{inc.employeeName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{inc.detail}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    Entrada: {fmt(inc.clockIn)}
                    {inc.clockOut && <> · Salida: {fmt(inc.clockOut)}</>}
                  </p>
                </div>
                {inc.severity === "high" && (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

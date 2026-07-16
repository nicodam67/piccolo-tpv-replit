import { useState, useEffect, useCallback } from "react";

interface Alert {
  id: string; priority: string; source: string; title: string; detail?: string;
  status: string; assignedTo?: string; resolvedAt?: string; actionTaken?: string;
  originModule?: string; createdAt: string; isDemo: boolean;
}

const PRIORITY_STYLES: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
  critical: { bg: "bg-red-950/50",    border: "border-red-800",    badge: "bg-red-900/80 text-red-300 border-red-700",    dot: "bg-red-500" },
  high:     { bg: "bg-orange-950/30", border: "border-orange-800", badge: "bg-orange-900/80 text-orange-300 border-orange-700", dot: "bg-orange-500" },
  medium:   { bg: "bg-yellow-950/20", border: "border-yellow-800", badge: "bg-yellow-900/80 text-yellow-300 border-yellow-700", dot: "bg-yellow-500" },
  low:      { bg: "bg-gray-900",      border: "border-gray-800",   badge: "bg-gray-800 text-gray-400 border-gray-700",   dot: "bg-gray-500" },
};
const PRIORITY_LABEL: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const STATUS_LABEL:   Record<string, string> = { open: "Abierta", reviewed: "Revisada", snoozed: "Silenciada", resolved: "Resuelta", ignored: "Ignorada" };

function timeAgo(dt: string) {
  const s = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s/60)}m`;
  if (s < 86400) return `hace ${Math.floor(s/3600)}h`;
  return `hace ${Math.floor(s/86400)}d`;
}

export default function DirectorAlertas() {
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter]   = useState<"all" | "open" | "resolved">("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/director/alerts${q}&limit=100`, { credentials: "include" })
      .then(r => r.ok ? r.json() : []).then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const patch = async (id: string, body: object) => {
    await fetch(`/api/director/alerts/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    load();
  };

  const generateAlerts = async () => {
    setGenerating(true);
    await fetch("/api/director/alerts/generate", { method: "POST", credentials: "include" }).catch(() => {});
    setGenerating(false);
    load();
  };

  const openAlerts = alerts.filter(a => a.status === "open").length;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex gap-1">
          {(["open", "all", "resolved"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              {f === "open" ? `Abiertas ${openAlerts > 0 ? `(${openAlerts})` : ""}` : f === "all" ? "Todas" : "Resueltas"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={generateAlerts} disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded-lg text-sm transition-colors">
            {generating ? <><span className="animate-spin">⟳</span> Generando…</> : "🔍 Auto-generar alertas"}
          </button>
        </div>
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {!loading && alerts.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-sm">{filter === "open" ? "No hay alertas abiertas" : "No hay alertas"}</p>
          <p className="text-xs mt-1 text-gray-600">Usa «Auto-generar alertas» para detectar incidencias automáticamente</p>
        </div>
      )}

      <div className="space-y-3">
        {alerts.map(a => {
          const st = PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.low;
          const isOpen = expanded === a.id;
          return (
            <div key={a.id} className={`border rounded-xl overflow-hidden transition-all ${st.bg} ${st.border} ${a.isDemo ? "opacity-70" : ""}`}>
              <button className="w-full text-left p-4" onClick={() => setExpanded(isOpen ? null : a.id)}>
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${st.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${st.badge}`}>{PRIORITY_LABEL[a.priority] ?? a.priority}</span>
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">{STATUS_LABEL[a.status] ?? a.status}</span>
                      {a.originModule && <span className="text-xs text-gray-500 capitalize">{a.originModule}</span>}
                      {a.isDemo && <span className="text-xs text-amber-600 italic">demo</span>}
                    </div>
                    <div className="text-sm font-medium text-gray-200 mt-1">{a.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{timeAgo(a.createdAt)}</div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-800/50 pt-3">
                  {a.detail && <p className="text-sm text-gray-300">{a.detail}</p>}

                  {/* Action buttons */}
                  {a.status === "open" && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => patch(a.id, { status: "resolved", actionTaken: "Resuelto desde panel" })}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg font-medium">
                        ✅ Resolver
                      </button>
                      <button onClick={() => patch(a.id, { status: "reviewed" })}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg font-medium">
                        👁️ Marcar revisada
                      </button>
                      <button onClick={() => patch(a.id, { status: "ignored" })}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg font-medium">
                        Ignorar
                      </button>
                    </div>
                  )}
                  {a.status !== "open" && a.status !== "resolved" && (
                    <button onClick={() => patch(a.id, { status: "resolved" })}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg font-medium">
                      ✅ Resolver
                    </button>
                  )}

                  {a.resolvedAt && (
                    <div className="text-xs text-gray-500">Resuelta: {new Date(a.resolvedAt).toLocaleString("es-ES")}</div>
                  )}
                  {a.actionTaken && <div className="text-xs text-gray-400 italic">Acción: {a.actionTaken}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from "react";

type ExportType = "sales" | "profitability";
type ExportFormat = "csv" | "xlsx";

function periodParams(p: string, from: string, to: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today")     return { from: today, to: today };
  if (p === "yesterday") { const y = new Date(now); y.setDate(now.getDate()-1); const ys = y.toISOString().slice(0,10); return { from: ys, to: ys }; }
  if (p === "week")      { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return { from: s.toISOString().slice(0,10), to: today }; }
  if (p === "month")     { return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10), to: today }; }
  return { from, to };
}

const QUICK_EXPORTS = [
  { label: "Ventas del día (CSV)",          type: "sales"          as ExportType, period: "today",     format: "csv"  as ExportFormat, icon: "📊" },
  { label: "Ventas del mes (Excel)",        type: "sales"          as ExportType, period: "month",     format: "xlsx" as ExportFormat, icon: "📊" },
  { label: "Rentabilidad por producto (CSV)", type: "profitability" as ExportType, period: "month",    format: "csv"  as ExportFormat, icon: "📈" },
  { label: "Rentabilidad semana (Excel)",   type: "profitability"  as ExportType, period: "week",      format: "xlsx" as ExportFormat, icon: "📈" },
];

export default function DirectorInformes() {
  const [type, setType]     = useState<ExportType>("sales");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [period, setPeriod] = useState("month");
  const [customFrom, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [customTo, setTo]   = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const doExport = async (t: ExportType, p: string, f: ExportFormat, from = customFrom, to = customTo) => {
    setLoading(true);
    const params = periodParams(p, from, to);
    const url = `/api/director/export?type=${t}&format=${f}&from=${params.from}&to=${params.to}`;
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) { alert("Error al generar el informe"); return; }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `director_${t}_${params.from}.${f}`;
      a.click();
    } finally { setLoading(false); }
  };

  const generateSnapshots = async () => {
    setGenerating(true);
    try {
      const r = await fetch("/api/director/snapshots/generate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
      });
      if (r.ok) alert("Snapshot del día generado correctamente");
      else alert("Error al generar snapshot");
    } finally { setGenerating(false); }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Quick exports */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">⚡ Exportaciones rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUICK_EXPORTS.map((e, i) => (
            <button key={i} onClick={() => doExport(e.type, e.period, e.format)}
              className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-left transition-all group">
              <span className="text-2xl">{e.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{e.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{e.format.toUpperCase()}</div>
              </div>
              <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Custom export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Exportación personalizada</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo de informe</label>
            <select value={type} onChange={e => setType((e.target as HTMLSelectElement).value as ExportType)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
              <option value="sales">Ventas</option>
              <option value="profitability">Rentabilidad</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Formato</label>
            <select value={format} onChange={e => setFormat((e.target as HTMLSelectElement).value as ExportFormat)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Período</label>
            <select value={period} onChange={e => setPeriod((e.target as HTMLSelectElement).value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          {period === "custom" && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Desde</label>
                <input type="date" value={customFrom} onInput={e => setFrom((e.target as HTMLInputElement).value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Hasta</label>
                <input type="date" value={customTo} onInput={e => setTo((e.target as HTMLInputElement).value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm" />
              </div>
            </>
          )}
        </div>
        <button onClick={() => doExport(type, period, format)} disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium">
          {loading ? <><span className="animate-spin">⟳</span> Generando…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Descargar informe</>}
        </button>
      </div>

      {/* Snapshot management */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Snapshots de datos históricos</h3>
        <p className="text-xs text-gray-400 mb-4">
          Los snapshots pre-agregan los datos del día para acelerar las consultas históricas. Se recomienda generarlos al cierre del día.
        </p>
        <button onClick={generateSnapshots} disabled={generating}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium">
          {generating ? <><span className="animate-spin">⟳</span> Generando…</> : "📸 Generar snapshot de hoy"}
        </button>
      </div>

      {/* Demo data management */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Datos de demostración</h3>
        <p className="text-xs text-gray-400 mb-4">
          Crea costes, alertas y objetivos de ejemplo para explorar el panel sin datos reales.
        </p>
        <div className="flex gap-3">
          <button onClick={async () => {
            const r = await fetch("/api/director/demo-data", { method: "POST", credentials: "include" });
            if (r.ok) alert("Datos demo creados"); else alert("Error al crear demo data");
          }} className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium">
            ✨ Crear datos demo
          </button>
          <button onClick={async () => {
            if (!confirm("¿Eliminar todos los datos de demostración?")) return;
            const r = await fetch("/api/director/demo-data", { method: "DELETE", credentials: "include" });
            if (r.ok) alert("Datos demo eliminados"); else alert("Error");
          }} className="px-4 py-2 bg-red-900/50 hover:bg-red-800/50 text-red-300 border border-red-800 rounded-lg text-sm font-medium">
            🗑️ Eliminar datos demo
          </button>
        </div>
      </div>
    </div>
  );
}

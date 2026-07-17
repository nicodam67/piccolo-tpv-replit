import { useState, useEffect } from "react";
import { api } from '../../lib/api-client';

interface ReservationData {
  period: { from: string; to: string };
  summary: { total: string; confirmed: string; pending: string; cancelled: string; no_show: string; total_guests: string; avg_guests: string };
  upcoming: { id: string; hora: string; personas: number; status: string; notes?: string; client_name?: string }[];
}

function periodParams(p: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today") return `from=${today}&to=${today}`;
  if (p === "tomorrow") { const t = new Date(now); t.setDate(now.getDate()+1); const ts = t.toISOString().slice(0,10); return `from=${ts}&to=${ts}`; }
  if (p === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

const STATUS_STYLES: Record<string, string> = {
  confirmada: "bg-emerald-900/50 text-emerald-400 border-emerald-700",
  pendiente: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
  cancelada: "bg-red-900/50 text-red-400 border-red-700",
  completada: "bg-gray-800 text-gray-400 border-gray-700",
  no_show: "bg-orange-900/50 text-orange-400 border-orange-700",
};

export default function DirectorReservas() {
  const [period, setPeriod] = useState("today");
  const [data, setData]     = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<ReservationData>(`/api/director/reservations?${periodParams(period)}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const s = data?.summary;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["today","Hoy"],["tomorrow","Mañana"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Total", value: s?.total ?? "0", cls: "text-white" },
              { label: "Confirmadas", value: s?.confirmed ?? "0", cls: "text-emerald-400" },
              { label: "Pendientes", value: s?.pending ?? "0", cls: "text-yellow-400" },
              { label: "Canceladas", value: s?.cancelled ?? "0", cls: "text-red-400" },
              { label: "No show", value: s?.no_show ?? "0", cls: "text-orange-400" },
              { label: "Comensales", value: s?.total_guests ?? "0", cls: "text-blue-400" },
            ].map(item => (
              <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${item.cls}`}>{item.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Upcoming */}
          {data.upcoming.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Próximas reservas</h3>
              <div className="space-y-2">
                {data.upcoming.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-bold text-white w-12">{r.hora?.slice(0,5) ?? "--:--"}</div>
                      <div>
                        <div className="text-sm text-gray-200">{r.client_name ?? "Sin nombre"}</div>
                        {r.notes && <div className="text-xs text-gray-500">{r.notes}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-300">{r.personas} pers.</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.status] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No-show rate */}
          {parseInt(s?.total ?? "0") > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Indicadores</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tasa de confirmación</div>
                  <div className="text-lg font-bold text-white">{((parseInt(s?.confirmed ?? "0") / parseInt(s?.total ?? "1")) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tasa no-show</div>
                  <div className={`text-lg font-bold ${parseInt(s?.no_show ?? "0") > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {((parseInt(s?.no_show ?? "0") / parseInt(s?.total ?? "1")) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Media comensales/reserva</div>
                  <div className="text-lg font-bold text-white">{parseFloat(s?.avg_guests ?? "0").toFixed(1)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";

interface ForecastDay {
  date: string; dayOfWeek: number; reservations: number;
  forecastGross: number; forecastTickets: number;
}
interface ForecastData {
  method: string; isEstimate: boolean; days: ForecastDay[];
}

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function fmt(n: number, d = 2) { return n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number) { return `${fmt(n)} €`; }
function fmtDate(s: string) {
  const d = new Date(`${s}T12:00:00`);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export default function DirectorPrevision() {
  const [data, setData]     = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/director/forecast", { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const maxGross = data ? Math.max(1, ...data.days.map(d => d.forecastGross)) : 1;
  const totalForecast = data?.days.reduce((s, d) => s + d.forecastGross, 0) ?? 0;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">Previsión próximos 7 días</h2>
          <p className="text-xs text-amber-500/80 mt-0.5 italic">Estimación basada en historial de 8 semanas por día de la semana</p>
        </div>
        <button onClick={() => { setLoading(true); fetch("/api/director/forecast", { credentials: "include" }).then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false)); }}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-emerald-400 tabular-nums">{fmtEur(totalForecast)}</div>
              <div className="text-xs text-gray-400 mt-1">Previsión 7 días</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white tabular-nums">{fmtEur(totalForecast / 7)}</div>
              <div className="text-xs text-gray-400 mt-1">Media diaria estimada</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-purple-400">{data.days.reduce((s,d) => s + d.reservations, 0)}</div>
              <div className="text-xs text-gray-400 mt-1">Reservas ya confirmadas</div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Venta estimada por día</h3>
            <div className="space-y-3">
              {data.days.map(day => {
                const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <div className="w-20 text-right flex-shrink-0">
                      <div className={`text-xs font-bold ${isWeekend ? "text-blue-400" : "text-gray-300"}`}>{DOW_LABELS[day.dayOfWeek]}</div>
                      <div className="text-xs text-gray-500">{fmtDate(day.date)}</div>
                    </div>
                    <div className="flex-1 bg-gray-800 rounded-full h-8 overflow-hidden">
                      <div
                        className={`h-full rounded-full flex items-center px-3 transition-all duration-700 ${isWeekend ? "bg-blue-600" : "bg-emerald-600"}`}
                        style={{ width: `${(day.forecastGross / maxGross) * 100}%` }}
                      >
                        {(day.forecastGross / maxGross) > 0.15 && (
                          <span className="text-xs text-white font-bold">{fmtEur(day.forecastGross)}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-24 flex-shrink-0 text-right">
                      {(day.forecastGross / maxGross) <= 0.15 && (
                        <span className="text-xs text-gray-300 font-medium tabular-nums">{fmtEur(day.forecastGross)}</span>
                      )}
                      {day.reservations > 0 && (
                        <div className="text-xs text-purple-400 mt-0.5">{day.reservations} res.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.days.slice(0, 4).map(day => {
              const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
              return (
                <div key={day.date} className={`border rounded-xl p-4 ${isWeekend ? "bg-blue-900/20 border-blue-800/40" : "bg-gray-900 border-gray-800"}`}>
                  <div className={`text-xs font-bold mb-0.5 ${isWeekend ? "text-blue-400" : "text-gray-400"}`}>{DOW_LABELS[day.dayOfWeek]}, {fmtDate(day.date)}</div>
                  <div className="text-lg font-bold text-white tabular-nums">{fmtEur(day.forecastGross)}</div>
                  <div className="text-xs text-gray-500 mt-1">{day.forecastTickets} tickets est.</div>
                  {day.reservations > 0 && <div className="text-xs text-purple-400 mt-0.5">+{day.reservations} reservas</div>}
                </div>
              );
            })}
          </div>

          <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-xl p-3 text-xs text-yellow-400/80">
            ⚠️ Previsión basada en la media de las últimas 8 semanas por día de la semana, ajustada por número de reservas. Las estimaciones pueden no ser precisas para nuevos negocios o períodos con datos insuficientes.
          </div>
        </div>
      )}
    </div>
  );
}

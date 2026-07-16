import { useState, useEffect } from "react";

interface CRMData {
  period: { from: string; to: string };
  clients: { total_clients: string; new_clients: string; active_clients: string };
  giftCards: { total_cards: string; total_balance: string; new_cards: string };
  loyalty: { points_earned_txns: string; points_earned: string; points_redeemed: string };
}

function fmt(n: number | string, d = 2) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtEur(n: number | string) { return `${fmt(n)} €`; }

function periodParams(p: string) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  if (p === "today") return `from=${today}&to=${today}`;
  if (p === "week") { const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-d); return `from=${s.toISOString().slice(0,10)}&to=${today}`; }
  return `from=${new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)}&to=${today}`;
}

export default function DirectorCRM() {
  const [period, setPeriod] = useState("month");
  const [data, setData]     = useState<CRMData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/director/crm?${periodParams(period)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["today","Hoy"],["week","Semana"],["month","Mes"]].map(([id,label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>}

      {data && !loading && (
        <div className="space-y-5">
          {/* Clients */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">👥 Base de clientes</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{data.clients.total_clients}</div>
                <div className="text-xs text-gray-400 mt-1">Total clientes</div>
              </div>
              <div className="bg-blue-900/30 border border-blue-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{data.clients.new_clients}</div>
                <div className="text-xs text-gray-400 mt-1">Nuevos en período</div>
              </div>
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{data.clients.active_clients}</div>
                <div className="text-xs text-gray-400 mt-1">Con visita en período</div>
              </div>
            </div>
          </div>

          {/* Gift cards */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">🎁 Tarjetas regalo</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{data.giftCards.total_cards}</div>
                <div className="text-xs text-gray-400 mt-1">Tarjetas activas</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-800/50 rounded-xl p-4 text-center">
                <div className="text-xl font-bold text-purple-400 tabular-nums">{fmtEur(data.giftCards.total_balance)}</div>
                <div className="text-xs text-gray-400 mt-1">Saldo total pendiente</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{data.giftCards.new_cards}</div>
                <div className="text-xs text-gray-400 mt-1">Emitidas en período</div>
              </div>
            </div>
          </div>

          {/* Loyalty */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">⭐ Programa de fidelidad</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">{parseInt(data.loyalty.points_earned).toLocaleString("es-ES")}</div>
                <div className="text-xs text-gray-400 mt-1">Puntos acumulados</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{parseInt(data.loyalty.points_redeemed).toLocaleString("es-ES")}</div>
                <div className="text-xs text-gray-400 mt-1">Puntos canjeados</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{data.loyalty.points_earned_txns}</div>
                <div className="text-xs text-gray-400 mt-1">Transacciones</div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-3 flex-wrap">
            <a href="/admin/crm" className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
              <span>👥</span> Gestionar clientes
            </a>
            <a href="/admin/crm" className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
              <span>🎁</span> Tarjetas regalo
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Lock, Unlock, Plus, X, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../lib/api-client";

type PayPeriod = {
  id: string; year: number; month: number; status: string;
  plannedHours?: string; actualHours?: string; estimatedCost?: string;
  totalSales?: string; notes?: string;
  closedAt?: string; reopenedAt?: string; createdAt: string;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const INPUT = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500";

function fmt(n?: string | null) {
  if (!n) return "—";
  return parseFloat(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HRPeriodos() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [closeModal, setCloseModal] = useState<PayPeriod | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);

  const { data: periods = [], isLoading } = useQuery<PayPeriod[]>({
    queryKey: ["hr-periods"],
    queryFn: () => api.get<PayPeriod[]>("/api/hr/pay-periods"),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/hr/pay-periods", { year: newYear, month: newMonth }),
    onSuccess: () => { toast.success("Periodo creado"); qc.invalidateQueries({ queryKey: ["hr-periods"] }); setShowCreate(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/hr/pay-periods/${id}/close`, { notes: closeNotes }),
    onSuccess: () => {
      toast.success("Periodo cerrado");
      qc.invalidateQueries({ queryKey: ["hr-periods"] });
      setCloseModal(null);
      setCloseNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/hr/pay-periods/${id}/reopen`, {}),
    onSuccess: () => { toast.success("Periodo reabierto"); qc.invalidateQueries({ queryKey: ["hr-periods"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusConfig = {
    open: { label: "Abierto", color: "text-blue-400", bg: "bg-blue-900/30" },
    closed: { label: "Cerrado", color: "text-gray-400", bg: "bg-gray-800" },
    locked: { label: "Bloqueado", color: "text-red-400", bg: "bg-red-900/30" },
  };

  const sortedPeriods = [...periods].sort((a, b) => b.year - a.year || b.month - a.month);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Periodos de cierre</h2>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> Nuevo periodo
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-500 py-10">Cargando...</p>
      ) : sortedPeriods.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay periodos — crea el primero</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPeriods.map((period) => {
            const sc = statusConfig[period.status as keyof typeof statusConfig] ?? statusConfig.open;
            const deviation = period.actualHours && period.plannedHours
              ? parseFloat(period.actualHours) - parseFloat(period.plannedHours)
              : null;
            const costPct = period.estimatedCost && period.totalSales && parseFloat(period.totalSales) > 0
              ? (parseFloat(period.estimatedCost) / parseFloat(period.totalSales) * 100).toFixed(1)
              : null;

            return (
              <div key={period.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{MONTH_NAMES[period.month - 1]} {period.year}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                  </div>
                  <div className="flex gap-2">
                    {period.status === "open" && (
                      <button onClick={() => { setCloseModal(period); setCloseNotes(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                        <Lock className="w-4 h-4" /> Cerrar
                      </button>
                    )}
                    {period.status === "closed" && (
                      <button onClick={() => { if (confirm("¿Reabrir el periodo?")) reopenMutation.mutate(period.id); }}
                        disabled={reopenMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 rounded-lg text-sm disabled:opacity-50">
                        <Unlock className="w-4 h-4" /> Reabrir
                      </button>
                    )}
                  </div>
                </div>

                {(period.actualHours || period.plannedHours) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Metric label="Horas planificadas" value={`${fmt(period.plannedHours)} h`} />
                    <Metric label="Horas reales" value={`${fmt(period.actualHours)} h`} />
                    {deviation !== null && (
                      <Metric
                        label="Desviación"
                        value={`${deviation >= 0 ? "+" : ""}${fmt(String(deviation))} h`}
                        color={Math.abs(deviation) > 5 ? "text-yellow-400" : "text-green-400"}
                      />
                    )}
                    {period.estimatedCost && (
                      <Metric label="Coste estimado" value={`${fmt(period.estimatedCost)} €`} />
                    )}
                    {costPct && (
                      <Metric label="% s/ ventas" value={`${costPct}%`} color={parseFloat(costPct) > 35 ? "text-red-400" : "text-green-400"} />
                    )}
                  </div>
                )}

                {period.notes && (
                  <p className="mt-3 text-sm text-gray-500">{period.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold">Nuevo periodo</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Año</label>
                  <input type="number" value={newYear} onChange={(e) => setNewYear(parseInt(e.target.value))} className={INPUT} min={2020} max={2030} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Mes</label>
                  <select value={newMonth} onChange={(e) => setNewMonth(parseInt(e.target.value))} className={INPUT}>
                    {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
                {createMutation.isPending ? "Creando..." : "Crear periodo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Modal */}
      {closeModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold">Cerrar {MONTH_NAMES[closeModal.month - 1]} {closeModal.year}</h3>
              <button onClick={() => setCloseModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3 p-3 bg-yellow-900/20 border border-yellow-900/40 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-300">
                  El sistema calculará automáticamente las horas planificadas y reales del periodo antes de cerrarlo.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notas (opcional)</label>
                <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className={`${INPUT} h-20 resize-none`} placeholder="Comentarios sobre el cierre..." />
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button onClick={() => setCloseModal(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => closeMutation.mutate(closeModal.id)} disabled={closeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
                <Lock className="w-4 h-4" /> {closeMutation.isPending ? "Cerrando..." : "Cerrar periodo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

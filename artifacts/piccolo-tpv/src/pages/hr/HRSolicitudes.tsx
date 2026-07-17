import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Check, X, Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../lib/api-client";

type EmployeeRequest = {
  id: string; employeeId: string; requestType: string;
  dateFrom: string; dateTo: string; status: string;
  notes?: string; reviewNotes?: string; reviewedAt?: string;
  createdAt: string;
  employee?: { id: string; name: string; lastName?: string } | null;
};

type Employee = { id: string; name: string; lastName?: string };

const REQUEST_TYPES = [
  { value: "vacation", label: "Vacaciones" },
  { value: "shift_swap", label: "Cambio de turno" },
  { value: "absence", label: "Ausencia" },
  { value: "correction", label: "Corrección" },
];

const STATUS_CONFIG = {
  pending: { label: "Pendiente", color: "text-yellow-400", bg: "bg-yellow-900/30", Icon: Clock },
  approved: { label: "Aprobada", color: "text-green-400", bg: "bg-green-900/30", Icon: CheckCircle },
  rejected: { label: "Rechazada", color: "text-red-400", bg: "bg-red-900/30", Icon: XCircle },
};

const INPUT = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500";

export default function HRSolicitudes() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reviewModal, setReviewModal] = useState<EmployeeRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [newForm, setNewForm] = useState({
    employeeId: "", requestType: "vacation", dateFrom: "", dateTo: "", notes: "",
  });

  const { data: requests = [], isLoading } = useQuery<EmployeeRequest[]>({
    queryKey: ["hr-requests", statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      return api.get<EmployeeRequest[]>(`/api/hr/employee-requests?${params}`);
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["hr-employees-basic"],
    queryFn: () => api.get<Employee[]>("/api/hr/employees"),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newForm) => api.post("/api/hr/employee-requests", body),
    onSuccess: () => {
      toast.success("Solicitud creada");
      qc.invalidateQueries({ queryKey: ["hr-requests"] });
      setShowCreate(false);
      setNewForm({ employeeId: "", requestType: "vacation", dateFrom: "", dateTo: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes: string }) =>
      api.patch(`/api/hr/employee-requests/${id}`, { status, reviewNotes }),
    onSuccess: () => {
      toast.success("Solicitud actualizada");
      qc.invalidateQueries({ queryKey: ["hr-requests"] });
      setReviewModal(null);
      setReviewNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const empName = (emp?: { name: string; lastName?: string } | null) =>
    emp ? `${emp.name} ${emp.lastName ?? ""}`.trim() : "—";

  const typLabel = (t: string) => REQUEST_TYPES.find((r) => r.value === t)?.label ?? t;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none">
            <option value="">Todos los tipos</option>
            {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> Nueva solicitud
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-center text-gray-500 py-10">Cargando...</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay solicitudes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const sc = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            return (
              <div key={req.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-start gap-4">
                <div className={`p-2 rounded-lg ${sc.bg}`}>
                  <sc.Icon className={`w-5 h-5 ${sc.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium">{empName(req.employee)}</span>
                    <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">{typLabel(req.requestType)}</span>
                    <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {req.dateFrom} → {req.dateTo}
                  </p>
                  {req.notes && <p className="text-sm text-gray-500 mt-1">{req.notes}</p>}
                  {req.reviewNotes && (
                    <p className="text-xs text-gray-500 mt-1 italic">Revisión: {req.reviewNotes}</p>
                  )}
                </div>
                {req.status === "pending" && (
                  <button
                    onClick={() => { setReviewModal(req); setReviewNotes(""); }}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs"
                  >
                    Revisar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold">Nueva solicitud</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Empleado</label>
                <select value={newForm.employeeId} onChange={(e) => setNewForm((f) => ({ ...f, employeeId: e.target.value }))} className={INPUT}>
                  <option value="">Selecciona empleado</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{`${e.name} ${e.lastName ?? ""}`.trim()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                <select value={newForm.requestType} onChange={(e) => setNewForm((f) => ({ ...f, requestType: e.target.value }))} className={INPUT}>
                  {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Desde</label>
                  <input type="date" value={newForm.dateFrom} onChange={(e) => setNewForm((f) => ({ ...f, dateFrom: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Hasta</label>
                  <input type="date" value={newForm.dateTo} onChange={(e) => setNewForm((f) => ({ ...f, dateTo: e.target.value }))} className={INPUT} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notas</label>
                <textarea value={newForm.notes} onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))} className={`${INPUT} h-20 resize-none`} placeholder="Motivo o contexto..." />
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createMutation.mutate(newForm)} disabled={createMutation.isPending || !newForm.employeeId || !newForm.dateFrom || !newForm.dateTo}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
                {createMutation.isPending ? "Guardando..." : "Crear solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold">Revisar solicitud</h3>
              <button onClick={() => setReviewModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-800 rounded-lg p-3 text-sm">
                <p className="font-medium">{empName(reviewModal.employee)}</p>
                <p className="text-gray-400">{typLabel(reviewModal.requestType)} · {reviewModal.dateFrom} → {reviewModal.dateTo}</p>
                {reviewModal.notes && <p className="text-gray-500 mt-1">{reviewModal.notes}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Motivo de la decisión (opcional)</label>
                <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className={`${INPUT} h-20 resize-none`} placeholder="Comentario para el empleado..." />
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button onClick={() => reviewMutation.mutate({ id: reviewModal.id, status: "rejected", reviewNotes })}
                disabled={reviewMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-lg text-sm disabled:opacity-50">
                <XCircle className="w-4 h-4" /> Rechazar
              </button>
              <button onClick={() => reviewMutation.mutate({ id: reviewModal.id, status: "approved", reviewNotes })}
                disabled={reviewMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-900/40 hover:bg-green-900/60 text-green-400 rounded-lg text-sm disabled:opacity-50">
                <Check className="w-4 h-4" /> Aprobar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

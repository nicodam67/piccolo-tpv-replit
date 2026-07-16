import { useState, useEffect } from "react";

interface Cost {
  id: string; category: string; name: string; amount: string; currency: string;
  periodicity: string; effectiveDate: string; endDate?: string; provider?: string;
  costCenter?: string; notes?: string; paidStatus: string; paymentDate?: string;
  createdAt: string;
}

const CATEGORIES = [
  { id: "rent", label: "Alquiler" }, { id: "electricity", label: "Electricidad" },
  { id: "gas", label: "Gas" }, { id: "water", label: "Agua" },
  { id: "insurance", label: "Seguros" }, { id: "accounting", label: "Gestoría" },
  { id: "maintenance", label: "Mantenimiento" }, { id: "software", label: "Software" },
  { id: "phone", label: "Teléfono" }, { id: "cleaning", label: "Limpieza" },
  { id: "advertising", label: "Publicidad" }, { id: "commissions", label: "Comisiones" },
  { id: "repairs", label: "Reparaciones" }, { id: "other", label: "Otros" },
];
const PERIODICITIES = [
  { id: "once", label: "Una vez" }, { id: "daily", label: "Diario" },
  { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensual" },
  { id: "quarterly", label: "Trimestral" }, { id: "yearly", label: "Anual" },
];
const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-900/50 text-emerald-400 border-emerald-700",
  pending: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
  cancelled: "bg-gray-800 text-gray-500 border-gray-700",
};

function fmtEur(n: number | string) { return `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function catLabel(id: string) { return CATEGORIES.find(c => c.id === id)?.label ?? id; }
function perLabel(id: string) { return PERIODICITIES.find(p => p.id === id)?.label ?? id; }

const EMPTY_FORM = { category: "rent", name: "", amount: "", periodicity: "monthly", effectiveDate: new Date().toISOString().slice(0,10), provider: "", notes: "", paidStatus: "pending" };

export default function DirectorCostos() {
  const [costs, setCosts]     = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ ...EMPTY_FORM });
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [filter, setFilter]   = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/director/costs", { credentials: "include" })
      .then(r => r.ok ? r.json() : []).then(setCosts).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    try {
      const url = editId ? `/api/director/costs/${editId}` : "/api/director/costs";
      const method = editId ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); load(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este coste?")) return;
    await fetch(`/api/director/costs/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const openEdit = (c: Cost) => {
    setForm({ category: c.category, name: c.name, amount: c.amount, periodicity: c.periodicity,
      effectiveDate: c.effectiveDate, provider: c.provider ?? "", notes: c.notes ?? "", paidStatus: c.paidStatus });
    setEditId(c.id); setShowForm(true);
  };

  const filtered = filter ? costs.filter(c => catLabel(c.category).toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase())) : costs;
  const totalMonthly = costs.reduce((s, c) => {
    const a = parseFloat(c.amount);
    switch (c.periodicity) {
      case "once": return s;
      case "daily": return s + a * 30;
      case "weekly": return s + a * 4.33;
      case "monthly": return s + a;
      case "quarterly": return s + a / 3;
      case "yearly": return s + a / 12;
      default: return s;
    }
  }, 0);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{costs.length}</div>
          <div className="text-xs text-gray-400 mt-1">Gastos configurados</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{fmtEur(totalMonthly)}</div>
          <div className="text-xs text-gray-400 mt-1">Total mensual estimado</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{costs.filter(c => c.paidStatus === "pending").length}</div>
          <div className="text-xs text-gray-400 mt-1">Pendientes de pago</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-4">
        <input value={filter} onInput={e => setFilter((e.target as HTMLInputElement).value)} placeholder="Buscar coste…"
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500" />
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ ...EMPTY_FORM }); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <span>+</span> Nuevo coste
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">{editId ? "Editar coste" : "Nuevo coste"}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs text-gray-400 mb-1 block">Categoría</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: (e.target as HTMLSelectElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Nombre / descripción *</label>
              <input value={form.name} onInput={e => setForm(f => ({ ...f, name: (e.target as HTMLInputElement).value }))} placeholder="Ej: Alquiler local octubre"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Importe (€) *</label>
              <input type="number" step="0.01" value={form.amount} onInput={e => setForm(f => ({ ...f, amount: (e.target as HTMLInputElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Periodicidad</label>
              <select value={form.periodicity} onChange={e => setForm(f => ({ ...f, periodicity: (e.target as HTMLSelectElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                {PERIODICITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Fecha efectiva</label>
              <input type="date" value={form.effectiveDate} onInput={e => setForm(f => ({ ...f, effectiveDate: (e.target as HTMLInputElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Proveedor</label>
              <input value={form.provider} onInput={e => setForm(f => ({ ...f, provider: (e.target as HTMLInputElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500" placeholder="Opcional" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Estado pago</label>
              <select value={form.paidStatus} onChange={e => setForm(f => ({ ...f, paidStatus: (e.target as HTMLSelectElement).value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm">
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="text-xs text-gray-400 mb-1 block">Observaciones</label>
              <input value={form.notes} onInput={e => setForm(f => ({ ...f, notes: (e.target as HTMLInputElement).value }))} placeholder="Opcional"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center items-center h-32 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"/></div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-center text-gray-500 py-12">No hay costes configurados. Añade alquiler, suministros y otros gastos fijos.</p>}
          {filtered.map(c => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-200">{c.name}</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">{catLabel(c.category)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.paidStatus]}`}>{c.paidStatus === "paid" ? "Pagado" : c.paidStatus === "pending" ? "Pendiente" : "Cancelado"}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{perLabel(c.periodicity)}</span>
                  {c.provider && <span>· {c.provider}</span>}
                  <span>· desde {c.effectiveDate}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold tabular-nums text-white">{fmtEur(c.amount)}</div>
                <div className="text-xs text-gray-500">{perLabel(c.periodicity).toLowerCase()}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

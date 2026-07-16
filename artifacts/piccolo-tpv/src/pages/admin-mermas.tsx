import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string) => `${BASE_URL}/api${path}`;

const WASTE_TYPES = [
  { value: 'expired', label: 'Caducado', color: 'text-red-400' },
  { value: 'spoiled', label: 'En mal estado', color: 'text-orange-400' },
  { value: 'breakage', label: 'Rotura / derrame', color: 'text-yellow-400' },
  { value: 'overproduction', label: 'Sobreproducción', color: 'text-blue-400' },
  { value: 'quality', label: 'Fallo de calidad', color: 'text-purple-400' },
  { value: 'other', label: 'Otro', color: 'text-gray-400' },
];

const PERIOD_OPTIONS = [
  { label: 'Últimos 7 días', days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 90 días', days: 90 },
];

function wasteTypeLabel(type: string) {
  return WASTE_TYPES.find(t => t.value === type)?.label ?? type;
}
function wasteTypeColor(type: string) {
  return WASTE_TYPES.find(t => t.value === type)?.color ?? 'text-gray-400';
}
function formatN(n: number | string | null | undefined, dec = 2) {
  const v = parseFloat(String(n ?? '0'));
  return isNaN(v) ? '0.00' : v.toFixed(dec);
}

export default function AdminMermas() {
  const qc = useQueryClient();
  const [periodDays, setPeriodDays] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ingredientId: '', quantity: '', unitCost: '', reason: '', wasteType: 'expired',
  });
  const [filterType, setFilterType] = useState('');

  const from = new Date(Date.now() - periodDays * 86400_000).toISOString();
  const to = new Date().toISOString();

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ['waste-records', from, to],
    queryFn: () =>
      fetch(api(`/admin/waste-records?from=${from}&to=${to}&limit=500`), { credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['waste-summary', from, to],
    queryFn: () =>
      fetch(api(`/admin/waste-records/summary?from=${from}&to=${to}`), { credentials: 'include' })
        .then(r => r.json()),
  });

  const { data: ingredients = [] } = useQuery<any[]>({
    queryKey: ['ingredients'],
    queryFn: () =>
      fetch(api('/admin/ingredients?active=true'), { credentials: 'include' }).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: (body: typeof form) =>
      fetch(api('/admin/waste-records'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...body,
          quantity: parseFloat(body.quantity),
          unitCost: body.unitCost ? parseFloat(body.unitCost) : undefined,
        }),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
        return r.json();
      }),
    onSuccess: () => {
      toast.success('Merma registrada');
      qc.invalidateQueries({ queryKey: ['waste-records'] });
      qc.invalidateQueries({ queryKey: ['waste-summary'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      setForm({ ingredientId: '', quantity: '', unitCost: '', reason: '', wasteType: 'expired' });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = filterType ? records.filter(r => r.wasteType === filterType) : records;
  const totalWasteCost = summary?.totalWasteCost ?? 0;
  const totalRows = records.length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Mermas y desperdicios</h1>
            <p className="text-sm text-gray-400 mt-1">Registro de pérdidas de ingredientes</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm"
          >
            + Registrar merma
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Pérdida total</div>
            <div className="text-2xl font-bold text-red-400">{formatN(totalWasteCost)}€</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-xs text-gray-400 mb-1">Registros</div>
            <div className="text-2xl font-bold text-white">{totalRows}</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 col-span-2 md:col-span-1">
            <div className="text-xs text-gray-400 mb-1">Período</div>
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setPeriodDays(p.days)}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    periodDays === p.days ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {p.label.replace('Últimos ', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top waste ingredients */}
        {summary?.rows?.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Mayor coste por ingrediente</h2>
            <div className="space-y-2">
              {summary.rows.slice(0, 5).map((r: any) => {
                const pct = totalWasteCost > 0 ? (r.totalCost / totalWasteCost) * 100 : 0;
                return (
                  <div key={r.ingredientId} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-300 truncate">{r.ingredientName}</div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-red-400 w-16 text-right">{formatN(r.totalCost)}€</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New waste form */}
        {showForm && (
          <div className="bg-gray-900 rounded-xl border border-red-800/40 p-5 mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">Nueva merma</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ingrediente *</label>
                <select
                  value={form.ingredientId}
                  onChange={e => setForm(f => ({ ...f, ingredientId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  <option value="">Seleccionar...</option>
                  {ingredients.map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (stock: {formatN(i.currentStock)} {i.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo de merma *</label>
                <select
                  value={form.wasteType}
                  onChange={e => setForm(f => ({ ...f, wasteType: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  {WASTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cantidad *</label>
                <input
                  type="number" min="0" step="0.001"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="0.000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Coste unitario (€)</label>
                <input
                  type="number" min="0" step="0.0001"
                  value={form.unitCost}
                  onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                  placeholder="Dejar vacío = coste medio"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Motivo</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Descripción opcional"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => mutation.mutate(form)}
                disabled={!form.ingredientId || !form.quantity || mutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
              >
                {mutation.isPending ? 'Guardando...' : 'Guardar merma'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterType('')}
            className={`px-3 py-1 rounded-full text-xs font-medium ${!filterType ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Todos ({records.length})
          </button>
          {WASTE_TYPES.map(t => {
            const count = records.filter(r => r.wasteType === t.value).length;
            if (!count) return null;
            return (
              <button
                key={t.value}
                onClick={() => setFilterType(t.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${filterType === t.value ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Records table */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay registros de merma para este período</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/60">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Ingrediente</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Coste</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(r.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{r.ingredientName}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${wasteTypeColor(r.wasteType)}`}>
                        {wasteTypeLabel(r.wasteType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {formatN(r.quantity, 3)} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-red-400 font-medium">
                      {formatN(r.totalCost)}€
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-40">
                      {r.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

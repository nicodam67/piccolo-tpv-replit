import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface Zone {
  id: string;
  name: string;
  color: string;
  tableCount?: number;
}

const PRESET_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'];

export default function SetupZonas({ onNext, onBack, onSkip }: StepProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#3b82f6', type: 'interior' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<Zone[]>('/api/zones')
      .then(setZones)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!form.name.trim()) { toast.error('El nombre de la zona es obligatorio'); return; }
    setSaving(true);
    try {
      const created = await setupFetch<Zone>('/api/zones', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, color: form.color }),
      });
      setZones((z) => [...z, created]);
      setForm({ name: '', color: '#3b82f6', type: 'interior' });
      setShowForm(false);
      toast.success(`Zona "${form.name}" creada`);
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🗺️ Zonas y mesas</h2>
      <p className="text-zinc-500 mb-6">Crea las zonas (salas, terraza, barra…) de tu restaurante. Las mesas se asignan a cada zona.</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> Las zonas agrupan las mesas del restaurante. Puedes crear el plano detallado desde el editor de salas.
      </div>

      {/* Existing zones */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-4">Cargando zonas…</div>
      ) : zones.length > 0 ? (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
              <span className="text-zinc-200 font-medium">{z.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 mb-6">
          <p className="text-3xl mb-2">🗺️</p>
          <p>No hay zonas configuradas aún.</p>
        </div>
      )}

      {/* Add zone form */}
      {showForm ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-zinc-200 mb-4">Nueva zona</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre <span className="text-amber-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Sala principal, Terraza, Barra"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Tipo</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
                <option value="interior">Interior</option>
                <option value="exterior">Exterior / Terraza</option>
                <option value="barra">Barra</option>
                <option value="privado">Sala privada</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-400 mb-2">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-white scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
              {saving ? 'Creando…' : 'Crear zona'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-sm transition-colors mb-4">
          + Añadir zona
        </button>
      )}

      {/* Link to full editor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-2">
        <p className="text-sm text-zinc-400 mb-2">Para diseñar el plano completo de mesas con arrastrar y soltar:</p>
        <a href={`${BASE}/configuracion`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm underline">
          Abrir editor de salas →
        </a>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Omitir</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

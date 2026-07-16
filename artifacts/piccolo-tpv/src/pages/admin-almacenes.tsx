import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string) => `${BASE_URL}/api${path}`;

const TEMP_TYPES = [
  { value: 'ambient', label: 'Temperatura ambiente', icon: '🌡️', color: 'text-yellow-400' },
  { value: 'refrigerated', label: 'Refrigerado (0–8°C)', icon: '❄️', color: 'text-blue-400' },
  { value: 'frozen', label: 'Congelado (−18°C)', icon: '🧊', color: 'text-cyan-400' },
  { value: 'dry', label: 'Almacén seco', icon: '🏭', color: 'text-amber-400' },
];

interface Location {
  id: string;
  name: string;
  description: string | null;
  temperature: string;
  active: boolean;
}

export default function AdminAlmacenes() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: '', description: '', temperature: 'ambient' });

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['storage-locations'],
    queryFn: () =>
      fetch(api('/admin/storage-locations'), { credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      fetch(api('/admin/storage-locations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => {
      toast.success('Ubicación creada');
      qc.invalidateQueries({ queryKey: ['storage-locations'] });
      setCreating(false);
      setForm({ name: '', description: '', temperature: 'ambient' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) =>
      fetch(api(`/admin/storage-locations/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => {
      toast.success('Ubicación actualizada');
      qc.invalidateQueries({ queryKey: ['storage-locations'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(api(`/admin/storage-locations/${id}`), { method: 'DELETE', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => {
      toast.success('Ubicación desactivada');
      qc.invalidateQueries({ queryKey: ['storage-locations'] });
    },
  });

  function tempInfo(temp: string) {
    return TEMP_TYPES.find(t => t.value === temp) ?? TEMP_TYPES[0];
  }

  function LocationForm({ value, onChange, onSave, onCancel, saving }: any) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
            <input
              type="text" value={value.name}
              onChange={e => onChange({ ...value, name: e.target.value })}
              placeholder="Frigorífico 1, Cámara de carnes..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Temperatura</label>
            <select
              value={value.temperature}
              onChange={e => onChange({ ...value, temperature: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {TEMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Descripción (opcional)</label>
          <input
            type="text" value={value.description}
            onChange={e => onChange({ ...value, description: e.target.value })}
            placeholder="Notas adicionales..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={!value.name.trim() || saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Almacenes y ubicaciones</h1>
            <p className="text-sm text-gray-400 mt-1">Gestiona dónde se almacena cada ingrediente</p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              + Nueva ubicación
            </button>
          )}
        </div>

        {/* Temperature legend */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {TEMP_TYPES.map(t => {
            const count = locations.filter(l => l.temperature === t.value).length;
            return (
              <div key={t.value} className="bg-gray-900 rounded-xl border border-gray-800 p-3 flex items-center gap-2">
                <span className="text-xl">{t.icon}</span>
                <div>
                  <div className={`text-xs font-medium ${t.color}`}>{count}</div>
                  <div className="text-xs text-gray-500 leading-tight">{t.label.split(' (')[0]}</div>
                </div>
              </div>
            );
          })}
        </div>

        {creating && (
          <div className="mb-6">
            <LocationForm
              value={form}
              onChange={setForm}
              onSave={() => createMutation.mutate(form)}
              onCancel={() => setCreating(false)}
              saving={createMutation.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Cargando...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🏭</div>
            <p>Sin ubicaciones configuradas. Crea la primera para asignar ingredientes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map(loc => {
              const t = tempInfo(loc.temperature);
              return (
                <div key={loc.id}>
                  {editing?.id === loc.id ? (
                    <LocationForm
                      value={{ name: editing.name, description: editing.description ?? '', temperature: editing.temperature }}
                      onChange={(v: any) => setEditing({ ...editing, ...v })}
                      onSave={() => updateMutation.mutate({ ...editing })}
                      onCancel={() => setEditing(null)}
                      saving={updateMutation.isPending}
                    />
                  ) : (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4">
                      <div className="text-3xl">{t.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white">{loc.name}</div>
                        <div className={`text-xs ${t.color}`}>{t.label}</div>
                        {loc.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{loc.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(loc)}
                          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(loc.id)}
                          className="px-3 py-1 bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 rounded-lg text-xs"
                        >
                          Archivar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const api = (path: string) => `${BASE_URL}/api${path}`;

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f59e0b','#ef4444',
  '#ec4899','#8b5cf6','#14b8a6','#f97316','#84cc16',
];
const ICONS = ['📦','🥩','🥬','🍳','🧀','🐟','🍞','🥛','🌶️','🧂','🍷','🍺','🫙','🧴','🍋'];

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
}

export default function AdminCategoriasIngredientes() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#6366f1', icon: '📦', sortOrder: '0' });

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['ingredient-categories'],
    queryFn: () =>
      fetch(api('/admin/ingredient-categories'), { credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      fetch(api('/admin/ingredient-categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, sortOrder: parseInt(body.sortOrder) || 0 }),
      }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => {
      toast.success('Categoría creada');
      qc.invalidateQueries({ queryKey: ['ingredient-categories'] });
      setCreating(false);
      setForm({ name: '', color: '#6366f1', icon: '📦', sortOrder: '0' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) =>
      fetch(api(`/admin/ingredient-categories/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, sortOrder: parseInt(body.sortOrder) || 0 }),
      }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => {
      toast.success('Categoría actualizada');
      qc.invalidateQueries({ queryKey: ['ingredient-categories'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(api(`/admin/ingredient-categories/${id}`), { method: 'DELETE', credentials: 'include' })
        .then(r => r.json()),
    onSuccess: () => {
      toast.success('Categoría desactivada');
      qc.invalidateQueries({ queryKey: ['ingredient-categories'] });
    },
  });

  function CategoryForm({ value, onChange, onSave, onCancel, saving }: any) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
            <input
              type="text" value={value.name}
              onChange={e => onChange({ ...value, name: e.target.value })}
              placeholder="Carnes, Lácteos, Verduras..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Orden</label>
            <input
              type="number" value={value.sortOrder}
              onChange={e => onChange({ ...value, sortOrder: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2">Icono</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(icon => (
              <button
                key={icon}
                onClick={() => onChange({ ...value, icon })}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  value.icon === icon ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-900 hover:bg-gray-700'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => onChange({ ...value, color })}
                className={`w-8 h-8 rounded-full transition-all ${value.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        {/* Preview */}
        <div className="flex items-center gap-3 bg-gray-900 rounded-lg p-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${value.color}20` }}>
            {value.icon}
          </div>
          <span className="font-medium text-white">{value.name || 'Vista previa'}</span>
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
            <h1 className="text-2xl font-bold text-white">Categorías de ingredientes</h1>
            <p className="text-sm text-gray-400 mt-1">Organiza tus ingredientes por familia</p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              + Nueva categoría
            </button>
          )}
        </div>

        {creating && (
          <div className="mb-6">
            <CategoryForm
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
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📦</div>
            <p>Sin categorías. Crea la primera para organizar tus ingredientes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat.id}>
                {editing?.id === cat.id ? (
                  <CategoryForm
                    value={{ name: editing.name, color: editing.color, icon: editing.icon, sortOrder: String(editing.sortOrder) }}
                    onChange={(v: any) => setEditing({ ...editing, ...v })}
                    onSave={() => updateMutation.mutate({ ...editing })}
                    onCancel={() => setEditing(null)}
                    saving={updateMutation.isPending}
                  />
                ) : (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">{cat.name}</div>
                      <div className="text-xs text-gray-500">Orden: {cat.sortOrder}</div>
                    </div>
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(cat)}
                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(cat.id)}
                        className="px-3 py-1 bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 rounded-lg text-xs"
                      >
                        Archivar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

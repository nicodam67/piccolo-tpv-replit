import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StepProps, setupFetch, BASE } from '../setupUtils';

interface Printer { id: string; name: string; type: string; ip: string; port: number; active: boolean; }

export default function SetupImpresoras({ onNext, onBack, onSkip }: StepProps) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'ticket', brand: '', ip: '', port: 9100, paperWidth: 80 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setupFetch<Printer[] | { data: Printer[] }>('/api/admin/printers')
      .then((d) => {
        const list = Array.isArray(d) ? d : ((d as { data: Printer[] }).data ?? []);
        setPrinters(list);
      })
      .catch(() => setPrinters([]))
      .finally(() => setLoading(false));
  }, []);

  function setField(f: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
      setForm((prev) => ({ ...prev, [f]: v }));
    };
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const created = await setupFetch<Printer>('/api/admin/printers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setPrinters((p) => [...p, created]);
      setForm({ name: '', type: 'ticket', brand: '', ip: '', port: 9100, paperWidth: 80 });
      setShowForm(false);
      toast.success(`Impresora "${form.name}" añadida`);
    } catch (e: unknown) {
      toast.error('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const typeBadge = (t: string) => {
    const map: Record<string, string> = { ticket: '🧾', cocina: '👨‍🍳', barra: '🍺', etiqueta: '🏷️' };
    return map[t] ?? '🖨️';
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-100 mb-1">🖨️ Impresoras</h2>
      <p className="text-zinc-500 mb-6">Añade las impresoras del sistema: ticket de cliente, cocina, barra, etiquetas…</p>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 mb-6 text-sm text-amber-200/80">
        <strong>Ayuda:</strong> Conecta impresoras en red con su dirección IP. Puerto por defecto: 9100. Para impresoras USB, deja la IP vacía y configura el driver en el sistema operativo.
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm py-4">Cargando impresoras…</div>
      ) : printers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 mb-6">
          <p className="text-3xl mb-2">🖨️</p>
          <p>No hay impresoras configuradas.</p>
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          {printers.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <span>{typeBadge(p.type)}</span>
                <div>
                  <span className="text-zinc-200 font-medium">{p.name}</span>
                  {p.ip && <span className="text-xs text-zinc-500 ml-2">{p.ip}:{p.port}</span>}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${p.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                {p.active ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-zinc-200 mb-4">Nueva impresora</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Nombre <span className="text-amber-500">*</span></label>
              <input value={form.name} onChange={setField('name')} placeholder="Ej: Cocina, Barra, Caja"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Tipo</label>
              <select value={form.type} onChange={setField('type')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
                <option value="ticket">🧾 Ticket cliente</option>
                <option value="cocina">👨‍🍳 Cocina</option>
                <option value="barra">🍺 Barra</option>
                <option value="etiqueta">🏷️ Etiquetas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Marca / Modelo</label>
              <input value={form.brand} onChange={setField('brand')} placeholder="Ej: Epson TM-T88"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Dirección IP</label>
              <input value={form.ip} onChange={setField('ip')} placeholder="192.168.1.100"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Puerto TCP</label>
              <input value={form.port} onChange={setField('port')} type="number"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Ancho de papel</label>
              <select value={form.paperWidth} onChange={setField('paperWidth')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500">
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm disabled:opacity-60">
              {saving ? 'Añadiendo…' : 'Añadir impresora'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-sm mb-4">
          + Añadir impresora
        </button>
      )}

      <a href={`${BASE}/admin/impresoras`} target="_blank" rel="noreferrer"
        className="inline-flex text-amber-400 hover:text-amber-300 text-sm underline mt-2">
        Gestión avanzada de impresoras →
      </a>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
        <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm">← Anterior</button>
        <div className="flex gap-3">
          <button onClick={onSkip} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm">Omitir</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold rounded-lg text-sm">
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

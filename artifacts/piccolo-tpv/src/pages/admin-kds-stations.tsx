/**
 * admin-kds-stations.tsx
 * KDS station management — /admin/kds-stations
 * CRUD for named KDS displays: zone type, IP, display URL, last ping.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  Monitor, ArrowLeft, Plus, Pencil, Trash2, RefreshCw,
  Wifi, WifiOff, Loader2, ChevronDown, X, Save, Check,
  Server, Zap,
} from 'lucide-react';

import {
  useGetKdsStations,
  useCreateKdsStation,
  useUpdateKdsStation,
  useDeleteKdsStation,
  usePingKdsStation,
  type KdsStation,
} from '@workspace/api-client-react/phase1';
import { customFetch } from '@workspace/api-client-react';

const ZONE_COLORS: Record<string, string> = {
  cocina:      'text-orange-400 bg-orange-950/30 border-orange-800',
  pizza:       'text-red-400 bg-red-950/30 border-red-800',
  ensalada:    'text-green-400 bg-green-950/30 border-green-800',
  barra:       'text-blue-400 bg-blue-950/30 border-blue-800',
  pase:        'text-cyan-400 bg-cyan-950/30 border-cyan-800',
  sin_partida: 'text-muted-foreground bg-secondary border-border',
};

const EMPTY_FORM = {
  name: '', zoneType: 'cocina', ip: '', displayUrl: '', notes: '',
};

function fmtDate(d: string | null | undefined) {
  if (!d) return 'Nunca';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'Hace un momento';
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminKdsStations() {
  const [, setLocation] = useLocation();
  const { data: stations = [], isLoading: loading, refetch: load } = useGetKdsStations();
  const { data: departments = [] } = useQuery<Array<{ code: string; name: string }>>({
    queryKey: ['/api/production-departments'],
    queryFn: () => customFetch('/api/production-departments'),
  });
  const departmentLabels = Object.fromEntries(
    departments.map((department) => [department.code, department.name]),
  );
  const createStation = useCreateKdsStation();
  const updateStation = useUpdateKdsStation();
  const deleteStation = useDeleteKdsStation();
  const pingStation = usePingKdsStation();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<KdsStation | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); }
  function openEdit(s: KdsStation) {
    setEditing(s);
    setForm({ name: s.name, zoneType: s.zoneType, ip: s.ip, displayUrl: s.displayUrl ?? '', notes: s.notes ?? '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const body = { ...form, displayUrl: form.displayUrl || null, notes: form.notes || null };
      if (editing) {
        await updateStation.mutateAsync({ id: editing.id, data: body });
      } else {
        await createStation.mutateAsync({ data: body });
      }
      toast.success(editing ? 'Estación actualizada' : 'Estación creada');
      setShowModal(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Desactivar la estación "${name}"?`)) return;
    try {
      await deleteStation.mutateAsync({ id });
      toast.success('Estación desactivada');
      await load();
    } catch { toast.error('Error al desactivar'); }
  }

  async function handlePing(id: string) {
    setPinging(id);
    try {
      const d = await pingStation.mutateAsync({ id });
      toast[d.reachable ? 'success' : 'error'](
        d.reachable ? `Alcanzable · ${d.latencyMs}ms` : 'Sin respuesta',
      );
      await load();
    } finally { setPinging(null); }
  }

  const fld = (label: string, key: keyof typeof form, placeholder = '') => (
    <div>
      <label className="text-xs font-bold text-muted-foreground block mb-1">{label}</label>
      <input value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:border-cyan-500/60" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-card border-b border-border">
        <button onClick={() => setLocation('/admin')}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <Monitor size={18} className="text-cyan-400" />
        <h1 className="font-black text-base">Estaciones KDS</h1>
        <div className="flex-1" />
        <button onClick={() => void load()}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl transition-colors">
          <Plus size={13} /> Nueva estación
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && stations.length === 0 && (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
        )}
        {stations.length === 0 && !loading && (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            <Server size={28} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-sm">Sin estaciones KDS configuradas</p>
          </div>
        )}

        {stations.map(s => (
          <div key={s.id} className={`bg-card border rounded-xl p-4 ${!s.active ? 'opacity-50' : 'border-border'}`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">
                <Monitor size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm">{s.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ZONE_COLORS[s.zoneType] ?? ZONE_COLORS.sin_partida}`}>
                    {departmentLabels[s.zoneType] ?? s.zoneType}
                  </span>
                  {!s.active && <span className="text-[10px] text-red-400 border border-red-800 px-1.5 py-0.5 rounded-full">Inactiva</span>}
                </div>
                <div className="flex gap-4 mt-1 flex-wrap text-[11px] text-muted-foreground">
                  {s.ip && <span className="font-mono text-cyan-400/80">{s.ip}</span>}
                  {s.displayUrl && <span className="truncate max-w-[200px]">{s.displayUrl}</span>}
                  <span className="flex items-center gap-1">
                    {s.lastPingAt ? <Wifi size={9} className="text-green-400" /> : <WifiOff size={9} />}
                    {fmtDate(s.lastPingAt)}
                  </span>
                </div>
                {s.notes && <p className="text-[11px] text-muted-foreground italic mt-1">{s.notes}</p>}
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => handlePing(s.id)} disabled={pinging === s.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-secondary border border-border hover:bg-secondary/80 disabled:opacity-50 transition-colors">
                  {pinging === s.id ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                  Probar
                </button>
                <button onClick={() => openEdit(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-secondary border border-border hover:bg-secondary/80 transition-colors">
                  <Pencil size={10} /> Editar
                </button>
                <button onClick={() => handleDelete(s.id, s.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-red-400 border border-red-800 hover:bg-red-950/30 transition-colors">
                  <Trash2 size={10} /> Desactivar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowModal(false)}>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
          <div className="w-[360px] bg-card border-l border-border flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border">
              <Monitor size={16} className="text-cyan-400" />
              <h2 className="font-black text-sm flex-1">{editing ? 'Editar estación' : 'Nueva estación KDS'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {fld('Nombre *', 'name', 'KDS Cocina Principal')}

              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Zona</label>
                <div className="relative">
                  <select value={form.zoneType} onChange={e => setForm(f => ({ ...f, zoneType: e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none appearance-none pr-8">
                    {departments.map((department) => (
                      <option key={department.code} value={department.code}>{department.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {fld('Dirección IP', 'ip', '192.168.1.20')}
              {fld('URL de visualización', 'displayUrl', 'http://192.168.1.20:3000')}

              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} placeholder="Ubicación, modelo de pantalla…"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none resize-none" />
              </div>
            </div>

            <div className="p-4 border-t border-border">
              <button onClick={handleSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl disabled:opacity-60 transition-colors">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

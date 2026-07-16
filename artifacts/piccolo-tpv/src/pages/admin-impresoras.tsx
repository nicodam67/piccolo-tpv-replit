/**
 * admin-impresoras.tsx
 * Printer configuration screen — /admin/impresoras
 * Allows managers/admins to add, edit, delete and test thermal printers.
 * Also hosts the print mode selector (KDS only / printers only / both)
 * and the print template editor.
 */
import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import {
  Printer, Plus, Trash2, Edit2, Check, X as XIcon,
  ChevronLeft, Wifi, WifiOff, AlertCircle, HelpCircle,
  Settings, FileText, Zap
} from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

const api = (path: string, method = 'GET', body?: unknown) =>
  customFetch(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined });

const PRINTER_TYPES = [
  { value: 'cocina',   label: 'Cocina' },
  { value: 'pizza',    label: 'Pizza' },
  { value: 'ensalada', label: 'Ensaladas' },
  { value: 'barra',    label: 'Barra' },
  { value: 'postres',  label: 'Postres' },
  { value: 'caja',     label: 'Caja / Tickets' },
  { value: 'respaldo', label: 'Impresora de respaldo' },
];

const PRINT_MODES = [
  { value: 'kds_only',       label: 'Solo KDS',           desc: 'Sin impresión física. El KDS sigue funcionando.' },
  { value: 'printers_only',  label: 'Solo impresoras',    desc: 'Sin KDS. Solo impresión física.' },
  { value: 'both',           label: 'KDS + impresoras',   desc: 'Ambos sistemas activos simultáneamente.' },
];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  online:     { label: 'Conectada',        color: 'text-green-400',  icon: <Wifi size={14} /> },
  offline:    { label: 'Desconectada',     color: 'text-red-400',    icon: <WifiOff size={14} /> },
  paper_out:  { label: 'Sin papel',        color: 'text-yellow-400', icon: <AlertCircle size={14} /> },
  cover_open: { label: 'Tapa abierta',     color: 'text-yellow-400', icon: <AlertCircle size={14} /> },
  error:      { label: 'Error',            color: 'text-red-400',    icon: <AlertCircle size={14} /> },
  unknown:    { label: 'Estado desconocido', color: 'text-muted-foreground', icon: <HelpCircle size={14} /> },
};

interface Printer {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  ip: string;
  port: number;
  paperWidth: number;
  copies: number;
  active: boolean;
  isPrimary: boolean;
  fallbackPrinterId: string | null;
  lastStatus: string;
  lastStatusAt: string | null;
}

const EMPTY_FORM = {
  name: '', type: 'cocina', brand: '', model: '',
  ip: '', port: 9100, paperWidth: 80, copies: 1,
  active: true, isPrimary: true, fallbackPrinterId: '',
};

export default function AdminImpresoras() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState('kds_only');
  const [template, setTemplate] = useState({
    nombreComercial: '', datosFiscales: '', piePagina: '',
    mensajeAgradecimiento: '¡Gracias por su visita!', mostrarPrecios: false, headerExtra: '',
  });
  const [activeTab, setActiveTab] = useState<'printers' | 'mode' | 'template'>('printers');

  const load = async () => {
    try {
      const [ps, cfg] = await Promise.all([
        api('/api/admin/printers') as Promise<Printer[]>,
        api('/api/admin/print-config') as Promise<{ printMode: string; printTemplateConfig: any }>,
      ]);
      setPrinters(ps);
      setPrintMode(cfg.printMode ?? 'kds_only');
      if (cfg.printTemplateConfig) setTemplate(t => ({ ...t, ...cfg.printTemplateConfig }));
    } catch { toast.error('Error al cargar impresoras'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (p: Printer) => {
    setEditing(p);
    setForm({
      name: p.name, type: p.type, brand: p.brand, model: p.model,
      ip: p.ip, port: p.port, paperWidth: p.paperWidth, copies: p.copies,
      active: p.active, isPrimary: p.isPrimary,
      fallbackPrinterId: p.fallbackPrinterId ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const body = { ...form, fallbackPrinterId: form.fallbackPrinterId || null };
      if (editing) {
        await api(`/api/admin/printers/${editing.id}`, 'PATCH', body);
        toast.success('Impresora actualizada');
      } else {
        await api('/api/admin/printers', 'POST', body);
        toast.success('Impresora creada');
      }
      setShowModal(false);
      load();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Desactivar la impresora "${name}"?`)) return;
    try {
      await api(`/api/admin/printers/${id}`, 'DELETE');
      toast.success('Impresora desactivada');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await api(`/api/admin/printers/${id}/test`, 'POST');
      toast.success('Trabajo de prueba encolado — comprueba la cola de impresión');
    } catch { toast.error('Error al enviar prueba'); }
    finally { setTesting(null); }
  };

  const handleCheckStatus = async (id: string) => {
    setPolling(id);
    try {
      const res = await api(`/api/admin/printers/${id}/status`) as { status: string; simulated: boolean };
      const info = STATUS_LABELS[res.status] ?? STATUS_LABELS.unknown;
      toast.success(`Estado: ${info.label}${res.simulated ? ' (simulado)' : ''}`);
      load();
    } catch { toast.error('Error al consultar estado'); }
    finally { setPolling(null); }
  };

  const savePrintMode = async () => {
    try {
      await api('/api/admin/print-config', 'PATCH', { printMode });
      toast.success('Modo guardado');
    } catch { toast.error('Error al guardar'); }
  };

  const saveTemplate = async () => {
    try {
      await api('/api/admin/print-config', 'PATCH', { printTemplateConfig: template });
      toast.success('Plantilla guardada');
    } catch { toast.error('Error al guardar'); }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/admin">
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <ChevronLeft size={20} />
          </button>
        </Link>
        <Printer size={22} className="text-primary" />
        <h1 className="text-lg font-black">Impresoras</h1>
        <div className="ml-auto flex gap-2">
          {activeTab === 'printers' && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm">
              <Plus size={16} /> Nueva
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 pt-2 gap-1">
        {[
          { id: 'printers', label: 'Impresoras', icon: <Printer size={14} /> },
          { id: 'mode',     label: 'Modo',       icon: <Settings size={14} /> },
          { id: 'template', label: 'Plantilla',  icon: <FileText size={14} /> },
        ].map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">

        {/* ── Tab: Printers ── */}
        {activeTab === 'printers' && (
          <>
            {printers.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Printer size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No hay impresoras configuradas</p>
                <p className="text-sm mt-1">Añade una impresora para empezar</p>
              </div>
            )}
            {printers.map(p => {
              const statusInfo = STATUS_LABELS[p.lastStatus] ?? STATUS_LABELS.unknown;
              const typeLabel = PRINTER_TYPES.find(t => t.value === p.type)?.label ?? p.type;
              return (
                <div key={p.id} className={`bg-card border rounded-2xl p-4 space-y-3 ${!p.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Printer size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-base">{p.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-secondary rounded-full font-semibold">{typeLabel}</span>
                        {!p.active && <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full font-semibold">Inactiva</span>}
                        {!p.isPrimary && <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full font-semibold">Secundaria</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {p.ip ? `${p.ip}:${p.port}` : 'Sin IP'} · {p.paperWidth} mm · {p.copies} cop.
                        {p.brand && ` · ${p.brand}${p.model ? ` ${p.model}` : ''}`}
                      </p>
                    </div>
                    {/* Status badge */}
                    <div className={`flex items-center gap-1 text-xs font-semibold ${statusInfo.color}`}>
                      {statusInfo.icon}<span>{statusInfo.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={() => handleCheckStatus(p.id)} disabled={polling === p.id}
                      className="text-xs px-3 py-1.5 border rounded-lg font-semibold hover:bg-secondary transition-colors disabled:opacity-50">
                      {polling === p.id ? 'Consultando…' : 'Consultar estado'}
                    </button>
                    <button onClick={() => handleTest(p.id)} disabled={testing === p.id}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50">
                      <Zap size={12} />{testing === p.id ? 'Enviando…' : 'Probar impresión'}
                    </button>
                    <button onClick={() => openEdit(p)}
                      className="text-xs px-3 py-1.5 border rounded-lg font-semibold hover:bg-secondary transition-colors">
                      <Edit2 size={12} className="inline mr-1" />Editar
                    </button>
                    <button onClick={() => handleDelete(p.id, p.name)}
                      className="text-xs px-3 py-1.5 text-red-400 border border-red-500/20 rounded-lg font-semibold hover:bg-red-500/10 transition-colors">
                      <Trash2 size={12} className="inline mr-1" />Desactivar
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── Tab: Mode ── */}
        {activeTab === 'mode' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecciona cómo deben funcionar el KDS y las impresoras físicas.</p>
            {PRINT_MODES.map(m => (
              <button key={m.value} onClick={() => setPrintMode(m.value)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  printMode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    printMode === m.value ? 'border-primary bg-primary' : 'border-muted'
                  }`}>
                    {printMode === m.value && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="font-black text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                  </div>
                </div>
              </button>
            ))}
            <button onClick={savePrintMode}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-black">
              Guardar modo
            </button>
          </div>
        )}

        {/* ── Tab: Template ── */}
        {activeTab === 'template' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Personaliza la cabecera y pie de las comandas y tickets. Los datos fiscales obligatorios se conservarán siempre.
            </p>
            {[
              { key: 'nombreComercial', label: 'Nombre comercial', placeholder: 'Restaurante Piccolo' },
              { key: 'datosFiscales',   label: 'Datos fiscales',   placeholder: 'NIF: B12345678 · C/ Mayor 1, Madrid' },
              { key: 'piePagina',       label: 'Pie de página',    placeholder: 'www.piccolo.es' },
              { key: 'mensajeAgradecimiento', label: 'Mensaje de agradecimiento', placeholder: '¡Gracias por su visita!' },
              { key: 'headerExtra',     label: 'Texto extra en cabecera', placeholder: '' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-bold mb-1">{f.label}</label>
                <input
                  value={(template as any)[f.key]}
                  onChange={e => setTemplate(t => ({ ...t, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-mono"
                />
              </div>
            ))}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={template.mostrarPrecios}
                onChange={e => setTemplate(t => ({ ...t, mostrarPrecios: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <span className="text-sm font-semibold">Mostrar precios en comandas de cocina</span>
            </label>
            {/* ASCII preview */}
            <div className="bg-secondary/50 rounded-xl p-3 font-mono text-xs whitespace-pre leading-5 border border-border">
              {template.nombreComercial ? template.nombreComercial.toUpperCase() : '(nombre comercial)'}
              {'\n'}{'='.repeat(32)}
              {'\n'}{'COCINA — Mesa 4 (Terraza)'}
              {'\n'}{'CAMARERO: Carlos | 2 comens.'}
              {'\n'}{'='.repeat(32)}
              {'\n'}{'  2x Pizza Margherita'}
              {'\n'}{'  1x Ensalada César > sin cebolla'}
              {'\n'}{'='.repeat(32)}
              {'\n'}{template.piePagina || '(pie de página)'}
              {'\n'}{template.mensajeAgradecimiento}
            </div>
            <button onClick={saveTemplate}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-black">
              Guardar plantilla
            </button>
          </div>
        )}
      </div>

      {/* ── Modal: Create / Edit printer ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-black text-lg">{editing ? 'Editar impresora' : 'Nueva impresora'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-secondary"><XIcon size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm" placeholder="Cocina 1" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm">
                  {PRINTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Marca</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm" placeholder="Epson" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Modelo</label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm" placeholder="TM-T88V" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Dirección IP</label>
                  <input value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-mono" placeholder="192.168.1.100" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Puerto</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: +e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Ancho de papel</label>
                  <select value={form.paperWidth} onChange={e => setForm(f => ({ ...f, paperWidth: +e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm">
                    <option value={58}>58 mm</option>
                    <option value={80}>80 mm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Copias</label>
                  <input type="number" min={1} max={5} value={form.copies} onChange={e => setForm(f => ({ ...f, copies: +e.target.value }))}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm" />
                </div>
              </div>
              {/* Fallback printer */}
              <div>
                <label className="block text-sm font-bold mb-1">Impresora de respaldo</label>
                <select value={form.fallbackPrinterId ?? ''}
                  onChange={e => setForm(f => ({ ...f, fallbackPrinterId: e.target.value }))}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm">
                  <option value="">Sin respaldo</option>
                  {printers.filter(p => p.id !== editing?.id && p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-sm font-semibold">Activa</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isPrimary} onChange={e => setForm(f => ({ ...f, isPrimary: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-sm font-semibold">Principal</span>
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-border flex gap-2">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-secondary transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-black text-sm disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

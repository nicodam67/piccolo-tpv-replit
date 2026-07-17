import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  Monitor, Tablet, Wifi, WifiOff, Cable, CheckCircle2, XCircle, AlertCircle,
  Clock, Plus, Pencil, Trash2, Save, X, RefreshCw, ChevronDown, ChevronRight,
  Router as RouterIcon, Printer, BookOpen, AlertTriangle,
  Server, Database, Globe, Cpu, Network,
  ClipboardList, Zap, PlayCircle,
  MapPin, User, Lock,
  PhoneCall, Wrench, BatteryCharging,
  QrCode, FlaskConical, CheckSquare, Square, ShieldCheck, XOctagon,
  ArrowRight, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceCategory = 'main_computer' | 'tablet' | 'kds' | 'printer' | 'cash_drawer' | 'other';
type DeviceStatus = 'ready' | 'warning' | 'error' | 'pending' | 'offline';

interface InstallationDevice {
  id: string;
  name: string;
  tabletNumber: number | null;
  deviceCategory: DeviceCategory;
  brand: string;
  model: string;
  os: string;
  browser: string;
  ram: string;
  processor: string;
  diskSpace: string;
  appVersion: string;
  ipLocal: string;
  connectionType: 'cable' | 'wifi';
  usualEmployeeName: string;
  usualZone: string;
  paymentAllowed: boolean;
  offlineAuthorized: boolean;
  defaultPrinterId: string | null;
  mainPrinterAssociated: string;
  cashAssociated: string;
  status: DeviceStatus;
  notes: string;
  lastSyncAt: string | null;
}

interface NetworkEntry {
  id: string;
  name: string;
  ip: string;
  mac: string;
  deviceType: string;
  zone: string;
  status: string;
  lastConnectionAt: string | null;
  notes: string;
}

type SemaphoreStatus = 'ready' | 'warning' | 'pending' | 'error';

interface DiagnosisData {
  mainComputer: { status: SemaphoreStatus; name: string; ip: string };
  tablets: Array<{ id: string; name: string; number: number | null; status: SemaphoreStatus; ip: string; zone: string; paymentAllowed: boolean; offlineAuthorized: boolean; lastSyncAt: string | null }>;
  kds: Array<{ zone: string; label: string; status: SemaphoreStatus }>;
  printers: Record<string, { label: string; status: string }>;
  cash: { status: SemaphoreStatus; label: string; openSessions: number };
  network: { status: SemaphoreStatus; label: string };
  internet: { status: SemaphoreStatus; label: string };
  backup: { status: SemaphoreStatus; label: string };
  users: { status: SemaphoreStatus; label: string; count: number };
  offline: { status: SemaphoreStatus; label: string };
  billing: { status: SemaphoreStatus; label: string };
  summary: { totalDevices: number; readyDevices: number; pendingDevices: number; errorDevices: number };
}

interface ManualStep { id: number; text?: string; situation?: string; steps?: string[] }
interface Manual { id: string; type: string; title: string; steps: ManualStep[]; supportPhone: string; updatedAt: string }
interface SimStep { step: string; ok: boolean; error?: string }
interface SimSession { session: number; tableName: string; steps: SimStep[] }
interface SimResult { ok: boolean; sessionsRun: number; totalSteps: number; passedSteps: number; failedSteps: number; results: SimSession[]; summary: string; runAt: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'inventario',  label: 'Inventario',  icon: Monitor },
  { id: 'red',         label: 'Red',         icon: Network },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Zap },
  { id: 'asistente',   label: 'Asistente',   icon: PlayCircle },
  { id: 'manuales',    label: 'Manuales',    icon: BookOpen },
  { id: 'simulacion',  label: 'Simulación',  icon: FlaskConical },
  { id: 'qr',          label: 'QR Mesas',    icon: QrCode },
  { id: 'arquitectura',label: 'Arquitectura',icon: Server },
] as const;

type TabId = typeof TABS[number]['id'];

const STATUS_CONFIG: Record<SemaphoreStatus, { color: string; bg: string; border: string; label: string; Icon: typeof CheckCircle2 }> = {
  ready:   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Preparado',        Icon: CheckCircle2 },
  warning: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'Con advertencia', Icon: AlertCircle },
  pending: { color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   label: 'Pendiente',       Icon: Clock },
  error:   { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     label: 'Error',           Icon: XCircle },
};

// ─── Semaphore badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SemaphoreStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

// ─── Device form ──────────────────────────────────────────────────────────────
function DeviceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<InstallationDevice>;
  onSave: (d: Partial<InstallationDevice>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<InstallationDevice>>(initial);
  const set = (k: keyof InstallationDevice, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Nombre</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Tablet Sala 1" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Estado</label>
          <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.status ?? 'pending'} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">Pendiente</option>
            <option value="ready">Preparado</option>
            <option value="warning">Con advertencia</option>
            <option value="error">Error</option>
            <option value="offline">Desconectado</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">IP local</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" value={form.ipLocal ?? ''} onChange={(e) => set('ipLocal', e.target.value)} placeholder="192.168.1.x" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Conexión</label>
          <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.connectionType ?? 'wifi'} onChange={(e) => set('connectionType', e.target.value as 'cable' | 'wifi')}>
            <option value="wifi">Wi-Fi</option>
            <option value="cable">Cable (recomendado)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Marca y modelo</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={`${form.brand ?? ''} ${form.model ?? ''}`.trim()} onChange={(e) => { const parts = e.target.value.split(' '); set('brand', parts[0] ?? ''); set('model', parts.slice(1).join(' ')); }} placeholder="Samsung Galaxy Tab A9" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Sistema operativo</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.os ?? ''} onChange={(e) => set('os', e.target.value)} placeholder="Android 14 / Windows 11" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Navegador / PWA</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.browser ?? ''} onChange={(e) => set('browser', e.target.value)} placeholder="Chrome 124 / PWA instalada" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Zona habitual</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.usualZone ?? ''} onChange={(e) => set('usualZone', e.target.value)} placeholder="sala / terraza / todos" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Usuario habitual</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.usualEmployeeName ?? ''} onChange={(e) => set('usualEmployeeName', e.target.value)} placeholder="María García" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">RAM</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.ram ?? ''} onChange={(e) => set('ram', e.target.value)} placeholder="8 GB" />
        </div>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.paymentAllowed ?? false} onChange={(e) => set('paymentAllowed', e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-medium">Permite cobrar</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.offlineAuthorized ?? true} onChange={(e) => set('offlineAuthorized', e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-medium">Modo offline autorizado</span>
        </label>
      </div>
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Notas</label>
        <textarea className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Observaciones sobre este dispositivo..." />
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-secondary transition-colors">
          <X size={14} /> Cancelar
        </button>
        <button onClick={() => onSave(form)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-opacity">
          <Save size={14} /> Guardar
        </button>
      </div>
    </div>
  );
}

// ─── Device card ──────────────────────────────────────────────────────────────
function DeviceCard({ device, onEdit, onDelete }: { device: InstallationDevice; onEdit: () => void; onDelete: () => void }) {
  const status = (device.status as SemaphoreStatus) ?? 'pending';
  const cfg = STATUS_CONFIG[status];
  const isMain = device.deviceCategory === 'main_computer';

  return (
    <div className={`bg-card border rounded-xl p-5 space-y-3 ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
            {isMain ? <Monitor size={20} className={cfg.color} /> : <Tablet size={20} className={cfg.color} />}
          </div>
          <div>
            <p className="font-bold text-sm">{device.name}</p>
            <p className="text-xs text-muted-foreground">{device.brand} {device.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button onClick={onEdit} className="p-1.5 hover:bg-secondary rounded-lg transition-colors"><Pencil size={14} /></button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {device.ipLocal && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Network size={11} /> <span className="font-mono">{device.ipLocal}</span>
          </div>
        )}
        {device.connectionType && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {device.connectionType === 'cable' ? <Cable size={11} /> : <Wifi size={11} />}
            <span>{device.connectionType === 'cable' ? 'Cable' : 'Wi-Fi'}</span>
          </div>
        )}
        {device.os && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu size={11} /> <span className="truncate">{device.os}</span>
          </div>
        )}
        {device.usualZone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin size={11} /> <span>{device.usualZone}</span>
          </div>
        )}
        {device.usualEmployeeName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User size={11} /> <span>{device.usualEmployeeName}</span>
          </div>
        )}
        {device.lastSyncAt && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw size={11} /> <span>{new Date(device.lastSyncAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        )}
      </div>
      <div className="flex gap-3 text-xs">
        <span className={`flex items-center gap-1 ${device.paymentAllowed ? 'text-emerald-400' : 'text-muted-foreground'}`}>
          {device.paymentAllowed ? <Lock size={11} className="text-emerald-400" /> : <Lock size={11} />} Cobro
        </span>
        <span className={`flex items-center gap-1 ${device.offlineAuthorized ? 'text-blue-400' : 'text-muted-foreground'}`}>
          {device.offlineAuthorized ? <WifiOff size={11} /> : <Wifi size={11} />} Offline
        </span>
      </div>
    </div>
  );
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { id: 1,  label: 'Abrir enlace seguro',        short: 'Red',       desc: 'Conecta la tablet a la red Wi-Fi del restaurante y abre el enlace de la aplicación en el navegador.' },
  { id: 2,  label: 'Iniciar sesión como admin',  short: 'Login',     desc: 'Entra con las credenciales de administrador para registrar el dispositivo.' },
  { id: 3,  label: 'Registrar dispositivo',      short: 'Reg.',      desc: 'Ve a Administración → Dispositivos offline → Registrar y confirma la huella del dispositivo.' },
  { id: 4,  label: 'Asignar nombre',             short: 'Nombre',    desc: 'Pon el nombre exacto: "Tablet Sala 1", "Tablet Terraza 1", etc. Puedes modificarlo después.' },
  { id: 5,  label: 'Asignar zona',               short: 'Zona',      desc: 'Selecciona la zona habitual: sala, terraza, barra. El camarero podrá cambiarla si es necesario.' },
  { id: 6,  label: 'Asignar caja',               short: 'Caja',      desc: 'Vincula la tablet a la caja o terminal. Si solo hay una caja, se asigna automáticamente.' },
  { id: 7,  label: 'Asignar impresora',          short: 'Impr.',     desc: 'Selecciona la impresora predeterminada para tickets y comandas desde este dispositivo.' },
  { id: 8,  label: 'Activar modo offline',       short: 'Offln.',    desc: 'Habilita el modo offline en Administración → Dispositivos → Permisos → Modo offline autorizado.' },
  { id: 9,  label: 'Descargar datos básicos',    short: 'Sync',      desc: 'La aplicación descargará carta, mesas, empleados y configuración. Espera a que finalice la sincronización.' },
  { id: 10, label: 'Probar apertura de mesa',    short: 'Mesa',      desc: 'Abre una mesa de prueba desde la tablet para comprobar que el plano y las zonas se cargan correctamente.' },
  { id: 11, label: 'Probar envío de comanda',    short: 'KDS',       desc: 'Añade un artículo y envíalo a cocina. Comprueba que el KDS o la impresora de cocina lo reciben.' },
  { id: 12, label: 'Confirmar sincronización',   short: 'Final',     desc: 'Verifica en el panel de dispositivos que el estado es "Preparado" y la última sincronización es reciente.' },
];

// ─── Wizard progress hook (localStorage-backed, per device) ───────────────────
function useWizardProgress(deviceId: string | null) {
  const key = deviceId ? `piccolo_wizard_${deviceId}` : null;

  const read = (): number[] => {
    if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
  };

  const [completed, setCompletedState] = useState<number[]>(read);

  // Re-read when deviceId changes
  const [lastId, setLastId] = useState(deviceId);
  if (lastId !== deviceId) {
    setLastId(deviceId);
    setCompletedState(read());
  }

  const setCompleted = (fn: (prev: number[]) => number[]) => {
    setCompletedState(prev => {
      const next = fn(prev);
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  const toggle = (stepId: number) => {
    setCompleted(prev =>
      prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId]
    );
  };

  const reset = () => {
    setCompleted(() => []);
  };

  return { completed, toggle, reset };
}

// ─── Matrix view ──────────────────────────────────────────────────────────────
function MatrixView({
  tablets,
  onSelectDevice,
  onMarkReady,
}: {
  tablets: InstallationDevice[];
  onSelectDevice: (id: string) => void;
  onMarkReady?: (id: string, data: Partial<InstallationDevice>) => void;
}) {
  // Read all progress from localStorage at render time
  const allProgress: Record<string, number[]> = {};
  for (const t of tablets) {
    try {
      allProgress[t.id] = JSON.parse(localStorage.getItem(`piccolo_wizard_${t.id}`) ?? '[]');
    } catch {
      allProgress[t.id] = [];
    }
  }

  const totalSteps = WIZARD_STEPS.length;
  const readyCount = tablets.filter(t => t.status === 'ready').length;
  const doneCount  = tablets.filter(t => (allProgress[t.id]?.length ?? 0) === totalSteps).length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Tablets en total', value: tablets.length, color: 'text-foreground' },
          { label: 'Instalación completa', value: doneCount, color: 'text-amber-400' },
          { label: 'Estado: Preparada', value: readyCount, color: 'text-emerald-400' },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {tablets.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <Tablet size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="font-bold text-muted-foreground">No hay tablets registradas</p>
          <p className="text-sm text-muted-foreground mt-1">Crea los dispositivos en la pestaña Inventario primero.</p>
        </div>
      ) : (
        /* Scrollable matrix grid */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-4 py-3 font-bold text-muted-foreground w-40 sticky left-0 bg-secondary/30 z-10">Tablet</th>
                  {WIZARD_STEPS.map(s => (
                    <th key={s.id} title={s.label} className="px-1.5 py-3 font-bold text-muted-foreground text-center w-10 whitespace-nowrap">
                      <span className="block">{s.id}</span>
                      <span className="block text-[9px] font-normal opacity-60">{s.short}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-bold text-muted-foreground text-right w-32">Progreso</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {tablets.map((tablet, ri) => {
                  const prog = allProgress[tablet.id] ?? [];
                  const pct  = Math.round((prog.length / totalSteps) * 100);
                  const isReady = tablet.status === 'ready';
                  const isFullDone = prog.length === totalSteps;

                  return (
                    <tr
                      key={tablet.id}
                      className={`border-b border-border last:border-0 transition-colors ${ri % 2 === 1 ? 'bg-secondary/10' : ''} hover:bg-secondary/20`}
                    >
                      {/* Name + status */}
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                        <div className="flex items-center gap-2 min-w-0">
                          <Tablet size={13} className={isReady ? 'text-emerald-400' : 'text-muted-foreground'} />
                          <span className="font-semibold truncate max-w-[110px]" title={tablet.name}>{tablet.name}</span>
                        </div>
                        {tablet.usualZone && (
                          <span className="text-[10px] text-muted-foreground pl-5">{tablet.usualZone}</span>
                        )}
                      </td>

                      {/* Step cells */}
                      {WIZARD_STEPS.map(step => {
                        const done = prog.includes(step.id);
                        return (
                          <td key={step.id} className="px-1.5 py-3 text-center">
                            {done
                              ? <CheckCircle2 size={16} className="text-emerald-400 mx-auto" />
                              : <span className="block w-4 h-4 rounded-full border-2 border-border mx-auto" />
                            }
                          </td>
                        );
                      })}

                      {/* Progress bar */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 bg-secondary rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${isFullDone ? 'bg-emerald-500' : 'bg-primary'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`tabular-nums font-bold ${isFullDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {prog.length}/{totalSteps}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-xs">
                            <ShieldCheck size={12} /> Lista
                          </span>
                        ) : (
                          <button
                            onClick={() => onSelectDevice(tablet.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg font-bold hover:bg-primary hover:text-primary-foreground transition-colors ml-auto"
                          >
                            {isFullDone ? 'Revisar' : 'Instalar'} <ArrowRight size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single-device wizard ─────────────────────────────────────────────────────
function WizardTab({ device, onBack, onMarkReady }: {
  device: InstallationDevice;
  onBack: () => void;
  onMarkReady?: (id: string, data: Partial<InstallationDevice>) => void;
}) {
  const [currentStep, setCurrentStep] = useState(-1);
  const { completed, toggle } = useWizardProgress(device.id);

  const allDone = completed.length === WIZARD_STEPS.length;

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary transition-colors shrink-0"
        >
          <ChevronDown size={14} className="rotate-90" /> Resumen
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate">{device.name}</p>
          <p className="text-xs text-muted-foreground">{device.usualZone || 'Zona sin asignar'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums">{completed.length}/{WIZARD_STEPS.length}</p>
          <p className="text-xs text-muted-foreground">pasos</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 bg-secondary rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(completed.length / WIZARD_STEPS.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{Math.round((completed.length / WIZARD_STEPS.length) * 100)}%</span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {WIZARD_STEPS.map((step) => {
          const done = completed.includes(step.id);
          const active = currentStep === step.id - 1;
          return (
            <div
              key={step.id}
              className={`border rounded-xl overflow-hidden transition-all ${done ? 'border-emerald-500/30 bg-emerald-500/5' : active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}
            >
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={() => setCurrentStep(active ? -1 : step.id - 1)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(step.id); }}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border hover:border-primary'}`}
                >
                  {done ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">{step.id}</span>}
                </button>
                <span className={`font-semibold text-sm flex-1 ${done ? 'line-through text-muted-foreground' : ''}`}>{step.label}</span>
                {active ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
              </div>
              {active && (
                <div className="px-4 pb-4 pl-16">
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  <button
                    onClick={() => { toggle(step.id); setCurrentStep(step.id < 12 ? step.id : -1); }}
                    className="mt-3 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    {done ? 'Desmarcar' : 'Marcar como completado →'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion card */}
      {allDone && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 space-y-4">
          <div className="text-center">
            <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
            <p className="font-bold text-emerald-400 text-lg">{device.name} — instalación completada</p>
            <p className="text-sm text-muted-foreground mt-1">Todos los pasos completados. Márcala como Preparada para actualizar el inventario.</p>
          </div>
          {onMarkReady && device.status !== 'ready' && (
            <div className="flex justify-center">
              <button
                onClick={() => {
                  onMarkReady(device.id, { status: 'ready' });
                  toast.success(`${device.name} marcada como Preparada`);
                  onBack();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition-colors"
              >
                <ShieldCheck size={15} /> Marcar como Preparada
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Asistente tab (matrix + wizard) ─────────────────────────────────────────
function AsistenteTab({ devices, onMarkReady }: {
  devices: InstallationDevice[];
  onMarkReady?: (id: string, data: Partial<InstallationDevice>) => void;
}) {
  const tablets = devices.filter(d => d.deviceCategory === 'tablet')
    .sort((a, b) => (a.tabletNumber ?? 99) - (b.tabletNumber ?? 99));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Force re-render of matrix when returning so progress cells refresh from localStorage
  const [matrixKey, setMatrixKey] = useState(0);

  const selectedDevice = tablets.find(t => t.id === selectedId) ?? null;

  const handleBack = () => {
    setSelectedId(null);
    setMatrixKey(k => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-lg font-bold mb-1">Asistente de instalación</h3>
        <p className="text-sm text-muted-foreground">
          {selectedDevice
            ? `Instalando: ${selectedDevice.name} — sigue cada paso y márcalos al completarlos.`
            : 'Vista general de todas las tablets. Haz clic en "Instalar" para guiar la instalación de cada una.'}
        </p>
      </div>

      {selectedDevice ? (
        <WizardTab device={selectedDevice} onBack={handleBack} onMarkReady={onMarkReady} />
      ) : (
        <MatrixView
          key={matrixKey}
          tablets={tablets}
          onSelectDevice={setSelectedId}
          onMarkReady={onMarkReady}
        />
      )}
    </div>
  );
}

// ─── Manuals ──────────────────────────────────────────────────────────────────
function ChecklistSection({ title, icon: Icon, color, items }: { title: string; icon: typeof ClipboardList; color: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-secondary/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} />
        </div>
        <span className="font-bold flex-1">{title}</span>
        <span className="text-xs text-muted-foreground">{checked.filter(Boolean).length}/{items.length}</span>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-2">
          {items.map((item, i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer group">
              <button
                onClick={() => setChecked((prev) => { const n = [...prev]; n[i] = !n[i]; return n; })}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked[i] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border group-hover:border-primary'}`}
              >
                {checked[i] && <CheckCircle2 size={12} />}
              </button>
              <span className={`text-sm leading-relaxed ${checked[i] ? 'line-through text-muted-foreground' : ''}`}>{item}</span>
            </label>
          ))}
          <button
            onClick={() => setChecked(items.map(() => false))}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <RefreshCw size={11} /> Reiniciar lista
          </button>
        </div>
      )}
    </div>
  );
}

const APERTURA_DIARIA = [
  '1. Encender el router y esperar 2 minutos a que estabilice la red.',
  '2. Encender el ordenador principal.',
  '3. Comprobar conectividad a Internet (abrir cualquier web).',
  '4. Verificar que todas las impresoras están encendidas y en línea.',
  '5. Comprobar el estado de los KDS (deben mostrar "Sin comandas pendientes").',
  '6. Abrir la caja en la aplicación: Caja → Apertura de caja.',
  '7. Encender las tablets una por una y comprobar que se conectan a la red.',
  '8. Verificar que cada tablet muestra el nombre de usuario correcto.',
  '9. Realizar un pedido de prueba con un artículo sin precio (o cancelarlo).',
  '10. Confirmar que el estado del sistema es correcto en Administración → Diagnóstico.',
];

const CIERRE_DIARIO = [
  '1. Comprobar que no hay mesas abiertas sin cerrar.',
  '2. Comprobar que no hay pedidos pendientes de enviar o cobrar.',
  '3. Verificar que los KDS no tienen comandas pendientes.',
  '4. Cerrar la gestión de reparto si está activa.',
  '5. Realizar el arqueo de caja: Caja → Cierre de caja.',
  '6. Revisar las incidencias del día en Administración → Sistema.',
  '7. Generar el informe de cierre (Z-report) e imprimirlo si es necesario.',
  '8. Verificar o crear la copia de seguridad del día.',
  '9. Cerrar las sesiones de todos los empleados.',
  '10. Apagar las tablets y el ordenador principal (el router puede quedar encendido).',
];

const PLAN_EMERGENCIA: { situation: string; steps: string[] }[] = [
  {
    situation: 'Fallo de Internet',
    steps: [
      'Las tablets en modo offline siguen operando normalmente.',
      'Los KDS siguen funcionando en red local.',
      'Las impresoras siguen funcionando en red local.',
      'Al recuperar Internet, la sincronización es automática.',
      'Contactar al proveedor de Internet si el corte supera 30 minutos.',
    ],
  },
  {
    situation: 'Fallo de Wi-Fi',
    steps: [
      'Reiniciar el router (botón trasero, 10 segundos).',
      'Mientras, usar la tablet del encargado conectada por cable si es posible.',
      'Si no hay solución, tomar comandas en papel y registrarlas al recuperar.',
      'Al restaurar la red, sincronizar manualmente desde Administración → Dispositivos.',
    ],
  },
  {
    situation: 'Impresora no responde',
    steps: [
      'Comprobar que la impresora está encendida y en la red.',
      'En la app: Administración → Impresoras → Probar conexión.',
      'Activar la impresora alternativa configurada para esa zona.',
      'Si falla todo: imprimir el ticket desde el ordenador principal.',
    ],
  },
  {
    situation: 'KDS no muestra comandas',
    steps: [
      'Comprobar que el navegador del KDS está abierto y conectado.',
      'Recargar la página del KDS (F5 o ⌘R).',
      'Si hay error de conexión, verificar la IP y la red.',
      'Como alternativa, imprimir las comandas en la impresora de cocina.',
    ],
  },
  {
    situation: 'Tablet averiada',
    steps: [
      'El resto de tablets pueden cubrir la zona temporalmente.',
      'Reasignar el camarero a otra tablet disponible.',
      'Las mesas abiertas en la tablet averiada se pueden ver desde cualquier otra.',
      'Notificar al técnico para reparación o sustitución.',
    ],
  },
  {
    situation: 'Caja bloqueada',
    steps: [
      'Contactar al encargado: tiene permiso de reapertura.',
      'Desde el ordenador principal: Administración → Caja → Reabrir caja.',
      'Si hay bloqueo total, registrar cobros en papel y cuadrarlos al desbloquear.',
    ],
  },
  {
    situation: 'Corte eléctrico',
    steps: [
      'Comprobar SAI/batería si existe.',
      'Tomar comandas en papel durante el corte.',
      'Al restaurar la luz, esperar que todos los dispositivos arranquen.',
      'Verificar que el router y las impresoras han reiniciado correctamente.',
      'Sincronizar manualmente las tablets antes de continuar.',
    ],
  },
];

// ─── Offline sync checklist ────────────────────────────────────────────────────
const OFFLINE_SYNC_STEPS = [
  { id: 1, text: 'Asegúrate de que todos los dispositivos están sincronizados (sin pendientes en la cola).', check: 'Sin indicadores de cola pendiente en ninguna tablet.' },
  { id: 2, text: 'Desconecta el Wi-Fi del router o activa modo avión en la tablet de prueba.', check: 'Tablet muestra el banner "Sin conexión".' },
  { id: 3, text: 'Añade 2 artículos a una mesa desde la tablet en modo offline.', check: 'Los artículos se guardan y se muestra "Guardado localmente".' },
  { id: 4, text: 'Comprueba que el TPV continúa operando sin conexión.', check: 'No hay errores ni pantallas en blanco; la mesa se puede gestionar.' },
  { id: 5, text: 'Cierra o anota el pedido (sin cobrar) desde la tablet offline.', check: 'El pedido queda registrado localmente con estado "pendiente de sincronizar".' },
  { id: 6, text: 'Reconecta el Wi-Fi en la tablet.', check: 'El banner "Sin conexión" desaparece.' },
  { id: 7, text: 'Espera a que la tablet sincronice automáticamente (máximo 30 segundos).', check: 'Aparece la notificación "Sincronizado" o el indicador vuelve a verde.' },
  { id: 8, text: 'Verifica en el servidor que los artículos añadidos offline aparecen en el pedido de esa mesa.', check: 'Desde el ordenador principal: el pedido contiene los artículos añadidos offline.' },
  { id: 9, text: 'Confirma que no hay duplicados en la cola offline ni en el pedido del servidor.', check: 'Solo hay una entrada por artículo añadido; la cola offline está vacía.' },
];

function OfflineSyncChecklist() {
  const [checked, setChecked] = useState<boolean[]>(OFFLINE_SYNC_STEPS.map(() => false));
  const [open, setOpen] = useState(true);

  const toggle = (i: number) => setChecked(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  const done = checked.filter(Boolean).length;
  const allDone = done === OFFLINE_SYNC_STEPS.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${allDone ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
          {allDone ? <ShieldCheck size={20} /> : <WifiOff size={20} />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm">Prueba de sincronización offline (9 pasos)</p>
          <p className="text-xs text-muted-foreground mt-0.5">Verifica que las tablets operan sin conexión y se sincronizan correctamente al reconectar.</p>
        </div>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">{done}/{OFFLINE_SYNC_STEPS.length}</span>
        {open ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          <div className="w-full bg-secondary rounded-full h-1.5 mb-4">
            <div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${(done / OFFLINE_SYNC_STEPS.length) * 100}%` }} />
          </div>

          {OFFLINE_SYNC_STEPS.map((step, i) => {
            const ok = checked[i];
            return (
              <div key={step.id} className={`rounded-xl border p-4 transition-all ${ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggle(i)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${ok ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border hover:border-blue-400'}`}
                  >
                    {ok ? <CheckCircle2 size={13} /> : <span className="text-[10px] font-bold">{step.id}</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-relaxed ${ok ? 'line-through text-muted-foreground' : ''}`}>{step.text}</p>
                    <div className="mt-2 flex items-start gap-1.5">
                      <CheckSquare size={11} className="text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground italic">{step.check}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {allDone && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
              <ShieldCheck size={24} className="text-emerald-400 mx-auto mb-2" />
              <p className="font-bold text-emerald-400 text-sm">Prueba offline superada</p>
              <p className="text-xs text-muted-foreground mt-1">El modo offline y la sincronización funcionan correctamente.</p>
            </div>
          )}

          <button
            onClick={() => setChecked(OFFLINE_SYNC_STEPS.map(() => false))}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw size={11} /> Reiniciar prueba
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Simulation tab ────────────────────────────────────────────────────────────
function SimulacionTab() {
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  const runSimulation = async () => {
    setRunning(true);
    setResult(null);
    try {
      const data = await customFetch<SimResult>(`/api/admin/installation-simulation/run`, { method: 'POST' });
      setResult(data);
      if (data.ok) toast.success('Simulación completada: todos los pasos superados');
      else toast.warning('Simulación completada con advertencias');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <FlaskConical size={20} className="text-violet-400" /> Simulación de instalación coordinada
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Ejecuta 5 sesiones virtuales de forma simultánea para verificar que el flujo completo funciona:
          apertura de mesa → añadir artículos → envío a cocina (KDS) → marcar listo → cobrar.
          Todos los registros creados son marcados como <strong>demo</strong> y pueden eliminarse en "Datos de demostración".
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runSimulation}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {running ? <RefreshCw size={16} className="animate-spin" /> : <FlaskConical size={16} />}
            {running ? 'Ejecutando simulación…' : 'Ejecutar simulación completa'}
          </button>
          {result && (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${result.ok ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'}`}>
              {result.ok ? '✓ Todo OK' : '⚠ Con advertencias'}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className={`rounded-xl p-5 border ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
            <p className={`font-bold ${result.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{result.summary}</p>
            <div className="mt-3 grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Sesiones', value: result.sessionsRun },
                { label: 'Pasos totales', value: result.totalSteps },
                { label: 'Superados', value: result.passedSteps, color: 'text-emerald-400' },
                { label: 'Fallidos', value: result.failedSteps, color: result.failedSteps > 0 ? 'text-red-400' : 'text-muted-foreground' },
              ].map(s => (
                <div key={s.label}>
                  <p className={`text-2xl font-black ${s.color ?? ''}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Ejecutado: {new Date(result.runAt).toLocaleString('es-ES')} · Todos los registros marcados como demo (is_demo: true)
            </p>
          </div>

          {/* Per-session results */}
          <div className="space-y-3">
            {result.results.map((session) => {
              const allOk = session.steps.every(s => s.ok);
              return (
                <div key={session.session} className={`rounded-xl border overflow-hidden ${allOk ? 'border-emerald-500/20' : 'border-amber-500/20'}`}>
                  <div className={`px-4 py-3 flex items-center gap-3 ${allOk ? 'bg-emerald-500/5' : 'bg-amber-500/5'}`}>
                    {allOk
                      ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                      : <AlertCircle size={15} className="text-amber-400 shrink-0" />}
                    <span className="font-bold text-sm flex-1">Sesión {session.session} — {session.tableName}</span>
                    <span className="text-xs text-muted-foreground">{session.steps.filter(s => s.ok).length}/{session.steps.length} pasos OK</span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {session.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {step.ok
                          ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                          : <XOctagon size={12} className="text-red-400 shrink-0" />}
                        <span className={step.ok ? 'text-muted-foreground' : 'text-red-300 font-medium'}>{step.step}</span>
                        {step.error && <span className="text-red-400 text-[10px] ml-auto font-mono truncate max-w-[200px]" title={step.error}>{step.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!result && !running && (
        <div className="text-center py-12 text-muted-foreground">
          <FlaskConical size={40} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">Pulsa el botón para ejecutar la simulación.</p>
          <p className="text-xs mt-1 opacity-60">Se crearán hasta 5 pedidos demo sobre las primeras mesas disponibles.</p>
        </div>
      )}
    </div>
  );
}

// ─── DB-backed manuals tab ─────────────────────────────────────────────────────
// ─── Emergency scenarios editor ───────────────────────────────────────────────
interface EmergenciaScenario { id: number; situation: string; steps: string[] }

function EditableEmergencia({ manual, onSave, saving }: {
  manual: Manual;
  onSave: (steps: ManualStep[]) => void;
  saving: boolean;
}) {
  const [scenarios, setScenarios] = useState<EmergenciaScenario[]>(
    () => (manual.steps as any[]).map(s => ({
      id: s.id ?? Math.random(),
      situation: s.situation ?? '',
      steps: Array.isArray(s.steps) ? s.steps : [],
    }))
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Reset local state if manual is refetched
  const prevUpdatedAt = manual.updatedAt;
  const [lastSeen, setLastSeen] = useState(prevUpdatedAt);
  if (lastSeen !== prevUpdatedAt && editingId === null) {
    setLastSeen(prevUpdatedAt);
    setScenarios((manual.steps as any[]).map(s => ({
      id: s.id ?? Math.random(),
      situation: s.situation ?? '',
      steps: Array.isArray(s.steps) ? s.steps : [],
    })));
    setHasUnsaved(false);
  }

  const markDirty = () => setHasUnsaved(true);

  const updateScenario = (id: number, patch: Partial<EmergenciaScenario>) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    markDirty();
  };

  const addScenario = () => {
    const newId = Date.now();
    setScenarios(prev => [...prev, { id: newId, situation: 'Nueva situación', steps: ['Primer paso'] }]);
    setEditingId(newId);
    setExpandedId(newId);
    markDirty();
  };

  const deleteScenario = (id: number) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
    if (expandedId === id) setExpandedId(null);
    markDirty();
  };

  const addStep = (id: number) => {
    updateScenario(id, {
      steps: [...(scenarios.find(s => s.id === id)?.steps ?? []), ''],
    });
  };

  const updateStep = (scenarioId: number, stepIdx: number, text: string) => {
    const sc = scenarios.find(s => s.id === scenarioId);
    if (!sc) return;
    const newSteps = [...sc.steps];
    newSteps[stepIdx] = text;
    updateScenario(scenarioId, { steps: newSteps });
  };

  const deleteStep = (scenarioId: number, stepIdx: number) => {
    const sc = scenarios.find(s => s.id === scenarioId);
    if (!sc || sc.steps.length <= 1) return;
    updateScenario(scenarioId, { steps: sc.steps.filter((_, i) => i !== stepIdx) });
  };

  const handleSave = () => {
    onSave(scenarios.map((s, i) => ({ id: i + 1, situation: s.situation, steps: s.steps } as any)));
    setEditingId(null);
    setHasUnsaved(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 text-red-400 shrink-0">
          <AlertTriangle size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold">{manual.title}</p>
          <p className="text-xs text-muted-foreground">
            Protocolo para situaciones de fallo — actualizado {new Date(manual.updatedAt).toLocaleDateString('es-ES')}
          </p>
        </div>
        {hasUnsaved && (
          <span className="text-xs text-amber-400 font-semibold shrink-0">Cambios sin guardar</span>
        )}
      </div>

      {/* Scenarios list */}
      <div className="p-5 space-y-3">
        {scenarios.map((sc) => {
          const isEditing = editingId === sc.id;
          const isExpanded = expandedId === sc.id || isEditing;

          return (
            <div key={sc.id} className={`border rounded-xl overflow-hidden transition-all ${isEditing ? 'border-primary/50' : 'border-border'}`}>
              {/* Scenario header row */}
              <div
                className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none ${isEditing ? 'bg-primary/5' : 'bg-secondary/30 hover:bg-secondary/50'} transition-colors`}
                onClick={() => !isEditing && setExpandedId(isExpanded ? null : sc.id)}
              >
                <AlertCircle size={14} className="text-amber-400 shrink-0" />
                {isEditing ? (
                  <input
                    value={sc.situation}
                    onChange={e => updateScenario(sc.id, { situation: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Nombre de la situación"
                  />
                ) : (
                  <span className="font-bold text-sm flex-1 truncate">{sc.situation}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {!isEditing && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(sc.id); setExpandedId(sc.id); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar escenario"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); deleteScenario(sc.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Eliminar escenario"
                  >
                    <Trash2 size={13} />
                  </button>
                  {!isEditing && (
                    isExpanded
                      ? <ChevronDown size={14} className="text-muted-foreground" />
                      : <ChevronRight size={14} className="text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Steps */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 space-y-2">
                  {isEditing ? (
                    <>
                      {sc.steps.map((step, si) => (
                        <div key={si} className="flex items-start gap-2">
                          <span className="text-xs font-bold text-muted-foreground pt-2 w-5 shrink-0">{si + 1}.</span>
                          <textarea
                            value={step}
                            onChange={e => updateStep(sc.id, si, e.target.value)}
                            rows={2}
                            className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={`Paso ${si + 1}`}
                          />
                          <button
                            onClick={() => deleteStep(sc.id, si)}
                            disabled={sc.steps.length <= 1}
                            className="mt-1 p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 disabled:opacity-30 transition-colors"
                            title="Eliminar paso"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addStep(sc.id)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                      >
                        <Plus size={12} /> Añadir paso
                      </button>
                      <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-border">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary"
                        >
                          <X size={12} /> Cerrar edición
                        </button>
                      </div>
                    </>
                  ) : (
                    <ul className="space-y-1.5">
                      {sc.steps.map((step, si) => (
                        <li key={si} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary font-bold shrink-0">{si + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add scenario + Save row */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={addScenario}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus size={14} /> Añadir escenario
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsaved}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualesTabDB() {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
  const qc = useQueryClient();

  const manualesQ = useQuery<Manual[]>({
    queryKey: ['installation-manuals'],
    queryFn: () => customFetch<Manual[]>(`/api/admin/installation/manuals`),
  });

  const updateManual = useMutation({
    mutationFn: ({ type, steps, supportPhone }: { type: string; steps: ManualStep[]; supportPhone?: string }) =>
      customFetch<Manual>(`/api/admin/installation/manuals/${type}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, supportPhone }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-manuals'] }); toast.success('Manual guardado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (manualesQ.isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><RefreshCw size={20} className="animate-spin mr-2" /> Cargando manuales…</div>;

  const manuals = manualesQ.data ?? [];
  const apertura  = manuals.find(m => m.type === 'apertura');
  const cierre    = manuals.find(m => m.type === 'cierre');
  const emergencia = manuals.find(m => m.type === 'emergencia');

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-bold text-lg mb-1">Manuales operativos</h2>
        <p className="text-sm text-muted-foreground">Procedimientos de apertura, cierre y emergencias. Los pasos se pueden editar y se guardan en la base de datos.</p>
      </div>

      {/* Apertura */}
      {apertura && (
        <EditableChecklist
          manual={apertura}
          icon={BatteryCharging}
          color="bg-emerald-500/10 text-emerald-400"
          onSave={(steps) => updateManual.mutate({ type: 'apertura', steps })}
          saving={updateManual.isPending}
        />
      )}

      {/* Cierre */}
      {cierre && (
        <EditableChecklist
          manual={cierre}
          icon={Lock}
          color="bg-blue-500/10 text-blue-400"
          onSave={(steps) => updateManual.mutate({ type: 'cierre', steps })}
          saving={updateManual.isPending}
        />
      )}

      {/* Emergencia — fully editable scenarios */}
      {emergencia && (
        <EditableEmergencia
          manual={emergencia}
          onSave={(steps) => updateManual.mutate({ type: 'emergencia', steps })}
          saving={updateManual.isPending}
        />
      )}

      {/* Contact box */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-500/10 text-violet-400">
            <PhoneCall size={20} />
          </div>
          <h3 className="font-bold">Contactos de soporte</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Soporte técnico TPV', value: '' },
            { label: 'Técnico impresoras', value: '' },
            { label: 'Proveedor Internet', value: '' },
            { label: 'Electricista de guardia', value: '' },
          ].map((c) => (
            <div key={c.label} className="flex items-center gap-3 bg-secondary/30 rounded-lg px-3 py-2.5">
              <PhoneCall size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground flex-1">{c.label}</span>
              <span className="font-mono text-xs text-muted-foreground italic">{c.value || 'Sin configurar'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditableChecklist({ manual, icon: Icon, color, onSave, saving }: {
  manual: Manual; icon: typeof BatteryCharging; color: string;
  onSave: (steps: ManualStep[]) => void; saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [steps, setSteps] = useState<ManualStep[]>(manual.steps);
  const [checked, setChecked] = useState<boolean[]>(manual.steps.map(() => false));

  const editStep = (i: number, text: string) => setSteps(prev => {
    const n = [...prev];
    n[i] = { ...n[i], text };
    return n;
  });

  const handleSave = () => { onSave(steps); setEditMode(false); };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-secondary/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} />
        </div>
        <span className="font-bold flex-1">{manual.title}</span>
        <span className="text-xs text-muted-foreground mr-2">{checked.filter(Boolean).length}/{steps.length}</span>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2">
          {!editMode ? (
            <>
              {steps.map((item, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer group">
                  <button
                    onClick={() => setChecked(prev => { const n = [...prev]; n[i] = !n[i]; return n; })}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked[i] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border group-hover:border-primary'}`}
                  >
                    {checked[i] && <CheckCircle2 size={12} />}
                  </button>
                  <span className={`text-sm leading-relaxed ${checked[i] ? 'line-through text-muted-foreground' : ''}`}>{item.text}</span>
                </label>
              ))}
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setChecked(steps.map(() => false))} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw size={11} /> Reiniciar
                </button>
                <button onClick={() => { setSteps(manual.steps); setEditMode(true); }} className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
                  <Pencil size={11} /> Editar pasos
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">Edita el texto de cada paso:</p>
              {steps.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-muted-foreground pt-2 w-5 shrink-0">{i + 1}.</span>
                  <textarea
                    value={item.text ?? ''}
                    onChange={e => editStep(i, e.target.value)}
                    rows={2}
                    className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
              <div className="flex gap-2 justify-end mt-3">
                <button onClick={() => setEditMode(false)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary">
                  <X size={12} /> Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-60">
                  <Save size={12} /> Guardar cambios
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Architecture diagram ─────────────────────────────────────────────────────
function ArchitecturaTab() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-1">Arquitectura del sistema</h3>
        <p className="text-sm text-muted-foreground">Visión general de todos los componentes del TPV Piccolo en Piccolo La Ràpita.</p>
      </div>

      {/* Diagram */}
      <div className="bg-card border border-border rounded-xl p-6 overflow-x-auto">
        <div className="min-w-[640px] space-y-8">
          {/* Row 1: Internet */}
          <div className="flex justify-center">
            <ArchNode icon={Globe} label="Internet / Cloud" sub="Replit · VeriFactu · Backup S3" color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/30" />
          </div>
          <div className="flex justify-center">
            <div className="w-px h-6 bg-border" />
          </div>
          {/* Row 2: Server */}
          <div className="flex justify-center">
            <ArchNode icon={Server} label="API Server (Node.js)" sub="Express · Drizzle ORM · Socket.IO" color="text-violet-400" bg="bg-violet-500/10" border="border-violet-500/30" />
          </div>
          <div className="flex justify-center">
            <div className="w-px h-6 bg-border" />
          </div>
          {/* Row 3: Database */}
          <div className="flex justify-center">
            <ArchNode icon={Database} label="Base de datos PostgreSQL" sub="Replit Managed DB · Backups automáticos" color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/30" />
          </div>
          <div className="flex justify-center">
            <div className="w-px h-6 bg-border" />
          </div>

          {/* Row 4: Router (LAN) */}
          <div className="flex flex-col items-center">
            <ArchNode icon={RouterIcon} label="Router LAN" sub="Red local · Wi-Fi · Cable" color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/30" />
          </div>

          {/* Row 5: all LAN devices */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ArchNode icon={Monitor} label="Ordenador principal" sub="Admin · Caja · Facturación" color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/30" small />
            <div className="space-y-2">
              {['Tablet Sala 1', 'Tablet Sala 2', 'Tablet Sala 3', 'Tablet Terraza 1', 'Tablet Encargado'].map((t) => (
                <div key={t} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5">
                  <Tablet size={14} className="text-blue-400 shrink-0" />
                  <span className="text-xs font-medium truncate">{t}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {['KDS Cocina', 'KDS Pizza', 'KDS Ensaladas', 'KDS Barra', 'KDS Expedición'].map((k) => (
                <div key={k} className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                  <Monitor size={14} className="text-red-400 shrink-0" />
                  <span className="text-xs font-medium truncate">{k}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {['Impresora principal', 'Impresora cocina', 'Impresora pizza', 'Impresora ensaladas', 'Impresora barra'].map((p) => (
                <div key={p} className="flex items-center gap-2 bg-slate-500/10 border border-slate-500/20 rounded-lg px-3 py-1.5">
                  <Printer size={14} className="text-slate-400 shrink-0" />
                  <span className="text-xs font-medium truncate">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Components table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="font-bold text-sm">Componentes del sistema</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="px-4 py-2 text-left font-bold text-xs text-muted-foreground">Componente</th>
              <th className="px-4 py-2 text-left font-bold text-xs text-muted-foreground">Tecnología</th>
              <th className="px-4 py-2 text-left font-bold text-xs text-muted-foreground">Función</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ['Backend API', 'Node.js / Express', 'Gestión de pedidos, pagos, usuarios'],
              ['Base de datos', 'PostgreSQL (Replit)', 'Persistencia de todos los datos'],
              ['Frontend TPV', 'React + Vite (PWA)', 'Interfaz de camareros y administración'],
              ['KDS', 'Navegador en pantalla', 'Pantalla de cocina en tiempo real'],
              ['Sincronización', 'Socket.IO', 'Actualizaciones en tiempo real entre dispositivos'],
              ['Modo offline', 'Cola local + sync', 'Operación sin Internet con reconciliación'],
              ['Impresión', 'Servicio de red local', 'Comandas y tickets por zona'],
              ['Copias de seguridad', 'Backup Worker + destino', 'Copia automática de la BD cada hora'],
              ['Carta QR', 'Dominio público', 'Carta digital accesible por QR de mesa'],
            ].map(([comp, tech, func]) => (
              <tr key={comp} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-2.5 font-medium">{comp}</td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{tech}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{func}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchNode({ icon: Icon, label, sub, color, bg, border, small = false }: { icon: typeof Monitor; label: string; sub: string; color: string; bg: string; border: string; small?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 text-center ${bg} ${border} ${small ? 'text-xs' : ''}`}>
      <Icon size={small ? 18 : 24} className={`mx-auto mb-2 ${color}`} />
      <p className={`font-bold ${small ? 'text-xs' : 'text-sm'}`}>{label}</p>
      <p className={`text-muted-foreground ${small ? 'text-[10px]' : 'text-xs'} mt-0.5`}>{sub}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminInstalacion() {
  const [activeTab, setActiveTab] = useState<TabId>('inventario');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [showNewNetwork, setShowNewNetwork] = useState(false);
  const [editingNetworkId, setEditingNetworkId] = useState<string | null>(null);

  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  const devicesQ = useQuery<InstallationDevice[]>({
    queryKey: ['installation-devices'],
    queryFn: () => customFetch<InstallationDevice[]>(`/api/admin/installation/devices`),
  });

  const networkQ = useQuery<NetworkEntry[]>({
    queryKey: ['installation-network'],
    queryFn: () => customFetch<NetworkEntry[]>(`/api/admin/installation/network`),
  });

  const diagnosisQ = useQuery<DiagnosisData>({
    queryKey: ['installation-diagnosis'],
    queryFn: () => customFetch<DiagnosisData>(`/api/admin/installation/diagnosis`),
    enabled: activeTab === 'diagnostico',
    refetchInterval: 30_000,
  });

  const seedMutation = useMutation({
    mutationFn: () => customFetch(`/api/admin/installation/seed`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); toast.success('Dispositivos iniciales creados'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDevice = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: Partial<InstallationDevice> }) => {
      const url = id ? `/api/admin/installation/devices/${id}` : `/api/admin/installation/devices`;
      return customFetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); setEditingId(null); setShowNewDevice(false); toast.success('Dispositivo guardado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      await customFetch(`/api/admin/installation/devices/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); toast.success('Dispositivo eliminado'); },
    onError: () => toast.error('Error eliminando dispositivo'),
  });

  const saveNetwork = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: Partial<NetworkEntry> }) => {
      const url = id ? `/api/admin/installation/network/${id}` : `/api/admin/installation/network`;
      return customFetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-network'] }); setEditingNetworkId(null); setShowNewNetwork(false); toast.success('Entrada de red guardada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNetwork = useMutation({
    mutationFn: async (id: string) => {
      await customFetch(`/api/admin/installation/network/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-network'] }); toast.success('Entrada eliminada'); },
  });

  const devices = devicesQ.data ?? [];
  const mainComputers = devices.filter((d) => d.deviceCategory === 'main_computer');
  const tablets = devices.filter((d) => d.deviceCategory === 'tablet').sort((a, b) => (a.tabletNumber ?? 99) - (b.tabletNumber ?? 99));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Wrench size={22} className="text-primary" />
              Instalación · Piccolo La Ràpita
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Gestión de hardware, red, diagnóstico y manuales operativos</p>
          </div>
          <div className="flex items-center gap-2">
            {devices.length === 0 && (
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Plus size={15} /> Crear dispositivos iniciales
              </button>
            )}
            <button
              onClick={() => qc.invalidateQueries()}
              className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors"
              title="Actualizar"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 pb-0 flex overflow-x-auto hide-scrollbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── INVENTARIO ── */}
        {activeTab === 'inventario' && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total', value: devices.length, color: 'text-foreground' },
                { label: 'Preparados', value: devices.filter((d) => d.status === 'ready').length, color: 'text-emerald-400' },
                { label: 'Pendientes', value: devices.filter((d) => d.status === 'pending').length, color: 'text-amber-400' },
                { label: 'Con error', value: devices.filter((d) => d.status === 'error' || d.status === 'offline').length, color: 'text-red-400' },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Main computer */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Ordenador principal</h2>
                <button onClick={() => setShowNewDevice(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Plus size={13} /> Añadir
                </button>
              </div>
              {mainComputers.length === 0 && !showNewDevice && (
                <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-6 text-center">
                  No hay ordenador principal registrado.
                </p>
              )}
              {mainComputers.map((d) =>
                editingId === d.id
                  ? <DeviceForm key={d.id} initial={d} onSave={(data) => saveDevice.mutate({ id: d.id, data })} onCancel={() => setEditingId(null)} />
                  : <DeviceCard key={d.id} device={d} onEdit={() => setEditingId(d.id)} onDelete={() => deleteDevice.mutate(d.id)} />
              )}
            </div>

            {/* Tablets */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Tablets TPV ({tablets.length}/5)</h2>
                <button onClick={() => setShowNewDevice(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Plus size={13} /> Añadir tablet
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tablets.map((d) =>
                  editingId === d.id
                    ? <DeviceForm key={d.id} initial={d} onSave={(data) => saveDevice.mutate({ id: d.id, data })} onCancel={() => setEditingId(null)} />
                    : <DeviceCard key={d.id} device={d} onEdit={() => setEditingId(d.id)} onDelete={() => deleteDevice.mutate(d.id)} />
                )}
              </div>
            </div>

            {/* New device form */}
            {showNewDevice && (
              <div>
                <h3 className="font-bold text-sm mb-3">Nuevo dispositivo</h3>
                <DeviceForm
                  initial={{ deviceCategory: 'tablet', status: 'pending', paymentAllowed: false, offlineAuthorized: true }}
                  onSave={(data) => saveDevice.mutate({ id: null, data })}
                  onCancel={() => setShowNewDevice(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── RED ── */}
        {activeTab === 'red' && (
          <div className="space-y-6">
            {/* Recommendations */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex gap-4">
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-amber-400 mb-1">Recomendaciones de red</p>
                <p className="text-muted-foreground">Se recomienda <strong>conexión por cable</strong> para: ordenador principal, impresoras de red, KDS fijos y equipos críticos. Las tablets pueden usar Wi-Fi pero deben tener señal estable.</p>
              </div>
            </div>

            {/* Network table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-sm">Registro de IPs y dispositivos</h3>
                <button onClick={() => setShowNewNetwork(true)} className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors">
                  <Plus size={13} /> Añadir dispositivo
                </button>
              </div>
              {networkQ.data && networkQ.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground">Nombre</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground font-mono">IP</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground">Tipo</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground">Zona</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground">Estado</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-muted-foreground">Última conexión</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {networkQ.data.map((entry) =>
                        editingNetworkId === entry.id ? (
                          <tr key={entry.id}>
                            <td colSpan={7} className="p-4">
                              <NetworkEntryForm
                                initial={entry}
                                onSave={(data) => saveNetwork.mutate({ id: entry.id, data })}
                                onCancel={() => setEditingNetworkId(null)}
                              />
                            </td>
                          </tr>
                        ) : (
                          <tr key={entry.id} className={`hover:bg-secondary/20 transition-colors ${entry.status === 'conflict' ? 'bg-red-500/5' : ''}`}>
                            <td className="px-4 py-2.5 font-medium">{entry.name}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{entry.ip}</td>
                            <td className="px-4 py-2.5 text-muted-foreground capitalize">{entry.deviceType}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{entry.zone || '—'}</td>
                            <td className="px-4 py-2.5">
                              {entry.status === 'conflict'
                                ? <span className="text-xs font-bold text-red-400 flex items-center gap-1"><AlertCircle size={11} /> IP duplicada</span>
                                : <span className="text-xs text-muted-foreground">{entry.status}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {entry.lastConnectionAt ? new Date(entry.lastConnectionAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setEditingNetworkId(entry.id)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors"><Pencil size={13} /></button>
                                <button onClick={() => deleteNetwork.mutate(entry.id)} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">No hay dispositivos de red registrados.</p>
              )}
            </div>

            {showNewNetwork && (
              <div>
                <h3 className="font-bold text-sm mb-3">Nuevo dispositivo de red</h3>
                <NetworkEntryForm
                  initial={{}}
                  onSave={(data) => saveNetwork.mutate({ id: null, data })}
                  onCancel={() => setShowNewNetwork(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── DIAGNÓSTICO ── */}
        {activeTab === 'diagnostico' && (
          <div className="space-y-6">
            {/* "Comprobar todo ahora" header bar */}
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <Zap size={18} className="text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-sm">Panel de diagnóstico</p>
                <p className="text-xs text-muted-foreground">Semáforo de instalación en tiempo real — actualización automática cada 30 s</p>
              </div>
              <button
                onClick={() => diagnosisQ.refetch()}
                disabled={diagnosisQ.isFetching}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={13} className={diagnosisQ.isFetching ? 'animate-spin' : ''} />
                Comprobar todo ahora
              </button>
            </div>

            {diagnosisQ.isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground"><RefreshCw size={24} className="animate-spin mr-3" /> Analizando instalación...</div>
            ) : diagnosisQ.data ? (
              <DiagnosisPanel data={diagnosisQ.data} onRefresh={() => diagnosisQ.refetch()} />
            ) : (
              <p className="text-center text-muted-foreground py-10">No se pudo cargar el diagnóstico.</p>
            )}

            {/* Offline sync test checklist */}
            <OfflineSyncChecklist />
          </div>
        )}

        {/* ── ASISTENTE ── */}
        {activeTab === 'asistente' && <AsistenteTab devices={devices} onMarkReady={(id, data) => saveDevice.mutate({ id, data })} />}

        {/* ── MANUALES ── */}
        {activeTab === 'manuales' && <ManualesTabDB />}

        {/* ── SIMULACIÓN ── */}
        {activeTab === 'simulacion' && <SimulacionTab />}

        {/* ── QR MESAS ── */}
        {activeTab === 'qr' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                <QrCode size={24} className="text-pink-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Generador de QR para mesas</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Genera códigos QR para cada mesa que apuntan a la carta digital pública. 
                  Descarga PNG individuales, imprime todos en PDF, o descarga un ZIP.
                </p>
                <Link href="/admin/instalacion/qr">
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-500 transition-colors">
                    <QrCode size={16} /> Abrir generador de QR
                    <ArrowRight size={14} />
                  </button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: <QrCode size={20} className="text-pink-400" />, title: 'QR por mesa', desc: 'Código único para cada mesa, apunta a la carta digital con identificador de mesa.' },
                { icon: <ExternalLink size={20} className="text-blue-400" />, title: 'URL configurable', desc: 'Ajusta la URL base para usar tu dominio propio o el dominio de Replit.' },
                { icon: <CheckSquare size={20} className="text-emerald-400" />, title: 'Selección múltiple', desc: 'Elige qué mesas incluir, descarga PNG individuales o imprime todos en PDF.' },
              ].map(f => (
                <div key={f.title} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                  {f.icon}
                  <div>
                    <p className="font-bold text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ARQUITECTURA ── */}
        {activeTab === 'arquitectura' && <ArchitecturaTab />}
      </main>
    </div>
  );
}

// ─── Diagnosis panel ──────────────────────────────────────────────────────────
function DiagnosisPanel({ data, onRefresh }: { data: DiagnosisData; onRefresh: () => void }) {
  const allItems: Array<{ label: string; status: SemaphoreStatus; detail?: string }> = [
    { label: data.mainComputer.name, status: data.mainComputer.status, detail: data.mainComputer.ip || undefined },
    ...data.tablets.map((t) => ({ label: t.name, status: t.status, detail: t.zone || undefined })),
    ...data.kds.map((k) => ({ label: k.label, status: k.status })),
    ...Object.values(data.printers).map((p) => ({ label: p.label, status: (p.status as SemaphoreStatus) || 'pending' })),
    { label: data.cash.label, status: data.cash.status, detail: data.cash.openSessions > 0 ? `${data.cash.openSessions} caja(s) abierta(s)` : undefined },
    { label: data.backup.label, status: data.backup.status },
    { label: data.users.label, status: data.users.status, detail: `${data.users.count} usuario(s)` },
    { label: data.offline.label, status: data.offline.status },
    { label: data.billing.label, status: data.billing.status },
  ];

  const counts = {
    ready: allItems.filter((i) => i.status === 'ready').length,
    warning: allItems.filter((i) => i.status === 'warning').length,
    pending: allItems.filter((i) => i.status === 'pending').length,
    error: allItems.filter((i) => i.status === 'error').length,
  };

  const allReady = counts.error === 0 && counts.pending === 0 && counts.warning === 0;

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className={`rounded-xl p-6 border ${allReady ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-card border-border'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Estado de la instalación</h2>
          <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary transition-colors">
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Preparados', value: counts.ready, color: 'text-emerald-400' },
            { label: 'Con aviso', value: counts.warning, color: 'text-amber-400' },
            { label: 'Pendientes', value: counts.pending, color: 'text-slate-400' },
            { label: 'Error', value: counts.error, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        {allReady && (
          <div className="mt-4 text-center text-emerald-400 font-bold flex items-center justify-center gap-2">
            <CheckCircle2 size={18} /> Instalación completamente preparada
          </div>
        )}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {allItems.map((item, i) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
          const { Icon } = cfg;
          return (
            <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border ${cfg.bg} ${cfg.border}`}>
              <Icon size={20} className={cfg.color} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.label}</p>
                {item.detail && <p className="text-xs text-muted-foreground truncate">{item.detail}</p>}
              </div>
              <span className={`text-xs font-bold shrink-0 ${cfg.color}`}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Network entry form ───────────────────────────────────────────────────────
function NetworkEntryForm({ initial, onSave, onCancel }: { initial: Partial<NetworkEntry>; onSave: (d: Partial<NetworkEntry>) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<NetworkEntry>>(initial);
  const set = (k: keyof NetworkEntry, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">Nombre</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Impresora cocina" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">IP</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono" value={form.ip ?? ''} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.1.x" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">Tipo</label>
          <select className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm" value={form.deviceType ?? 'other'} onChange={(e) => set('deviceType', e.target.value)}>
            <option value="computer">Ordenador</option>
            <option value="tablet">Tablet</option>
            <option value="printer">Impresora</option>
            <option value="kds">KDS</option>
            <option value="router">Router</option>
            <option value="cash_drawer">Cajón</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">MAC (opcional)</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono" value={form.mac ?? ''} onChange={(e) => set('mac', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">Zona</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm" value={form.zone ?? ''} onChange={(e) => set('zone', e.target.value)} placeholder="cocina / sala / terraza" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">Notas</label>
          <input className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Observaciones" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary transition-colors"><X size={13} /> Cancelar</button>
        <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"><Save size={13} /> Guardar</button>
      </div>
    </div>
  );
}

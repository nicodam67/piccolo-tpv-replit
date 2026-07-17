import { useState } from 'react';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'inventario',  label: 'Inventario',  icon: Monitor },
  { id: 'red',         label: 'Red',         icon: Network },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Zap },
  { id: 'asistente',   label: 'Asistente',   icon: PlayCircle },
  { id: 'manuales',    label: 'Manuales',    icon: BookOpen },
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
          {device.paymentAllowed ? <Unlock size={11} /> : <Lock size={11} />} Cobro
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
  { id: 1, label: 'Abrir enlace seguro',        desc: 'Conecta la tablet a la red Wi-Fi del restaurante y abre el enlace de la aplicación en el navegador.' },
  { id: 2, label: 'Iniciar sesión como admin',  desc: 'Entra con las credenciales de administrador para registrar el dispositivo.' },
  { id: 3, label: 'Registrar dispositivo',      desc: 'Ve a Administración → Dispositivos offline → Registrar y confirma la huella del dispositivo.' },
  { id: 4, label: 'Asignar nombre',             desc: 'Pon el nombre exacto: "Tablet Sala 1", "Tablet Terraza 1", etc. Puedes modificarlo después.' },
  { id: 5, label: 'Asignar zona',               desc: 'Selecciona la zona habitual: sala, terraza, barra. El camarero podrá cambiarla si es necesario.' },
  { id: 6, label: 'Asignar caja',               desc: 'Vincula la tablet a la caja o terminal. Si solo hay una caja, se asigna automáticamente.' },
  { id: 7, label: 'Asignar impresora',          desc: 'Selecciona la impresora predeterminada para tickets y comandas desde este dispositivo.' },
  { id: 8, label: 'Activar modo offline',       desc: 'Habilita el modo offline en Administración → Dispositivos → Permisos → Modo offline autorizado.' },
  { id: 9, label: 'Descargar datos básicos',    desc: 'La aplicación descargará carta, mesas, empleados y configuración. Espera a que finalice la sincronización.' },
  { id: 10, label: 'Probar apertura de mesa',   desc: 'Abre una mesa de prueba desde la tablet para comprobar que el plano y las zonas se cargan correctamente.' },
  { id: 11, label: 'Probar envío de comanda',   desc: 'Añade un artículo y envíalo a cocina. Comprueba que el KDS o la impresora de cocina lo reciben.' },
  { id: 12, label: 'Confirmar sincronización',  desc: 'Verifica en el panel de dispositivos que el estado es "Preparado" y la última sincronización es reciente.' },
];

function WizardTab() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [selectedTablet, setSelectedTablet] = useState('Tablet Sala 1');

  const TABLETS = ['Tablet Sala 1', 'Tablet Sala 2', 'Tablet Sala 3', 'Tablet Terraza 1', 'Tablet Encargado'];

  const toggleStep = (step: number) => {
    setCompleted((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-1">Asistente de instalación de tablet</h3>
        <p className="text-sm text-muted-foreground mb-4">Sigue cada paso para dar por preparada una tablet. No se considera instalada sin prueba completa (pasos 10-12).</p>
        <div className="mb-6">
          <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Tablet que estás instalando ahora</label>
          <div className="flex flex-wrap gap-2">
            {TABLETS.map((t) => (
              <button
                key={t}
                onClick={() => { setSelectedTablet(t); setCompleted([]); setCurrentStep(0); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${selectedTablet === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1 bg-secondary rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(completed.length / WIZARD_STEPS.length) * 100}%` }} />
          </div>
          <span className="text-sm font-bold tabular-nums">{completed.length}/{WIZARD_STEPS.length}</span>
        </div>
      </div>

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
                  onClick={(e) => { e.stopPropagation(); toggleStep(step.id); }}
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
                    onClick={() => { toggleStep(step.id); setCurrentStep(step.id < 12 ? step.id : -1); }}
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

      {completed.length === WIZARD_STEPS.length && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
          <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="font-bold text-emerald-400 text-lg">{selectedTablet} lista</p>
          <p className="text-sm text-muted-foreground mt-1">Todos los pasos completados. Recuerda cambiar su estado a "Preparado" en el inventario.</p>
        </div>
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
    queryFn: async () => {
      const r = await customFetch(`${BASE}/api/admin/installation/devices`);
      if (!r.ok) throw new Error('Error cargando inventario');
      return r.json();
    },
  });

  const networkQ = useQuery<NetworkEntry[]>({
    queryKey: ['installation-network'],
    queryFn: async () => {
      const r = await customFetch(`${BASE}/api/admin/installation/network`);
      if (!r.ok) throw new Error('Error cargando red');
      return r.json();
    },
  });

  const diagnosisQ = useQuery<DiagnosisData>({
    queryKey: ['installation-diagnosis'],
    queryFn: async () => {
      const r = await customFetch(`${BASE}/api/admin/installation/diagnosis`);
      if (!r.ok) throw new Error('Error cargando diagnóstico');
      return r.json();
    },
    enabled: activeTab === 'diagnostico',
    refetchInterval: 30_000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const r = await customFetch(`${BASE}/api/admin/installation/seed`, { method: 'POST' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al crear dispositivos');
      }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); toast.success('Dispositivos iniciales creados'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDevice = useMutation({
    mutationFn: async ({ id, data }: { id: string | null; data: Partial<InstallationDevice> }) => {
      const url = id ? `${BASE}/api/admin/installation/devices/${id}` : `${BASE}/api/admin/installation/devices`;
      const r = await customFetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('Error guardando dispositivo');
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); setEditingId(null); setShowNewDevice(false); toast.success('Dispositivo guardado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      await customFetch(`${BASE}/api/admin/installation/devices/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-devices'] }); toast.success('Dispositivo eliminado'); },
    onError: () => toast.error('Error eliminando dispositivo'),
  });

  const saveNetwork = useMutation({
    mutationFn: async ({ id, data }: { id: string | null; data: Partial<NetworkEntry> }) => {
      const url = id ? `${BASE}/api/admin/installation/network/${id}` : `${BASE}/api/admin/installation/network`;
      const r = await customFetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('Error guardando entrada de red');
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['installation-network'] }); setEditingNetworkId(null); setShowNewNetwork(false); toast.success('Entrada de red guardada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNetwork = useMutation({
    mutationFn: async (id: string) => {
      await customFetch(`${BASE}/api/admin/installation/network/${id}`, { method: 'DELETE' });
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
            {diagnosisQ.isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground"><RefreshCw size={24} className="animate-spin mr-3" /> Analizando instalación...</div>
            ) : diagnosisQ.data ? (
              <DiagnosisPanel data={diagnosisQ.data} onRefresh={() => diagnosisQ.refetch()} />
            ) : (
              <p className="text-center text-muted-foreground py-10">No se pudo cargar el diagnóstico.</p>
            )}
          </div>
        )}

        {/* ── ASISTENTE ── */}
        {activeTab === 'asistente' && <WizardTab />}

        {/* ── MANUALES ── */}
        {activeTab === 'manuales' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold text-lg mb-1">Manuales operativos</h2>
              <p className="text-sm text-muted-foreground">Procedimientos de apertura, cierre y emergencias. Cada lista es interactiva para usarla durante el servicio.</p>
            </div>
            <ChecklistSection
              title="Apertura diaria"
              icon={BatteryCharging}
              color="bg-emerald-500/10 text-emerald-400"
              items={APERTURA_DIARIA}
            />
            <ChecklistSection
              title="Cierre diario"
              icon={Lock}
              color="bg-blue-500/10 text-blue-400"
              items={CIERRE_DIARIO}
            />
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-5 border-b border-border flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 text-red-400">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="font-bold">Plan de emergencia</p>
                  <p className="text-xs text-muted-foreground">Protocolo para situaciones de fallo</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {PLAN_EMERGENCIA.map((item) => (
                  <div key={item.situation} className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-secondary/30 px-4 py-2.5 flex items-center gap-2">
                      <AlertCircle size={14} className="text-amber-400" />
                      <span className="font-bold text-sm">{item.situation}</span>
                    </div>
                    <ul className="p-4 space-y-1.5">
                      {item.steps.map((step, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
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

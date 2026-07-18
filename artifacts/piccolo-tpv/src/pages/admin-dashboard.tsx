import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useLocation } from 'wouter';
import {
  UtensilsCrossed,
  LayoutDashboard,
  Tag,
  Users,
  Monitor,
  Archive,
  CalendarClock,
  UserRound,
  Boxes,
  BarChart3,
  Settings,
  LogOut,
  Clock,
  ChevronRight,
  TrendingUp,
  Coffee,
  Coins,
  ClipboardList,
  FlaskConical,
  Calculator,
  Truck,
  ShoppingCart,
  ScanSearch,
  GitCompare,
  FileText,
  Star,
  Timer,
  ShieldAlert,
  Fingerprint,
  DollarSign,
  Search,
  X as XIcon,
  Shield,
  Globe,
  Bike,
  BarChart2,
  PrinterIcon,
  ListOrdered,
  LineChart,
  HardDrive,
  Activity,
  Smartphone,
  Wand2,
  Lock,
  Trash2,
  Zap,
  QrCode,
  Wrench,
  ShieldCheck,
} from 'lucide-react';
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, customFetch } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';

// ─── Module definitions ───────────────────────────────────────────────────────
interface ModuleCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  ready: boolean;
  accent: string;
  border: string;
  iconBg: string;
  iconColor: string;
  badge?: number;
  glow: string;
}

const MODULES: ModuleCard[] = [
  {
    id: 'tpv',
    icon: <UtensilsCrossed size={28} />,
    title: 'TPV',
    description: 'Plano de mesas · gestión de pedidos',
    href: '/tables',
    ready: true,
    accent: 'rgba(237,135,76,0.07)',
    border: 'rgba(237,135,76,0.28)',
    iconBg: 'rgba(237,135,76,0.15)',
    iconColor: '#ed874c',
    glow: 'rgba(237,135,76,0.12)',
  },
  {
    id: 'salas',
    icon: <LayoutDashboard size={28} />,
    title: 'Editar Salas',
    description: 'Distribuciones · mesas · planos',
    href: '/configuracion',
    ready: true,
    accent: 'rgba(97,137,95,0.07)',
    border: 'rgba(97,137,95,0.28)',
    iconBg: 'rgba(97,137,95,0.15)',
    iconColor: '#61895f',
    glow: 'rgba(97,137,95,0.12)',
  },
  {
    id: 'empleados',
    icon: <Users size={28} />,
    title: 'Empleados',
    description: 'Alta de personal · roles · PINs',
    href: '/empleados',
    ready: false,
    accent: 'rgba(160,100,220,0.07)',
    border: 'rgba(160,100,220,0.22)',
    iconBg: 'rgba(160,100,220,0.12)',
    iconColor: '#a064dc',
    glow: 'rgba(160,100,220,0.10)',
  },
  {
    id: 'kds',
    icon: <Monitor size={28} />,
    title: 'KDS',
    description: 'Pantalla de producción en cocina',
    href: '/kds/cocina',
    ready: true,
    accent: 'rgba(210,160,50,0.07)',
    border: 'rgba(210,160,50,0.28)',
    iconBg: 'rgba(210,160,50,0.15)',
    iconColor: '#d2a032',
    glow: 'rgba(210,160,50,0.12)',
  },
  {
    id: 'caja',
    icon: <Archive size={28} />,
    title: 'Caja',
    description: 'Apertura · cierres · movimientos',
    href: '/caja',
    ready: true,
    accent: 'rgba(60,170,120,0.07)',
    border: 'rgba(60,170,120,0.28)',
    iconBg: 'rgba(60,170,120,0.15)',
    iconColor: '#3caa78',
    glow: 'rgba(60,170,120,0.12)',
  },
  {
    id: 'reservas',
    icon: <CalendarClock size={28} />,
    title: 'Reservas',
    description: 'Agenda y gestión de reservas',
    href: '/reservas',
    ready: true,
    accent: 'rgba(50,185,210,0.07)',
    border: 'rgba(50,185,210,0.22)',
    iconBg: 'rgba(50,185,210,0.12)',
    iconColor: '#32b9d2',
    glow: 'rgba(50,185,210,0.10)',
  },
  {
    id: 'branding',
    icon: <Star size={28} />,
    title: 'Branding & Carta QR',
    description: 'Hero · horarios · colores · layout de la carta',
    href: '/admin/qr-menu',
    ready: true,
    accent: 'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.28)',
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#f59e0b',
    glow: 'rgba(245,158,11,0.12)',
  },
  {
    id: 'crm',
    icon: <Users size={28} />,
    title: 'CRM & Fidelización',
    description: 'Clientes · puntos · tarjetas regalo · promociones',
    href: '/admin/crm',
    ready: true,
    accent: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.28)',
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#10b981',
    glow: 'rgba(16,185,129,0.12)',
  },
  // ─── Food Cost ───────────────────────────────────────────────────────────
  {
    id: 'food-cost',
    icon: <DollarSign size={28} />,
    title: 'Food Cost',
    description: 'Ingredientes · escandallos · compras · stock · proveedores · costes',
    href: '/admin/food-cost',
    ready: true,
    accent: 'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.28)',
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#f59e0b',
    glow: 'rgba(245,158,11,0.12)',
  },
  {
    id: 'informes',
    icon: <BarChart3 size={28} />,
    title: 'Informes',
    description: 'Ventas · tickets · resúmenes',
    href: '/informes',
    ready: false,
    accent: 'rgba(80,180,160,0.07)',
    border: 'rgba(80,180,160,0.22)',
    iconBg: 'rgba(80,180,160,0.12)',
    iconColor: '#50b4a0',
    glow: 'rgba(80,180,160,0.10)',
  },
  {
    id: 'caja-automatica',
    icon: <Coins size={28} />,
    title: 'Caja automática',
    description: 'Configuración y estado del dispositivo',
    href: '/admin/caja-automatica',
    ready: true,
    accent: 'rgba(60,140,200,0.07)',
    border: 'rgba(60,140,200,0.28)',
    iconBg: 'rgba(60,140,200,0.15)',
    iconColor: '#3c8cc8',
    glow: 'rgba(60,140,200,0.12)',
  },
  {
    id: 'configuracion',
    icon: <Settings size={28} />,
    title: 'Configuración',
    description: 'Preferencias del sistema',
    href: '/configuracion',
    ready: true,
    accent: 'rgba(130,130,145,0.07)',
    border: 'rgba(130,130,145,0.22)',
    iconBg: 'rgba(130,130,145,0.12)',
    iconColor: '#8282a0',
    glow: 'rgba(130,130,145,0.10)',
  },
  // ─── VERI*FACTU ──────────────────────────────────────────────────────────
  {
    id: 'verifactu',
    icon: <Shield size={28} />,
    title: 'VERI*FACTU',
    description: 'Registros fiscales · encadenamiento · QR',
    href: '/admin/verifactu',
    ready: true,
    accent: 'rgba(96,130,220,0.07)',
    border: 'rgba(96,130,220,0.28)',
    iconBg: 'rgba(96,130,220,0.15)',
    iconColor: '#6082dc',
    glow: 'rgba(96,130,220,0.12)',
  },
  // ─── Pedidos Online ───────────────────────────────────────────────────────
  {
    id: 'online-config',
    icon: <Globe size={28} />,
    title: 'Pedidos Online',
    description: 'Recogida · reparto · zonas · repartidores',
    href: '/admin/online-orders-config',
    ready: true,
    accent: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.28)',
    iconBg: 'rgba(99,102,241,0.15)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.12)',
  },
  {
    id: 'online-inbox',
    icon: <Bike size={28} />,
    title: 'Bandeja de pedidos online',
    description: 'Confirmar · rechazar · asignar repartidor',
    href: '/online-orders',
    ready: true,
    accent: 'rgba(56,189,248,0.07)',
    border: 'rgba(56,189,248,0.28)',
    iconBg: 'rgba(56,189,248,0.15)',
    iconColor: '#38bdf8',
    glow: 'rgba(56,189,248,0.12)',
  },
  {
    id: 'online-reports',
    icon: <BarChart2 size={28} />,
    title: 'Informes online',
    description: 'Ventas · tickets medios · por canal',
    href: '/admin/online-reports',
    ready: true,
    accent: 'rgba(52,211,153,0.07)',
    border: 'rgba(52,211,153,0.28)',
    iconBg: 'rgba(52,211,153,0.15)',
    iconColor: '#34d399',
    glow: 'rgba(52,211,153,0.12)',
  },
  // ─── Impresión ────────────────────────────────────────────────────────────
  {
    id: 'impresoras',
    icon: <PrinterIcon size={28} />,
    title: 'Impresoras',
    description: 'Configurar · modo · plantilla · enrutamiento por partida',
    href: '/admin/impresoras',
    ready: true,
    accent: 'rgba(161,161,170,0.07)',
    border: 'rgba(161,161,170,0.28)',
    iconBg: 'rgba(161,161,170,0.15)',
    iconColor: '#a1a1aa',
    glow: 'rgba(161,161,170,0.12)',
  },
  {
    id: 'kds-stations',
    icon: <Monitor size={28} />,
    title: 'Estaciones KDS',
    description: 'Pantallas de producción · IPs · zonas · ping',
    href: '/admin/kds-stations',
    ready: true,
    accent: 'rgba(34,211,238,0.07)',
    border: 'rgba(34,211,238,0.28)',
    iconBg: 'rgba(34,211,238,0.15)',
    iconColor: '#22d3ee',
    glow: 'rgba(34,211,238,0.12)',
  },
  {
    id: 'prueba-impresion',
    icon: <Zap size={28} />,
    title: 'Prueba de Impresión',
    description: 'Asistente de 10 pasos · verifica cada zona y cajón',
    href: '/admin/prueba-impresion',
    ready: true,
    accent: 'rgba(132,204,22,0.07)',
    border: 'rgba(132,204,22,0.28)',
    iconBg: 'rgba(132,204,22,0.15)',
    iconColor: '#84cc16',
    glow: 'rgba(132,204,22,0.12)',
  },
  {
    id: 'cola-impresion',
    icon: <ListOrdered size={28} />,
    title: 'Cola de Impresión',
    description: 'Pendientes · errores · reimpresiones',
    href: '/admin/cola-impresion',
    ready: true,
    accent: 'rgba(251,146,60,0.07)',
    border: 'rgba(251,146,60,0.28)',
    iconBg: 'rgba(251,146,60,0.15)',
    iconColor: '#fb923c',
    glow: 'rgba(251,146,60,0.12)',
  },
  // ─── Asistente de configuración ──────────────────────────────────────────
  {
    id: 'setup-wizard',
    icon: <Wand2 size={28} />,
    title: 'Asistente de configuración',
    description: 'Guía de puesta en marcha · 16 pasos · simulación · go-live',
    href: '/setup',
    ready: true,
    accent: 'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.40)',
    iconBg: 'rgba(245,158,11,0.18)',
    iconColor: '#f59e0b',
    glow: 'rgba(245,158,11,0.15)',
  },
  // ─── Sistema ─────────────────────────────────────────────────────────────
  {
    id: 'permisos',
    icon: <Lock size={28} />,
    title: 'Permisos por rol',
    description: 'Matriz de acceso · roles · qué puede hacer cada empleado',
    href: '/admin/permisos',
    ready: true,
    accent: 'rgba(139,92,246,0.07)',
    border: 'rgba(139,92,246,0.40)',
    iconBg: 'rgba(139,92,246,0.18)',
    iconColor: '#8b5cf6',
    glow: 'rgba(139,92,246,0.15)',
  },
  {
    id: 'datos-demo',
    icon: <Trash2 size={28} />,
    title: 'Datos de demostración',
    description: 'Ver y purgar registros de simulación · is_demo · limpieza antes del go-live',
    href: '/admin/datos-demo',
    ready: true,
    accent: 'rgba(239,68,68,0.07)',
    border: 'rgba(239,68,68,0.40)',
    iconBg: 'rgba(239,68,68,0.18)',
    iconColor: '#ef4444',
    glow: 'rgba(239,68,68,0.15)',
  },
  {
    id: 'salud',
    icon: <ShieldCheck size={28} />,
    title: 'Salud del sistema',
    description: 'Semáforos en tiempo real · BD · impresoras · backups · cola offline · alertas',
    href: '/admin/salud',
    ready: true,
    accent: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.40)',
    iconBg: 'rgba(16,185,129,0.18)',
    iconColor: '#10b981',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    id: 'permisos',
    icon: <ShieldCheck size={28} />,
    title: 'Permisos por rol',
    description: 'Ajuste granular de acciones por rol · overrides sobre el control de acceso por defecto',
    href: '/admin/permisos',
    ready: true,
    accent: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.35)',
    iconBg: 'rgba(99,102,241,0.18)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.15)',
  },
  {
    id: 'sistema',
    icon: <Activity size={28} />,
    title: 'Estado del sistema',
    description: 'Diagnóstico · clasificación de módulos · hallazgos · informe de preparación go-live',
    href: '/admin/sistema',
    ready: true,
    accent: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.40)',
    iconBg: 'rgba(99,102,241,0.18)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.15)',
  },
  {
    id: 'backup',
    icon: <HardDrive size={28} />,
    title: 'Copias de seguridad',
    description: 'Backups · programación · restauración · exportación',
    href: '/admin/backup',
    ready: true,
    accent: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.35)',
    iconBg: 'rgba(99,102,241,0.15)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.15)',
  },
  {
    id: 'diagnostics',
    icon: <Activity size={28} />,
    title: 'Diagnóstico técnico',
    description: 'Estado del sistema · eventos · mantenimiento',
    href: '/admin/diagnostics',
    ready: true,
    accent: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.28)',
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#10b981',
    glow: 'rgba(16,185,129,0.12)',
  },
  {
    id: 'instalacion',
    icon: <Wand2 size={28} />,
    title: 'Instalación',
    description: 'Inventario · Red · Diagnóstico · Asistente · Manuales · Arquitectura',
    href: '/admin/instalacion',
    ready: true,
    accent: 'rgba(249,115,22,0.07)',
    border: 'rgba(249,115,22,0.35)',
    iconBg: 'rgba(249,115,22,0.15)',
    iconColor: '#fb923c',
    glow: 'rgba(249,115,22,0.12)',
  },
  {
    id: 'devices',
    icon: <Smartphone size={28} />,
    title: 'Dispositivos e Inventario',
    description: 'Tablets · IPs · MAC · zonas · impresoras · diagnóstico de red',
    href: '/admin/devices',
    ready: true,
    accent: 'rgba(6,182,212,0.07)',
    border: 'rgba(6,182,212,0.28)',
    iconBg: 'rgba(6,182,212,0.15)',
    iconColor: '#06b6d4',
    glow: 'rgba(6,182,212,0.12)',
  },
  // ─── Panel de Dirección ───────────────────────────────────────────────────
  {
    id: 'director',
    icon: <LineChart size={28} />,
    title: 'Panel de Dirección',
    description: 'KPIs · rentabilidad · previsiones · alertas · objetivos',
    href: '/admin/director',
    ready: true,
    accent: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.35)',
    iconBg: 'rgba(99,102,241,0.15)',
    iconColor: '#818cf8',
    glow: 'rgba(99,102,241,0.15)',
  },
  // ─── Personal · Fichaje ───────────────────────────────────────────────────
  {
    id: 'fichaje',
    icon: <Fingerprint size={28} />,
    title: 'Fichaje',
    description: 'Control horario · registros · turnos · informes · portal',
    href: '/admin/fichaje',
    ready: true,
    accent: 'rgba(20,184,166,0.07)',
    border: 'rgba(20,184,166,0.28)',
    iconBg: 'rgba(20,184,166,0.15)',
    iconColor: '#14b8a6',
    glow: 'rgba(20,184,166,0.12)',
  },
];

// ─── Clock hook ───────────────────────────────────────────────────────────────
function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [employeeName, setEmployeeName] = useState('Admin');
  const [moduleSearch, setModuleSearch] = useState('');
  const now = useNow();
  const { data: summary, refetch: refetchSummary } = useGetDashboardSummary({ query: { refetchInterval: 30000, queryKey: getGetDashboardSummaryQueryKey() } });

  // Today's reservations count for the badge on the Reservas module button
  const todayDate = now.toISOString().slice(0, 10);
  const { data: todayReservations = [] } = useQuery<{ id: string; status: string }[]>({
    queryKey: ['reservations-today-badge', todayDate],
    queryFn: () => customFetch(`/api/reservations?date=${todayDate}`),
    refetchInterval: 60000,
  });
  const reservasBadge = todayReservations.filter((r: { status: string }) => r.status !== 'cancelled' && r.status !== 'noshow').length;

  // Sync employee name from AuthContext (auth guard is handled by the router)
  useEffect(() => {
    if (user?.name) setEmployeeName(user.name);
  }, [user]);

  // Refresh KPI tiles when returning to foreground
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        void refetchSummary();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetchSummary]);

  const handleLogout = () => {
    void logout();
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const occupancyPct = summary && summary.totalTables > 0
    ? Math.round((summary.occupiedTables / summary.totalTables) * 100)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="h-16 shrink-0 flex items-center px-5 lg:px-8 bg-card border-b border-border shadow-sm z-10 gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-base shadow">
            <Coffee size={18} />
          </div>
          <span className="font-black text-lg tracking-tight hidden sm:block">Piccolo TPV</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-black uppercase tracking-widest border border-amber-500/30">
            Admin
          </span>
        </div>

        <div className="flex-1" />

        {/* Clock */}
        <div className="hidden md:flex items-center gap-1.5 text-muted-foreground text-sm font-mono">
          <Clock size={13} />
          <span>{timeStr}</span>
        </div>

        {/* Employee + logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-black text-primary text-sm">
                {employeeName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[7px] font-black text-white leading-none">A</span>
            </div>
            <span className="hidden md:block text-sm font-semibold">{employeeName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-90"
            title="Cerrar sesión"
          >
            <LogOut size={17} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-5 lg:px-10 py-8 max-w-7xl mx-auto w-full">

        {/* Greeting */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black leading-tight">
              {greeting}, {employeeName.split(' ')[0]} 👋
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm capitalize">{dateStr}</p>
          </div>
        </div>

        {/* ── Live stats ── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Mesas totales"
              value={summary.totalTables}
              icon={<UtensilsCrossed size={16} />}
              color="#ed874c"
              bg="rgba(237,135,76,0.08)"
              border="rgba(237,135,76,0.2)"
            />
            <StatCard
              label="Ocupadas"
              value={summary.occupiedTables}
              icon={<TrendingUp size={16} />}
              color="#c05c4a"
              bg="rgba(192,92,74,0.08)"
              border="rgba(192,92,74,0.2)"
              sub={`${occupancyPct}% ocupación`}
            />
            <StatCard
              label="Libres"
              value={summary.freeTables}
              icon={<UtensilsCrossed size={16} />}
              color="#61895f"
              bg="rgba(97,137,95,0.08)"
              border="rgba(97,137,95,0.2)"
            />
            <StatCard
              label="F. de servicio"
              value={(summary.totalTables ?? 0) - (summary.occupiedTables ?? 0) - (summary.freeTables ?? 0)}
              icon={<Settings size={16} />}
              color="#8282a0"
              bg="rgba(130,130,160,0.08)"
              border="rgba(130,130,160,0.2)"
            />
          </div>
        )}

        {/* ── Quick shortcuts ── */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Accesos directos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { label: 'Abrir TPV',     href: '/tables',                icon: <UtensilsCrossed size={20} />, color: '#ed874c', bg: 'rgba(237,135,76,0.12)' },
              { label: 'Administración',href: '/admin',                 icon: <Monitor size={20} />,          color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
              { label: 'Abrir caja',    href: '/cash-session',          icon: <Trash2 size={20} style={{ display:'none' }} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)', customIcon: '💵' },
              { label: 'KDS Cocina',    href: '/kds',                   icon: <Monitor size={20} />,          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
              { label: 'Diagnóstico',   href: '/admin/instalacion',     icon: <Zap size={20} />,              color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
              { label: 'Copia seguridad',href: '/admin/backup',         icon: <HardDrive size={20} />,        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
              { label: 'QR Mesas',      href: '/admin/instalacion/qr',  icon: <QrCode size={20} />,           color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
            ].map(sc => (
              <a key={sc.label} href={sc.href}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all text-center group"
                style={{ background: sc.bg }}
              >
                <span style={{ color: sc.color }} className="transition-transform group-hover:scale-110 duration-150">
                  {sc.customIcon ? <span className="text-2xl">{sc.customIcon}</span> : sc.icon}
                </span>
                <span className="text-xs font-semibold leading-tight">{sc.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* ── Module search ── */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={moduleSearch}
            autoFocus
            onChange={e => setModuleSearch(e.target.value)}
            placeholder="Buscar módulo…"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {moduleSearch && (
            <button onClick={() => setModuleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* ── Module grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {MODULES.filter(card => !moduleSearch.trim() || card.title.toLowerCase().includes(moduleSearch.trim().toLowerCase()) || card.description.toLowerCase().includes(moduleSearch.trim().toLowerCase())).map(card => (
            <ModuleButton
              key={card.id}
              card={{ ...card, badge: card.id === 'reservas' && reservasBadge > 0 ? reservasBadge : undefined }}
              onClick={() => card.ready && setLocation(card.href)}
            />
          ))}
          {moduleSearch.trim() && MODULES.filter(card => card.title.toLowerCase().includes(moduleSearch.trim().toLowerCase()) || card.description.toLowerCase().includes(moduleSearch.trim().toLowerCase())).length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground text-sm">
              <p>Sin módulos para "{moduleSearch}"</p>
              <button onClick={() => setModuleSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-10 font-medium tracking-wide">
          Piccolo TPV · Panel de Administración
        </p>
      </main>
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, color, bg, border, sub,
}: {
  label: string; value: number; icon: React.ReactNode;
  color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2 border"
      style={{ background: bg, borderColor: border }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
        <span style={{ color }} className="opacity-70">{icon}</span>
      </div>
      <span className="text-3xl font-black leading-none" style={{ color }}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground font-semibold">{sub}</span>}
    </div>
  );
}

// ─── ModuleButton ─────────────────────────────────────────────────────────────
function ModuleButton({ card, onClick }: { card: ModuleCard; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!card.ready}
      className={`group relative text-left rounded-2xl border p-5 flex flex-col gap-3.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${card.ready
          ? 'hover:scale-[1.025] hover:shadow-2xl active:scale-[0.975] cursor-pointer'
          : 'cursor-default opacity-50 pointer-events-none'
        }`}
      style={{
        background: card.accent,
        borderColor: card.border,
      }}
    >
      {/* Coming soon */}
      {!card.ready && (
        <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/60">
          Próximo
        </span>
      )}

      {/* Count badge */}
      {card.ready && card.badge !== undefined && (
        <span className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[11px] font-black rounded-full bg-primary text-primary-foreground shadow-sm">
          {card.badge}
        </span>
      )}

      {/* Glow on hover */}
      {card.ready && (
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 1px ${card.border}, 0 8px 32px ${card.glow}` }}
        />
      )}

      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
        style={{ background: card.iconBg, color: card.iconColor }}
      >
        {card.icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <h2 className="text-[15px] font-black leading-tight truncate">{card.title}</h2>
          {card.ready && (
            <ChevronRight
              size={13}
              className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-80 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150"
            />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
      </div>
    </button>
  );
}

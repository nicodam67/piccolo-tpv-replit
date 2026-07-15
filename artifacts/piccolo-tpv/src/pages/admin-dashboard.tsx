import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  UtensilsCrossed,
  LayoutDashboard,
  Package,
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
  Sliders,
  Receipt,
  Coins,
  ClipboardList,
} from 'lucide-react';
import { useGetDashboardSummary } from '@workspace/api-client-react';

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
    id: 'productos',
    icon: <Package size={28} />,
    title: 'Productos',
    description: 'Carta · precios · formatos · IVA',
    href: '/productos',
    ready: true,
    accent: 'rgba(96,130,220,0.07)',
    border: 'rgba(96,130,220,0.22)',
    iconBg: 'rgba(96,130,220,0.12)',
    iconColor: '#6082dc',
    glow: 'rgba(96,130,220,0.10)',
  },
  {
    id: 'categorias',
    icon: <Tag size={28} />,
    title: 'Categorías',
    description: 'Grupos y secciones de la carta',
    href: '/categorias',
    ready: true,
    accent: 'rgba(236,130,170,0.07)',
    border: 'rgba(236,130,170,0.22)',
    iconBg: 'rgba(236,130,170,0.12)',
    iconColor: '#ec82aa',
    glow: 'rgba(236,130,170,0.10)',
  },
  {
    id: 'modificadores',
    icon: <Sliders size={28} />,
    title: 'Modificadores',
    description: 'Opciones y extras por producto',
    href: '/modificadores',
    ready: true,
    accent: 'rgba(160,100,220,0.07)',
    border: 'rgba(160,100,220,0.22)',
    iconBg: 'rgba(160,100,220,0.12)',
    iconColor: '#a064dc',
    glow: 'rgba(160,100,220,0.10)',
  },
  {
    id: 'fiscal',
    icon: <Receipt size={28} />,
    title: 'Tipos de IVA',
    description: 'IVA por producto · 4% · 10% · 21%',
    href: '/fiscal',
    ready: true,
    accent: 'rgba(96,130,220,0.07)',
    border: 'rgba(96,130,220,0.22)',
    iconBg: 'rgba(96,130,220,0.12)',
    iconColor: '#6082dc',
    glow: 'rgba(96,130,220,0.10)',
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
    ready: false,
    accent: 'rgba(50,185,210,0.07)',
    border: 'rgba(50,185,210,0.22)',
    iconBg: 'rgba(50,185,210,0.12)',
    iconColor: '#32b9d2',
    glow: 'rgba(50,185,210,0.10)',
  },
  {
    id: 'clientes',
    icon: <UserRound size={28} />,
    title: 'Clientes',
    description: 'Historial · fidelización · datos',
    href: '/clientes',
    ready: false,
    accent: 'rgba(240,100,100,0.07)',
    border: 'rgba(240,100,100,0.22)',
    iconBg: 'rgba(240,100,100,0.12)',
    iconColor: '#f06464',
    glow: 'rgba(240,100,100,0.10)',
  },
  {
    id: 'ingredientes',
    icon: <Package size={28} />,
    title: 'Ingredientes',
    description: 'Materias primas · proveedores · coste',
    href: '/ingredientes',
    ready: true,
    accent: 'rgba(180,140,60,0.07)',
    border: 'rgba(180,140,60,0.22)',
    iconBg: 'rgba(180,140,60,0.12)',
    iconColor: '#b48c3c',
    glow: 'rgba(180,140,60,0.10)',
  },
  {
    id: 'stock',
    icon: <Boxes size={28} />,
    title: 'Stock',
    description: 'Inventario · movimientos · alertas',
    href: '/stock',
    ready: true,
    accent: 'rgba(160,130,80,0.07)',
    border: 'rgba(160,130,80,0.22)',
    iconBg: 'rgba(160,130,80,0.12)',
    iconColor: '#a08250',
    glow: 'rgba(160,130,80,0.10)',
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
    id: 'inventario-fisico',
    icon: <ClipboardList size={28} />,
    title: 'Inventario físico',
    description: 'Recuento manual · ajuste automático',
    href: '/admin/inventario/fisico',
    ready: true,
    accent: 'rgba(130,180,80,0.07)',
    border: 'rgba(130,180,80,0.22)',
    iconBg: 'rgba(130,180,80,0.12)',
    iconColor: '#82b450',
    glow: 'rgba(130,180,80,0.10)',
  },
  {
    id: 'informes-stock',
    icon: <BarChart3 size={28} />,
    title: 'Informes de stock',
    description: 'Valor almacén · consumo · mermas',
    href: '/admin/inventario/informes',
    ready: true,
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
  const [employeeName, setEmployeeName] = useState('Admin');
  const now = useNow();
  const { data: summary } = useGetDashboardSummary();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const empStr = localStorage.getItem('employee');
    if (!token) { setLocation('/'); return; }
    try {
      const emp = JSON.parse(empStr ?? '{}');
      if (emp.role !== 'admin') { setLocation('/tables'); return; }
      setEmployeeName(emp.name ?? 'Admin');
    } catch { setLocation('/'); }
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('employee');
    setLocation('/');
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

        {/* ── Module grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {MODULES.map(card => (
            <ModuleButton key={card.id} card={card} onClick={() => card.ready && setLocation(card.href)} />
          ))}
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

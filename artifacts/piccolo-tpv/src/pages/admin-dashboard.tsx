import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  UtensilsCrossed,
  LayoutDashboard,
  Package,
  Users,
  Monitor,
  Archive,
  Settings,
  BarChart3,
  LogOut,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { useGetDashboardSummary } from '@workspace/api-client-react';

type Card = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  accent: string;       // bg tint
  border: string;       // border color
  iconBg: string;       // icon pill bg
  iconColor: string;    // icon color
  ready: boolean;
};

const CARDS: Card[] = [
  {
    id: 'tpv',
    icon: <UtensilsCrossed size={26} />,
    title: 'TPV',
    description: 'Plano de mesas y gestión de pedidos',
    href: '/tables',
    accent: 'rgba(237,135,76,0.08)',
    border: 'rgba(237,135,76,0.3)',
    iconBg: 'rgba(237,135,76,0.15)',
    iconColor: '#ed874c',
    ready: true,
  },
  {
    id: 'salas',
    icon: <LayoutDashboard size={26} />,
    title: 'Editar Salas',
    description: 'Distribuir mesas y configurar zonas',
    href: '/configuracion',
    accent: 'rgba(97,137,95,0.08)',
    border: 'rgba(97,137,95,0.3)',
    iconBg: 'rgba(97,137,95,0.15)',
    iconColor: '#61895f',
    ready: true,
  },
  {
    id: 'productos',
    icon: <Package size={26} />,
    title: 'Productos',
    description: 'Carta, categorías y precios',
    href: '/productos',
    accent: 'rgba(96,130,220,0.08)',
    border: 'rgba(96,130,220,0.25)',
    iconBg: 'rgba(96,130,220,0.12)',
    iconColor: '#6082dc',
    ready: false,
  },
  {
    id: 'empleados',
    icon: <Users size={26} />,
    title: 'Empleados',
    description: 'Alta de personal y roles',
    href: '/empleados',
    accent: 'rgba(160,100,220,0.08)',
    border: 'rgba(160,100,220,0.25)',
    iconBg: 'rgba(160,100,220,0.12)',
    iconColor: '#a064dc',
    ready: false,
  },
  {
    id: 'kds',
    icon: <Monitor size={26} />,
    title: 'KDS',
    description: 'Pantalla de producción en cocina',
    href: '/kds/cocina',
    accent: 'rgba(210,160,50,0.08)',
    border: 'rgba(210,160,50,0.25)',
    iconBg: 'rgba(210,160,50,0.12)',
    iconColor: '#d2a032',
    ready: true,
  },
  {
    id: 'caja',
    icon: <Archive size={26} />,
    title: 'Caja',
    description: 'Apertura, cierres y movimientos',
    href: '/caja',
    accent: 'rgba(60,170,120,0.08)',
    border: 'rgba(60,170,120,0.25)',
    iconBg: 'rgba(60,170,120,0.12)',
    iconColor: '#3caa78',
    ready: true,
  },
  {
    id: 'config',
    icon: <Settings size={26} />,
    title: 'Configuración',
    description: 'Preferencias del sistema',
    href: '/configuracion',
    accent: 'rgba(140,140,155,0.08)',
    border: 'rgba(140,140,155,0.2)',
    iconBg: 'rgba(140,140,155,0.12)',
    iconColor: '#8c8c9b',
    ready: true,
  },
  {
    id: 'informes',
    icon: <BarChart3 size={26} />,
    title: 'Informes',
    description: 'Ventas, tickets y resúmenes',
    href: '/informes',
    accent: 'rgba(50,185,195,0.08)',
    border: 'rgba(50,185,195,0.25)',
    iconBg: 'rgba(50,185,195,0.12)',
    iconColor: '#32b9c3',
    ready: false,
  },
];

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

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
  const greeting =
    hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* Top bar */}
      <header className="h-16 shrink-0 flex items-center px-6 bg-card border-b border-border shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-base shadow-md">
            P
          </div>
          <span className="font-black text-lg tracking-tight">Piccolo</span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-black uppercase tracking-widest border border-amber-500/30">
            Admin
          </span>
        </div>

        <div className="flex-1" />

        {/* Live clock */}
        <div className="hidden sm:flex items-center gap-2 text-muted-foreground text-sm font-mono mr-6">
          <Clock size={14} />
          <span>{timeStr}</span>
        </div>

        {/* Employee chip */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold">
                {employeeName.charAt(0)}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center text-[8px] font-black text-white">A</span>
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

      {/* Body */}
      <main className="flex-1 px-6 lg:px-12 py-10 max-w-6xl mx-auto w-full">

        {/* Greeting + date */}
        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-black leading-tight">
            {greeting}, {employeeName.split(' ')[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-base capitalize">{dateStr}</p>
        </div>

        {/* Live stats strip */}
        {summary && (
          <div className="flex flex-wrap gap-3 mb-10">
            {[
              { label: 'Mesas totales', value: summary.totalTables, color: 'text-foreground', bg: 'bg-card' },
              { label: 'Ocupadas',      value: summary.occupiedTables, color: 'text-[#c05c4a]', bg: 'bg-[#c05c4a]/10' },
              { label: 'Libres',        value: summary.freeTables,    color: 'text-[#61895f]', bg: 'bg-[#61895f]/10' },
            ].map(s => (
              <div key={s.label}
                className={`flex items-center gap-3 ${s.bg} border border-border rounded-2xl px-5 py-3`}>
                <span className={`text-2xl font-black ${s.color}`}>{s.value}</span>
                <span className="text-sm text-muted-foreground font-semibold">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Module grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CARDS.map(card => (
            <button
              key={card.id}
              onClick={() => card.ready && setLocation(card.href)}
              className={`relative group text-left rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-150
                ${card.ready
                  ? 'hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] cursor-pointer'
                  : 'cursor-default opacity-60'
                }`}
              style={{
                background: card.accent,
                borderColor: card.border,
              }}
            >
              {/* Coming soon badge */}
              {!card.ready && (
                <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                  Próximo
                </span>
              )}

              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: card.iconBg, color: card.iconColor }}
              >
                {card.icon}
              </div>

              {/* Text */}
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-black leading-tight">{card.title}</h2>
                  {card.ready && (
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{card.description}</p>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

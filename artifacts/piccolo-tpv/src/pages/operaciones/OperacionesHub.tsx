/**
 * OperacionesHub — módulo principal de operaciones diarias.
 * Agrupa: TPV, salas, caja, caja automática, KDS, reservas.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  UtensilsCrossed, LayoutDashboard, Archive, Coins, Monitor, CalendarClock,
} from 'lucide-react';

const ACCENT = '#ed874c';
const ACCENT_BG = 'rgba(237,135,76,0.12)';

interface Item { icon: React.ReactNode; title: string; desc: string; href: string }

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Servicio',
    items: [
      { icon: <UtensilsCrossed size={20} />, title: 'TPV', desc: 'Plano de mesas y gestión de pedidos', href: '/tables' },
      { icon: <LayoutDashboard size={20} />, title: 'Editar Salas', desc: 'Distribuciones, mesas y planos de sala', href: '/configuracion' },
      { icon: <CalendarClock size={20} />, title: 'Reservas', desc: 'Agenda de reservas y turnos de comedor', href: '/reservas' },
    ],
  },
  {
    title: 'Cobro',
    items: [
      { icon: <Archive size={20} />, title: 'Caja', desc: 'Apertura, cierres y movimientos de caja', href: '/caja' },
      { icon: <Coins size={20} />, title: 'Caja automática', desc: 'Configuración y estado del dispositivo', href: '/admin/caja-automatica' },
    ],
  },
  {
    title: 'Cocina',
    items: [
      { icon: <Monitor size={20} />, title: 'KDS', desc: 'Pantalla de producción en cocina', href: '/kds/cocina' },
    ],
  },
];

function HubCard({ item }: { item: Item }) {
  const [, nav] = useLocation();
  return (
    <button
      onClick={() => nav(item.href)}
      className="group text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:border-orange-500/40 bg-card hover:bg-orange-500/5 transition-all active:scale-[0.98]"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-150"
        style={{ background: ACCENT_BG, color: ACCENT }}>
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-80 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150" />
    </button>
  );
}

export default function OperacionesHub() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
        <button onClick={() => nav('/admin')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Admin</span>
        </button>
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={18} style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground">Operaciones</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Operaciones</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Operaciones</h1>
          <p className="text-muted-foreground text-sm">TPV · caja · salas · reservas · cocina</p>
        </div>
        <div className="space-y-7">
          {SECTIONS.map(sec => (
            <div key={sec.title}>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">{sec.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sec.items.map(item => <HubCard key={item.href} item={item} />)}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

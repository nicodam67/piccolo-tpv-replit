/**
 * ClientesPedidosHub — módulo de clientes, fidelización y pedidos online.
 * Agrupa: CRM, Pedidos Online, Bandeja, Repartidores, Informes online.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  Users, Gift, Star,
  Globe, Bike, ShoppingBag, MapPin,
  BarChart2,
} from 'lucide-react';

const ACCENT = '#818cf8';

const SECTIONS: { title: string; tag: string; color: string; bg: string; items: { icon: React.ReactNode; title: string; desc: string; href: string }[] }[] = [
  {
    title: 'Clientes',
    tag: 'CRM & Fidelización',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.12)',
    items: [
      { icon: <Users size={20} />, title: 'CRM', desc: 'Clientes, historial y segmentación', href: '/admin/crm' },
      { icon: <Star size={20} />,  title: 'Puntos y fidelización', desc: 'Programa de puntos y recompensas', href: '/admin/crm' },
      { icon: <Gift size={20} />,  title: 'Tarjetas regalo', desc: 'Emisión y control de gift cards', href: '/admin/crm' },
    ],
  },
  {
    title: 'Pedidos Online',
    tag: 'Delivery & Recogida',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.12)',
    items: [
      { icon: <Globe size={20} />,      title: 'Configuración online', desc: 'Zonas, horarios y condiciones del canal online', href: '/admin/online-orders-config' },
      { icon: <ShoppingBag size={20} />, title: 'Bandeja de pedidos', desc: 'Confirmar, rechazar y asignar pedidos',           href: '/online-orders' },
      { icon: <Bike size={20} />,        title: 'Repartidores',        desc: 'Gestión del equipo de reparto',                  href: '/admin/repartidores' },
      { icon: <MapPin size={20} />,      title: 'Turnos de reservas',  desc: 'Turnos y franjas horarias de sala',              href: '/admin/reservas/turnos' },
    ],
  },
  {
    title: 'Informes',
    tag: 'Canal online',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    items: [
      { icon: <BarChart2 size={20} />, title: 'Informes online', desc: 'Ventas por canal, tickets medios y tendencias', href: '/admin/online-reports' },
    ],
  },
];

function HubCard({ item, color, bg }: { item: { icon: React.ReactNode; title: string; desc: string; href: string }; color: string; bg: string }) {
  const [, nav] = useLocation();
  return (
    <button
      onClick={() => nav(item.href)}
      className="group text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-secondary/30 bg-card transition-all active:scale-[0.98]"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-150"
        style={{ background: bg, color }}>
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

export default function ClientesPedidosHub() {
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
          <Users size={18} style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground">Clientes y Pedidos</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Clientes y Pedidos</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Clientes y Pedidos</h1>
          <p className="text-muted-foreground text-sm">CRM · fidelización · pedidos online · reparto</p>
        </div>
        <div className="space-y-7">
          {SECTIONS.map(sec => (
            <div key={sec.title}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{sec.title}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: sec.bg, color: sec.color }}>{sec.tag}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sec.items.map(item => <HubCard key={item.href + item.title} item={item} color={sec.color} bg={sec.bg} />)}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

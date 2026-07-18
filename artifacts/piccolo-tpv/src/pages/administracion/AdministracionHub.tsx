/**
 * AdministracionHub — módulo de administración: informes, dirección, fiscalidad, auditoría.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  BarChart3, LineChart, Shield, Lock,
  TrendingUp, Tag, Users, Archive,
  FileText, ShieldAlert,
} from 'lucide-react';

const ACCENT = '#10b981';

const SECTIONS: {
  title: string; tag: string; color: string; bg: string;
  items: { icon: React.ReactNode; title: string; desc: string; href: string }[]
}[] = [
  {
    title: 'Informes',
    tag: 'Análisis de ventas',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    items: [
      { icon: <BarChart3 size={20} />,  title: 'Informes de ventas',  desc: 'Ventas, camareros, IVA, formas de pago y exportación', href: '/admin/informes' },
      { icon: <TrendingUp size={20} />, title: 'Ventas por período',  desc: 'Tendencias diarias, semanales y mensuales',            href: '/admin/informes' },
      { icon: <Tag size={20} />,        title: 'IVA y fiscalidad',    desc: 'Desglose de base imponible y cuotas de IVA',          href: '/admin/informes' },
      { icon: <Archive size={20} />,    title: 'Caja y descuentos',   desc: 'Sesiones de caja, descuentos y anulaciones',          href: '/admin/informes' },
    ],
  },
  {
    title: 'Panel de Dirección',
    tag: 'KPIs y rentabilidad',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.12)',
    items: [
      { icon: <LineChart size={20} />,  title: 'KPIs y rentabilidad', desc: 'Indicadores clave, previsiones y objetivos', href: '/admin/director' },
      { icon: <Users size={20} />,      title: 'Comparativas',        desc: 'Comparación de períodos y benchmarks',      href: '/admin/director' },
    ],
  },
  {
    title: 'Fiscalidad',
    tag: 'VERI*FACTU',
    color: '#6082dc',
    bg: 'rgba(96,130,220,0.12)',
    items: [
      { icon: <Shield size={20} />,   title: 'VERI*FACTU',         desc: 'Registros fiscales, encadenamiento y QR fiscal', href: '/admin/verifactu' },
      { icon: <FileText size={20} />, title: 'Registros fiscales', desc: 'Series, facturas emitidas y estado de envío',    href: '/admin/verifactu' },
    ],
  },
  {
    title: 'Auditoría',
    tag: 'Control y permisos',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.12)',
    items: [
      { icon: <Lock size={20} />,        title: 'Permisos por rol', desc: 'Matriz de acceso y control granular por empleado', href: '/admin/permisos' },
      { icon: <ShieldAlert size={20} />, title: 'Registro de auditoría', desc: 'Cambios críticos, anulaciones y correcciones',  href: '/admin/permisos' },
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

export default function AdministracionHub() {
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
          <BarChart3 size={18} style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground">Administración</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Administración</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Administración</h1>
          <p className="text-muted-foreground text-sm">Informes · dirección · fiscalidad · control</p>
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

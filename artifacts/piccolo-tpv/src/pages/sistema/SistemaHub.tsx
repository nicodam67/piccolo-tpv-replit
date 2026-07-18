/**
 * SistemaHub — módulo de sistema, diagnóstico y mantenimiento.
 * Agrupa: diagnóstico, salud, backups, permisos, datos demo, asistente.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  Activity, ShieldCheck, HardDrive, Trash2, Lock, Wand2,
  Zap,
} from 'lucide-react';

const ACCENT = '#8b5cf6';

const SECTIONS: {
  title: string; tag: string; color: string; bg: string;
  items: { icon: React.ReactNode; title: string; desc: string; href: string }[]
}[] = [
  {
    title: 'Diagnóstico',
    tag: 'Estado técnico',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    items: [
      { icon: <Activity size={20} />,    title: 'Diagnóstico técnico',  desc: 'Eventos del sistema, mantenimiento y alertas', href: '/admin/diagnostics' },
      { icon: <Zap size={20} />,         title: 'Estado del sistema',   desc: 'Módulos, hallazgos e informe de preparación',  href: '/admin/sistema' },
    ],
  },
  {
    title: 'Seguridad',
    tag: 'Salud y accesos',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.12)',
    items: [
      { icon: <ShieldCheck size={20} />, title: 'Salud del sistema',    desc: 'Semáforos en tiempo real: BD, impresoras, backups', href: '/admin/salud' },
      { icon: <Lock size={20} />,        title: 'Permisos por rol',     desc: 'Matriz de acceso y overrides por empleado',          href: '/admin/permisos' },
    ],
  },
  {
    title: 'Datos',
    tag: 'Copias y limpieza',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.12)',
    items: [
      { icon: <HardDrive size={20} />,   title: 'Copias de seguridad',  desc: 'Programación, restauración y exportación de backups', href: '/admin/backup' },
      { icon: <Trash2 size={20} />,      title: 'Datos de demostración', desc: 'Purgar registros de simulación antes del go-live',    href: '/admin/datos-demo' },
    ],
  },
  {
    title: 'Mantenimiento',
    tag: 'Puesta en marcha',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    items: [
      { icon: <Wand2 size={20} />, title: 'Asistente de configuración', desc: 'Guía de 16 pasos · simulación · checklist de go-live', href: '/setup' },
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

export default function SistemaHub() {
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
          <ShieldCheck size={18} style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground">Sistema</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Sistema</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Sistema</h1>
          <p className="text-muted-foreground text-sm">Diagnóstico · seguridad · copias · mantenimiento</p>
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

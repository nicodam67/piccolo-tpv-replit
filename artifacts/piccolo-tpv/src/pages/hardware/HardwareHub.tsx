/**
 * HardwareHub — módulo de hardware e instalación.
 * Agrupa: impresoras, KDS, dispositivos, caja automática, instalación.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  PrinterIcon, ListOrdered, Zap, Monitor, Smartphone,
  Coins, Wand2, QrCode, Network, ClipboardCheck,
} from 'lucide-react';

const ACCENT = '#06b6d4';

const SECTIONS: {
  title: string; tag: string; color: string; bg: string;
  items: { icon: React.ReactNode; title: string; desc: string; href: string }[]
}[] = [
  {
    title: 'Impresión',
    tag: 'Impresoras y tickets',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    items: [
      { icon: <Monitor size={20} />,      title: 'Producción unificada', desc: 'Departamentos, KDS, impresoras, routing y cola', href: '/admin/produccion' },
      { icon: <PrinterIcon size={20} />, title: 'Impresoras',          desc: 'Configurar, enrutamiento y plantillas',              href: '/admin/impresoras' },
      { icon: <ListOrdered size={20} />, title: 'Cola de impresión',   desc: 'Pendientes, errores y reimpresiones',                href: '/admin/cola-impresion' },
      { icon: <Zap size={20} />,         title: 'Prueba de impresión', desc: 'Asistente de 10 pasos para verificar cada zona',    href: '/admin/prueba-impresion' },
    ],
  },
  {
    title: 'Pantallas KDS',
    tag: 'Cocina digital',
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.12)',
    items: [
      { icon: <Monitor size={20} />, title: 'Estaciones KDS', desc: 'Pantallas de producción, IPs y ping', href: '/admin/kds-stations' },
    ],
  },
  {
    title: 'Dispositivos',
    tag: 'Red e inventario',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.12)',
    items: [
      { icon: <Smartphone size={20} />, title: 'Dispositivos e inventario', desc: 'Tablets, IPs, MAC y diagnóstico de red',       href: '/admin/devices' },
      { icon: <Network size={20} />,    title: 'Instalación',              desc: 'Inventario de hardware, red y manuales',        href: '/admin/instalacion' },
      { icon: <QrCode size={20} />,     title: 'QR de mesas',              desc: 'Generación e impresión de QR por mesa',         href: '/admin/instalacion/qr' },
    ],
  },
  {
    title: 'Caja automática',
    tag: 'Cash management',
    color: '#3c8cc8',
    bg: 'rgba(60,140,200,0.12)',
    items: [
      { icon: <Coins size={20} />, title: 'Caja automática', desc: 'Configuración, estado y mantenimiento del dispositivo', href: '/admin/caja-automatica' },
    ],
  },
  {
    title: 'Asistente',
    tag: 'Puesta en marcha',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    items: [
      { icon: <ClipboardCheck size={20} />, title: 'Instalación y certificación', desc: 'Guía de hardware, diagnóstico y 39 pruebas físicas', href: '/admin/instalacion/asistente' },
      { icon: <Wand2 size={20} />, title: 'Asistente de configuración', desc: 'Guía de 16 pasos para la puesta en marcha', href: '/setup' },
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

export default function HardwareHub() {
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
          <PrinterIcon size={18} style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground">Hardware e Instalación</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Hardware e Instalación</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Hardware e Instalación</h1>
          <p className="text-muted-foreground text-sm">Impresoras · KDS · dispositivos · red</p>
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

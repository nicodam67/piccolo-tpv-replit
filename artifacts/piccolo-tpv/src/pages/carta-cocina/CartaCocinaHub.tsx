/**
 * CartaCocinaHub — módulo de carta digital y gestión de costes.
 * Agrupa: QR Menú (pendiente de reconstrucción) y Food Cost.
 */
import { useLocation } from 'wouter';
import {
  ChevronLeft, ChevronRight,
  QrCode, Tag, Package, Sliders, Palette, Printer,
  DollarSign, FlaskConical, Truck, ShoppingCart, Warehouse, BarChart3,
  Construction,
} from 'lucide-react';

const QR_ACCENT = '#0ea5e9';
const QR_BG     = 'rgba(14,165,233,0.12)';
const FC_ACCENT = '#f59e0b';
const FC_BG     = 'rgba(245,158,11,0.12)';

interface Item { icon: React.ReactNode; title: string; desc: string; href: string; accent: string; bg: string }

const QR_ITEMS: Item[] = [
  { icon: <Tag size={20} />,      title: 'Categorías',     desc: 'Familias y secciones de la carta',                         href: '/categorias',       accent: QR_ACCENT, bg: QR_BG },
  { icon: <Package size={20} />,  title: 'Productos',      desc: 'Escandallos y carta de productos',                         href: '/productos',        accent: QR_ACCENT, bg: QR_BG },
  { icon: <Sliders size={20} />,  title: 'Modificadores',  desc: 'Opciones, variantes y alérgenos',                          href: '/modificadores',    accent: QR_ACCENT, bg: QR_BG },
  { icon: <Palette size={20} />,  title: 'Branding',       desc: 'Colores, tipografías e imagen del restaurante',            href: '/admin/branding',   accent: QR_ACCENT, bg: QR_BG },
  { icon: <Printer size={20} />,  title: 'Imprimir carta', desc: 'Carta física imprimible en PDF',                           href: '/carta/imprimir',   accent: QR_ACCENT, bg: QR_BG },
];

const FC_ITEMS: Item[] = [
  { icon: <DollarSign size={20} />,  title: 'Vista general',     desc: 'Dashboard de costes y rentabilidad',       href: '/admin/food-cost',           accent: FC_ACCENT, bg: FC_BG },
  { icon: <Package size={20} />,     title: 'Ingredientes',      desc: 'Catálogo de materias primas y alérgenos',  href: '/ingredientes',              accent: FC_ACCENT, bg: FC_BG },
  { icon: <FlaskConical size={20} />, title: 'Escandallos',      desc: 'Recetas con coste y gramaje por plato',    href: '/productos',                 accent: FC_ACCENT, bg: FC_BG },
  { icon: <Truck size={20} />,       title: 'Proveedores',       desc: 'Gestión de proveedores y comparativa',     href: '/admin/proveedores',         accent: FC_ACCENT, bg: FC_BG },
  { icon: <ShoppingCart size={20} />, title: 'Compras',          desc: 'Pedidos, recepciones y facturas',          href: '/admin/pedidos-compra',      accent: FC_ACCENT, bg: FC_BG },
  { icon: <Warehouse size={20} />,   title: 'Stock e inventario',desc: 'Almacenes, movimientos y mermas',          href: '/admin/inventario/fisico',   accent: FC_ACCENT, bg: FC_BG },
  { icon: <BarChart3 size={20} />,   title: 'Informes de costes',desc: 'Márgenes, rentabilidad y comparativas',   href: '/admin/inventario/informes', accent: FC_ACCENT, bg: FC_BG },
];

function HubCard({ item }: { item: Item }) {
  const [, nav] = useLocation();
  return (
    <button
      onClick={() => nav(item.href)}
      className="group text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-secondary/30 bg-card transition-all active:scale-[0.98]"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-150"
        style={{ background: item.bg, color: item.accent }}
      >
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
      </div>
      <ChevronRight
        size={16}
        className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-80 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150"
      />
    </button>
  );
}

export default function CartaCocinaHub() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={() => nav('/admin')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Admin</span>
        </button>
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2">
          <QrCode size={18} style={{ color: QR_ACCENT }} />
          <span className="font-semibold text-foreground">Carta y Cocina</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1 ml-2 text-xs text-muted-foreground">
          <span>Inicio</span>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium">Carta y Cocina</span>
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground mb-1">Carta y Cocina</h1>
          <p className="text-muted-foreground text-sm">QR Menú · productos · escandallos · costes</p>
        </div>

        <div className="space-y-7">
          {/* QR Menú */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <QrCode size={14} style={{ color: QR_ACCENT }} />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">QR Menú</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: QR_BG, color: QR_ACCENT }}>
                Carta digital
              </span>
            </div>

            {/* Aviso QR Menú pendiente de reconstrucción */}
            <div className="flex items-center gap-3 p-4 mb-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
              <Construction size={18} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">QR Menú pendiente de reconstrucción</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  La carta digital se está reconstruyendo desde la base original del restaurante.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QR_ITEMS.map(item => <HubCard key={item.href} item={item} />)}
            </div>
          </div>

          {/* Food Cost */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} style={{ color: FC_ACCENT }} />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Food Cost</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: FC_BG, color: FC_ACCENT }}>
                Costes y stock
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FC_ITEMS.map(item => <HubCard key={item.href} item={item} />)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

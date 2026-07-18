/**
 * FoodCostLayout — layout unificado del módulo Food Cost.
 * Todas las rutas de gestión de stock, compras, costes y proveedores
 * se renderizan dentro de este contenedor con sidebar persistente.
 */
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  FlaskConical,
  Layers,
  Truck,
  ShoppingBag,
  ShoppingCart,
  PackageCheck,
  FileText,
  ScanSearch,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  Trash2,
  Timer,
  GitBranch,
  ShieldAlert,
  Calculator,
  TrendingUp,
  BarChart3,
  Settings,
  GitCompare,
  Star,
  ChevronLeft,
  Menu,
  X,
  DollarSign,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  separator?: boolean;
}

const NAV: NavItem[] = [
  { label: "Vista general",       icon: <LayoutDashboard size={18} />,  href: "/admin/food-cost" },
  // ── Productos & Recetas ───────────────────────────────────────────────────
  { label: "Ingredientes",        icon: <Package size={18} />,          href: "/ingredientes",                  separator: true },
  { label: "Escandallos",         icon: <FlaskConical size={18} />,     href: "/productos" },
  { label: "Subrecetas",          icon: <Layers size={18} />,           href: "/admin/subrecetas" },
  // ── Proveedores & Compras ─────────────────────────────────────────────────
  { label: "Proveedores",         icon: <Truck size={18} />,            href: "/admin/proveedores",             separator: true },
  { label: "Comparar precios",    icon: <Star size={18} />,             href: "/admin/comparacion-precios" },
  { label: "Pedidos de compra",   icon: <ShoppingCart size={18} />,     href: "/admin/pedidos-compra" },
  { label: "Recepciones",         icon: <PackageCheck size={18} />,     href: "/admin/recepcion-mercancia" },
  { label: "Facturas",            icon: <FileText size={18} />,         href: "/admin/facturas-proveedor" },
  { label: "Escáner de facturas", icon: <ScanSearch size={18} />,       href: "/admin/escaner-facturas" },
  { label: "Conciliación",        icon: <GitCompare size={18} />,       href: "/admin/conciliacion" },
  // ── Almacén & Stock ───────────────────────────────────────────────────────
  { label: "Almacenes",           icon: <Warehouse size={18} />,        href: "/admin/almacenes",               separator: true },
  { label: "Inventarios",         icon: <ClipboardList size={18} />,    href: "/admin/inventario/fisico" },
  { label: "Movimientos",         icon: <ArrowLeftRight size={18} />,   href: "/stock" },
  { label: "Mermas",              icon: <Trash2 size={18} />,           href: "/admin/mermas" },
  { label: "Lotes y caducidades", icon: <Timer size={18} />,            href: "/admin/lotes-caducidades" },
  { label: "Trazabilidad",        icon: <GitBranch size={18} />,        href: "/admin/trazabilidad-lotes" },
  { label: "Retirada de lotes",   icon: <ShieldAlert size={18} />,      href: "/admin/retirada-lote" },
  // ── Análisis de costes ────────────────────────────────────────────────────
  { label: "Costes",              icon: <Calculator size={18} />,       href: "/admin/simulador-precios",       separator: true },
  { label: "Márgenes",            icon: <TrendingUp size={18} />,       href: "/admin/rentabilidad" },
  { label: "Informes",            icon: <BarChart3 size={18} />,        href: "/admin/inventario/informes" },
  // ── Configuración ─────────────────────────────────────────────────────────
  { label: "Configuración",       icon: <Settings size={18} />,         href: "/admin/categorias-ingredientes", separator: true },
];

interface Props {
  children: React.ReactNode;
}

export default function FoodCostLayout({ children }: Props) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Find current nav label (longest prefix match wins)
  const activeItem = NAV.filter(n => {
    if (n.href === "/admin/food-cost") return location === n.href;
    return location === n.href || location.startsWith(n.href + "/");
  }).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Top header ────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0 z-30">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Back to admin */}
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Admin</span>
        </button>

        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

        {/* Module title */}
        <div className="flex items-center gap-2">
          <DollarSign size={20} className="text-amber-500" />
          <span className="font-semibold text-foreground">Food Cost</span>
        </div>

        {/* Active section pill */}
        {activeItem && (
          <div className="ml-auto hidden sm:flex">
            <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full font-medium">
              {activeItem.label}
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar overlay (mobile) ─────────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={`
          fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-60 bg-card border-r border-border z-20 flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:z-auto lg:h-auto lg:flex-shrink-0
        `}>
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {NAV.map((item, idx) => {
              const active =
                item.href === "/admin/food-cost"
                  ? location === item.href
                  : location === item.href || location.startsWith(item.href + "/");
              return (
                <div key={item.href}>
                  {item.separator && idx > 0 && (
                    <div className="my-1.5 mx-3 border-t border-border/60" />
                  )}
                  <button
                    onClick={() => navigate(item.href)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 text-left transition-colors
                      ${active
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }
                    `}
                  >
                    <span className={active ? "text-amber-500" : "text-muted-foreground"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

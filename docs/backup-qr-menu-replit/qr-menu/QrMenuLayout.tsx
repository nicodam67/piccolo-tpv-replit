/**
 * QrMenuLayout — layout unificado del módulo QR Menú / Carta Pública.
 * Envuelve las páginas relacionadas: Categorías, Productos, Modificadores, etc.
 * Sigue el mismo patrón que FoodCostLayout y FichajeLayout.
 */
import { useLocation } from "wouter";
import {
  QrCode,
  LayoutDashboard,
  Tag,
  Package,
  Sliders,
  Palette,
  Download,
  Printer,
  Monitor,
  ChevronLeft,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  separator?: boolean;
  external?: boolean;
}

// Accent color for QR Menú module: sky blue
const ACCENT_CLASS = "text-sky-500";
const ACCENT_BG = "bg-sky-500/10";
const ACCENT_TEXT = "text-sky-600 dark:text-sky-400";

const NAV: NavItem[] = [
  // ── Vista general ─────────────────────────────────────────────────────────
  { label: "Vista general", icon: <LayoutDashboard size={18} />, href: "/admin/qr-menu" },
  // ── Carta & Catálogo ──────────────────────────────────────────────────────
  { label: "Categorías",    icon: <Tag size={18} />,             href: "/categorias",     separator: true },
  { label: "Productos",     icon: <Package size={18} />,         href: "/productos" },
  { label: "Modificadores", icon: <Sliders size={18} />,         href: "/modificadores" },
  // ── Diseño & Publicación ──────────────────────────────────────────────────
  { label: "Branding & Publicación", icon: <Palette size={18} />, href: "/admin/qr-menu", separator: true },
  { label: "Exportar CSV",  icon: <Download size={18} />,        href: "/admin/qr-menu" },
  // ── Utilidades externas ───────────────────────────────────────────────────
  { label: "Ver carta pública",  icon: <Monitor size={18} />,  href: "/carta",          separator: true, external: true },
  { label: "Imprimir carta",     icon: <Printer size={18} />,  href: "/carta/imprimir", external: true },
];

interface Props {
  children: React.ReactNode;
}

export default function QrMenuLayout({ children }: Props) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Find current nav label (longest prefix match wins, skip external links)
  const activeItem = NAV.filter(n => {
    if (n.external) return false;
    if (n.href === "/admin/qr-menu") return location === n.href;
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
          <QrCode size={20} className="text-sky-500" />
          <span className="font-semibold text-foreground">QR Menú</span>
        </div>

        {/* Active section pill */}
        {activeItem && (
          <div className="ml-auto hidden sm:flex">
            <span className={`text-xs ${ACCENT_BG} ${ACCENT_TEXT} px-3 py-1 rounded-full font-medium`}>
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
              const active = !item.external && (
                item.href === "/admin/qr-menu"
                  ? location === item.href
                  : location === item.href || location.startsWith(item.href + "/")
              );

              return (
                <div key={`${item.href}-${idx}`}>
                  {item.separator && idx > 0 && (
                    <div className="my-1.5 mx-3 border-t border-border/60" />
                  )}
                  {item.external ? (
                    <a
                      href={`${BASE}${item.href}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <span className="text-muted-foreground">{item.icon}</span>
                      {item.label}
                      <ExternalLink size={11} className="ml-auto opacity-50" />
                    </a>
                  ) : (
                    <button
                      onClick={() => navigate(item.href)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 text-left transition-colors
                        ${active
                          ? `${ACCENT_BG} ${ACCENT_TEXT}`
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }
                      `}
                    >
                      <span className={active ? ACCENT_CLASS : "text-muted-foreground"}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  )}
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

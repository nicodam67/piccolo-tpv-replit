/**
 * PersonalLayout — layout unificado del módulo "Personal y Fichaje".
 * Cubre empleados + todo el control horario en rutas /personal/*.
 * Las rutas /admin/fichaje/* siguen funcionando con FichajeLayout (compatibilidad).
 */
import { useLocation } from "wouter";
import {
  Home,
  Users,
  Fingerprint,
  LayoutDashboard,
  Clock,
  CalendarClock,
  Calendar,
  Coffee,
  AlertCircle,
  FileEdit,
  Umbrella,
  FileX,
  Upload,
  BarChart3,
  Coins,
  UserCircle,
  Settings,
  Shield,
  Tablet,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  section?: string; // section header shown above this item
}

const NAV: NavItem[] = [
  { label: "Inicio",              icon: <Home size={16} />,            href: "/personal",                        section: "" },
  // ── EMPLEADOS ──
  { label: "Empleados",           icon: <Users size={16} />,           href: "/personal/empleados",              section: "Empleados" },
  // ── FICHAJE ──
  { label: "Vista general",       icon: <LayoutDashboard size={16} />, href: "/personal/fichaje",                section: "Fichaje" },
  { label: "Registros",           icon: <Clock size={16} />,           href: "/personal/fichaje/registros" },
  { label: "Turnos",              icon: <CalendarClock size={16} />,   href: "/personal/fichaje/turnos" },
  { label: "Planificación",       icon: <Calendar size={16} />,        href: "/personal/fichaje/planificacion" },
  { label: "Pausas",              icon: <Coffee size={16} />,          href: "/personal/fichaje/pausas" },
  { label: "Incidencias",         icon: <AlertCircle size={16} />,     href: "/personal/fichaje/incidencias" },
  { label: "Correcciones",        icon: <FileEdit size={16} />,        href: "/personal/fichaje/correcciones" },
  { label: "Vacaciones",          icon: <Umbrella size={16} />,        href: "/personal/fichaje/vacaciones" },
  { label: "Ausencias",           icon: <FileX size={16} />,           href: "/personal/fichaje/ausencias" },
  { label: "Importación",         icon: <Upload size={16} />,          href: "/personal/fichaje/importar" },
  { label: "Informes",            icon: <BarChart3 size={16} />,       href: "/personal/fichaje/informes" },
  { label: "Costes laborales",    icon: <Coins size={16} />,           href: "/personal/fichaje/costes" },
  { label: "Portal empleado",     icon: <UserCircle size={16} />,      href: "/personal/fichaje/portal" },
  { label: "Dispositivos",        icon: <Tablet size={16} />,          href: "/personal/fichaje/dispositivos" },
  // ── CONFIGURACIÓN ──
  { label: "Configuración",       icon: <Settings size={16} />,        href: "/personal/fichaje/configuracion",  section: "Configuración" },
  { label: "Auditoría",           icon: <Shield size={16} />,          href: "/personal/fichaje/auditoria" },
  { label: "Tablet de fichaje",   icon: <Fingerprint size={16} />,     href: "/fichaje/tablet" },
];

interface Props {
  children: React.ReactNode;
}

export default function PersonalLayout({ children }: Props) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  function isActive(href: string) {
    if (href === "/personal") return location === "/personal";
    return location === href || location.startsWith(href + "/");
  }

  const currentLabel = NAV.find(n => isActive(n.href))?.label ?? "Personal y Fichaje";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0 z-30">
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Admin</span>
        </button>

        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

        <button
          onClick={() => navigate("/personal")}
          className="flex items-center gap-2 group"
        >
          <div className="flex">
            <Users size={18} className="text-violet-400" />
            <Fingerprint size={18} className="text-teal-400 -ml-1" />
          </div>
          <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
            Personal y Fichaje
          </span>
        </button>

        <div className="ml-auto hidden sm:flex">
          <span className="text-xs bg-violet-500/10 text-violet-400 px-3 py-1 rounded-full font-medium">
            {currentLabel}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Overlay móvil */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <aside className={`
          fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-56 bg-card border-r border-border z-20 flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:z-auto lg:h-auto lg:flex-shrink-0
        `}>
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {NAV.map((item, idx) => {
              const active = isActive(item.href);
              const isExternal = item.href.startsWith("/fichaje/tablet");
              return (
                <div key={item.href}>
                  {/* Section header */}
                  {item.section !== undefined && idx > 0 && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 pt-4 pb-1">
                      {item.section}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (isExternal) window.open(item.href, "_blank");
                      else navigate(item.href);
                    }}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium mb-0.5 text-left transition-colors
                      ${active
                        ? "bg-violet-500/10 text-violet-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }
                    `}
                  >
                    <span className={active ? "text-violet-400" : "text-muted-foreground"}>
                      {item.icon}
                    </span>
                    {item.label}
                    {isExternal && (
                      <span className="ml-auto text-[9px] text-muted-foreground/50 font-normal">↗</span>
                    )}
                  </button>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

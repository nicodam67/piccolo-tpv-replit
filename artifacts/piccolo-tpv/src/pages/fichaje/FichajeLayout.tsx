/**
 * FichajeLayout — layout unificado del módulo de control horario.
 * Todas las rutas /admin/fichaje/* y /fichaje se renderizan dentro de este
 * contenedor con una sidebar de navegación lateral persistente.
 */
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Clock,
  Users,
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
  ChevronLeft,
  Menu,
  X,
  Fingerprint,
  Tablet,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: string;
}

const NAV: NavItem[] = [
  { label: "Vista general",       icon: <LayoutDashboard size={18} />,   href: "/admin/fichaje" },
  { label: "Fichar",              icon: <Fingerprint size={18} />,       href: "/fichaje" },
  { label: "Registros",           icon: <Clock size={18} />,             href: "/admin/fichaje/registros" },
  { label: "Empleados",           icon: <Users size={18} />,             href: "/admin/fichaje/empleados" },
  { label: "Turnos",              icon: <CalendarClock size={18} />,     href: "/admin/fichaje/turnos" },
  { label: "Planificación",       icon: <Calendar size={18} />,          href: "/admin/fichaje/planificacion" },
  { label: "Pausas",              icon: <Coffee size={18} />,            href: "/admin/fichaje/pausas" },
  { label: "Incidencias",         icon: <AlertCircle size={18} />,       href: "/admin/fichaje/incidencias" },
  { label: "Correcciones",        icon: <FileEdit size={18} />,          href: "/admin/fichaje/correcciones" },
  { label: "Vacaciones",          icon: <Umbrella size={18} />,          href: "/admin/fichaje/vacaciones" },
  { label: "Ausencias",           icon: <FileX size={18} />,             href: "/admin/fichaje/ausencias" },
  { label: "Importación",         icon: <Upload size={18} />,            href: "/admin/fichaje/importar" },
  { label: "Informes",            icon: <BarChart3 size={18} />,         href: "/admin/fichaje/informes" },
  { label: "Costes laborales",    icon: <Coins size={18} />,             href: "/admin/fichaje/costes" },
  { label: "Portal empleado",     icon: <UserCircle size={18} />,        href: "/admin/fichaje/portal" },
  { label: "Configuración",       icon: <Settings size={18} />,          href: "/admin/fichaje/configuracion" },
  { label: "Auditoría",           icon: <Shield size={18} />,            href: "/admin/fichaje/auditoria" },
  { label: "Dispositivos",        icon: <Tablet size={18} />,            href: "/admin/fichaje/dispositivos" },
];

interface Props {
  children: React.ReactNode;
}

export default function FichajeLayout({ children }: Props) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Top header ──────────────────────────────────────────────────────── */}
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
          <Fingerprint size={20} className="text-teal-500" />
          <span className="font-semibold text-foreground">Control Horario</span>
        </div>

        {/* Active section pill */}
        <div className="ml-auto hidden sm:flex">
          {NAV.find(n => n.href === location) && (
            <span className="text-xs bg-teal-500/10 text-teal-600 dark:text-teal-400 px-3 py-1 rounded-full font-medium">
              {NAV.find(n => n.href === location)?.label}
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar overlay (mobile) ───────────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside className={`
          fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-60 bg-card border-r border-border z-20 flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:z-auto lg:h-auto lg:flex-shrink-0
        `}>
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {NAV.map(item => {
              const active = location === item.href ||
                (item.href !== "/admin/fichaje" && location.startsWith(item.href));
              return (
                <button
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 text-left transition-colors
                    ${active
                      ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }
                  `}
                >
                  <span className={active ? "text-teal-500" : "text-muted-foreground"}>
                    {item.icon}
                  </span>
                  {item.label}
                  {item.badge && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

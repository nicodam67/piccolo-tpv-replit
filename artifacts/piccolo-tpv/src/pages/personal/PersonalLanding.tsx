/**
 * PersonalLanding — punto de entrada del módulo unificado "Personal y Fichaje".
 * Muestra dos grandes tarjetas: Empleados y Fichaje.
 */
import { useLocation } from "wouter";
import { Users, Fingerprint, ChevronRight, ChevronLeft } from "lucide-react";

export default function PersonalLanding() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Admin</span>
        </button>

        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="flex">
            <Users size={18} className="text-violet-400" />
            <Fingerprint size={18} className="text-teal-400 -ml-1" />
          </div>
          <span className="font-semibold text-foreground">Personal y Fichaje</span>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 sm:px-8 py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-black text-foreground mb-1">Personal y Fichaje</h1>
          <p className="text-muted-foreground text-sm">Elige la sección que quieres gestionar</p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Empleados */}
          <button
            onClick={() => navigate("/personal/empleados")}
            className="group relative text-left rounded-2xl border border-violet-500/25 p-6 flex items-center gap-5 transition-all duration-150 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] cursor-pointer bg-violet-500/5 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ boxShadow: "0 8px 32px rgba(160,100,220,0.15)" }} />
            <div className="w-16 h-16 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110">
              <Users size={32} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-foreground mb-1">Empleados</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Altas, bajas, roles, PIN, NFC y documentación
              </p>
            </div>
            <ChevronRight size={20} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150" />
          </button>

          {/* Fichaje */}
          <button
            onClick={() => navigate("/personal/fichaje")}
            className="group relative text-left rounded-2xl border border-teal-500/25 p-6 flex items-center gap-5 transition-all duration-150 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] cursor-pointer bg-teal-500/5 hover:bg-teal-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ boxShadow: "0 8px 32px rgba(20,184,166,0.15)" }} />
            <div className="w-16 h-16 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110">
              <Fingerprint size={32} className="text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-foreground mb-1">Fichaje</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Entradas, salidas, pausas, registros e informes
              </p>
            </div>
            <ChevronRight size={20} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1 group-hover:translate-x-0 duration-150" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[
            { label: "Fichar ahora",     path: "/fichaje",                   emoji: "🕐" },
            { label: "Tablet fichaje",   path: "/fichaje/tablet",             emoji: "📱" },
            { label: "Hoy en detalle",   path: "/personal/fichaje",           emoji: "📋" },
            { label: "Configuración",    path: "/personal/fichaje/configuracion", emoji: "⚙️" },
          ].map(q => (
            <button
              key={q.path}
              onClick={() => navigate(q.path)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/40 transition-all text-center"
            >
              <span className="text-2xl">{q.emoji}</span>
              <span className="text-xs font-semibold text-muted-foreground leading-tight">{q.label}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * CartaCocinaHub — ZONA EN RECONSTRUCCIÓN.
 *
 * El módulo "Carta y Cocina" (QR Menú + Food Cost) está siendo
 * reconstruido desde una base limpia.
 *
 * Esta página es el único punto de entrada temporal hasta que
 * el nuevo diseño esté aprobado e implementado.
 *
 * NO contiene:
 * - Convex / Hercules
 * - iframes
 * - tarjetas de navegación fragmentadas
 * - imports CSS externos
 * - datos demo
 */
import { useLocation } from 'wouter';
import { ChevronLeft, Construction } from 'lucide-react';

export default function CartaCocinaHub() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={() => nav('/admin')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span>Volver al panel</span>
        </button>
      </header>

      {/* Contenido */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full text-center space-y-6">
          {/* Icono */}
          <div className="w-24 h-24 rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto">
            <Construction size={40} className="text-amber-500" />
          </div>

          {/* Texto */}
          <div>
            <h1 className="text-2xl font-black text-foreground mb-2">
              Carta y Cocina
            </h1>
            <p className="text-base font-medium text-amber-600 dark:text-amber-400 mb-3">
              En reconstrucción
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Carta y Cocina se está reconstruyendo desde una base limpia.
            </p>
          </div>

          {/* Botón volver */}
          <button
            onClick={() => nav('/admin')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <ChevronLeft size={16} />
            Volver al panel
          </button>
        </div>
      </main>
    </div>
  );
}

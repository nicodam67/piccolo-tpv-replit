/**
 * QrMenuPlaceholder — zona limpia reservada para la reconstrucción del QR Menú.
 *
 * Esta página reemplaza temporalmente la integración iframe fallida.
 * No carga Convex, Hercules, iframes, CSS externos ni datos demo.
 * Cuando el nuevo QR Menú esté listo, este componente será sustituido.
 */
import { useLocation } from 'wouter';
import { ChevronLeft, QrCode, Construction } from 'lucide-react';

export default function QrMenuPlaceholder() {
  const [, nav] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={() => nav('/carta-cocina')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Carta y Cocina</span>
        </button>
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-sky-500" />
          <span className="font-semibold text-foreground">QR Menú</span>
        </div>
      </header>

      {/* Contenido placeholder */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-5">
          <div className="w-20 h-20 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto">
            <Construction size={36} className="text-amber-500" />
          </div>

          <div>
            <h1 className="text-xl font-black text-foreground mb-2">
              QR Menú en reconstrucción
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              La carta digital está siendo reconstruida desde la base original.
              Volverá disponible en breve con el diseño completo del restaurante.
            </p>
          </div>

          <div className="text-xs text-muted-foreground/60 pt-2">
            Piccolo la Ràpita · Carta digital
          </div>
        </div>
      </main>
    </div>
  );
}

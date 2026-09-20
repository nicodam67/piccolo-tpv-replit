/**
 * CartaCocinaHub — punto de entrada temporal al módulo Carta y Cocina.
 *
 * Muestra el QR Menú público y reserva espacio para las herramientas de
 * gestión que se añadirán en fases posteriores.
 */
import { useLocation } from 'wouter';
import { ChevronLeft, QrCode, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { customFetch } from '@workspace/api-client-react';

export default function CartaCocinaHub() {
  const [, nav] = useLocation();
  const [qrMenuHref, setQrMenuHref] = useState<string | null>(null);

  useEffect(() => {
    customFetch<{ externalQrMenuUrl?: string | null }>('/api/public/branding')
      .then((data) => setQrMenuHref(data.externalQrMenuUrl ?? null))
      .catch(() => setQrMenuHref(null));
  }, []);

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
        <span className="text-sm font-semibold text-foreground">Carta y Cocina</span>
      </header>

      {/* Contenido */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full text-center space-y-6">

          {/* Icono QR */}
          <div className="w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <QrCode size={40} className="text-primary" />
          </div>

          {/* Texto */}
          <div>
            <h1 className="text-2xl font-black text-foreground mb-2">
              QR Menú
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Carta pública para clientes — escanea el QR de mesa o comparte el enlace directo.
            </p>
          </div>

          {/* Botón principal — abre en nueva pestaña */}
          {qrMenuHref ? (
            <>
              <a
                href={qrMenuHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity w-full justify-center"
              >
                <QrCode size={16} />
                Ver carta pública
                <ExternalLink size={14} className="ml-1 opacity-70" />
              </a>
              <div className="bg-muted/50 rounded-lg p-3 text-left">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Enlace externo configurado</p>
                <p className="text-xs font-mono text-foreground break-all select-all">{qrMenuHref}</p>
              </div>
            </>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-500">
              El QR oficial no está configurado. Define PICCOLO_QR_MENU_URL en el servidor.
            </div>
          )}

          <p className="text-xs text-muted-foreground/60">
            Fase 1 — diseño en validación
          </p>
        </div>
      </main>
    </div>
  );
}

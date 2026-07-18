/**
 * QrMenuEmbed — muestra el QR Menú original (artifacts/qr-menu) embebido en un
 * iframe de pantalla completa dentro del módulo "Carta y Cocina" del TPV.
 *
 * El QR Menú mantiene exactamente su diseño, tipografías, colores, navegación,
 * panel de admin y toda su funcionalidad original — sin modificaciones.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, QrCode, Loader2, AlertCircle } from 'lucide-react';

/** URL del artifact qr-menu en el mismo entorno Replit */
function getQrMenuUrl(): string {
  // En Replit el proxy usa path-based routing: /piccolo-tpv/ y /qr-menu/
  // son rutas del mismo dominio. Reemplazamos el segmento del TPV por /qr-menu/
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL ?? '/piccolo-tpv/';
  // Quitar el segment del TPV → subir al dominio raíz → añadir /qr-menu/
  const tpvSegment = base.replace(/\/$/, ''); // "/piccolo-tpv"
  const rootPath = tpvSegment.includes('/')
    ? tpvSegment.substring(0, tpvSegment.lastIndexOf('/'))
    : '';
  return `${origin}${rootPath}/qr-menu/`;
}

export default function QrMenuEmbed() {
  const [, nav] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);
  const qrUrl = getQrMenuUrl();

  // Timeout: si después de 12s el iframe no carga, mostramos error
  useEffect(() => {
    const t = setTimeout(() => {
      if (loading) setError(true);
    }, 12_000);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-10">
      {/* ── Header TPV ── */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-card flex-shrink-0 z-20">
        <button
          onClick={() => nav('/carta-cocina')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Carta y Cocina</span>
        </button>
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2">
          <QrCode size={16} className="text-sky-500" />
          <span className="font-semibold text-foreground text-sm">Carta QR</span>
        </div>

        {loading && !error && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Cargando…
          </div>
        )}
      </header>

      {/* ── Cuerpo: iframe o error ── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 p-8 text-center">
          <AlertCircle size={40} className="text-destructive" />
          <div>
            <p className="font-semibold text-foreground">No se pudo cargar la Carta QR</p>
            <p className="text-sm text-muted-foreground mt-1">
              Verifica que el workflow <strong>artifacts/qr-menu: web</strong> esté en ejecución.
            </p>
            <code className="block mt-2 text-xs bg-muted px-3 py-1 rounded-md text-muted-foreground">{qrUrl}</code>
          </div>
          <button
            onClick={() => { setError(false); setLoading(true); if (iframeRef.current) iframeRef.current.src = qrUrl; }}
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={qrUrl}
          title="Carta QR — Piccolo la Ràpita"
          className="flex-1 w-full border-none"
          style={{ display: loading ? 'none' : 'block' }}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          allow="clipboard-write; fullscreen"
        />
      )}

      {/* Skeleton mientras carga */}
      {loading && !error && (
        <div className="flex-1 bg-card animate-pulse" />
      )}
    </div>
  );
}

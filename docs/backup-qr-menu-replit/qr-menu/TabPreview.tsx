import { useState, useCallback } from 'react';
import { RefreshCw, Smartphone, Tablet, Monitor, ExternalLink } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const VIEWPORTS = [
  { id: 'mobile',  label: 'Móvil',   width: 375,  height: 812,  Icon: Smartphone },
  { id: 'tablet',  label: 'Tablet',  width: 768,  height: 900,  Icon: Tablet },
  { id: 'desktop', label: 'Desktop', width: 1280, height: 800,  Icon: Monitor },
] as const;
type ViewportId = typeof VIEWPORTS[number]['id'];

export default function TabPreview() {
  const [viewport, setViewport] = useState<ViewportId>('mobile');
  const [key, setKey] = useState(0);
  const vp = VIEWPORTS.find((v) => v.id === viewport)!;
  const cartaUrl = `${window.location.origin}${BASE}/carta`;

  const refresh = useCallback(() => setKey((k) => k + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Viewport selector */}
        <div className="flex gap-1">
          {VIEWPORTS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewport(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewport === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
          <a
            href={cartaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors"
          >
            <ExternalLink size={13} />
            Abrir en nueva pestaña
          </a>
        </div>
      </div>

      {/* Preview frame */}
      <div className="flex justify-center">
        <div
          className="relative rounded-2xl overflow-hidden border-2 border-gray-200 shadow-xl bg-gray-100"
          style={{
            width: Math.min(vp.width, 900),
            height: vp.height,
          }}
        >
          <iframe
            key={key}
            src={cartaUrl}
            style={{ width: vp.width, height: vp.height, transform: `scale(${Math.min(900, vp.width) / vp.width})`, transformOrigin: 'top left', border: 'none' }}
            title="Vista previa de la carta pública"
          />
        </div>
      </div>
      <p className="text-xs text-center text-gray-400">
        Vista previa en {viewport} ({vp.width}×{vp.height}px). Los cambios se reflejan al actualizar.
      </p>
    </div>
  );
}

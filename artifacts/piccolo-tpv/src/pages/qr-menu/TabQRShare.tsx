import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Check } from 'lucide-react';

export default function TabQRShare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');

  // Derive the carta URL from the current window location
  const cartaUrl = (() => {
    const url = new URL(window.location.href);
    // Find the base path from the current app (piccolo-tpv base)
    // The carta is at the same base but at /carta
    const pathname = url.pathname;
    // Strip /admin/qr-menu from the end to get the base path
    const basePath = pathname.replace(/\/admin\/qr-menu.*$/, '');
    return `${url.origin}${basePath}/carta`;
  })();

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, cartaUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).catch(() => {});
  }, [cartaUrl]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(cartaUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = cartaUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function downloadQR() {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `qr-carta-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }

  function printQR() {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>QR Carta</title>
      <style>
        @media print { body { margin: 0; } }
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; padding: 40px; }
        img { max-width: 300px; }
        p { margin-top: 12px; font-size: 14px; color: #555; word-break: break-all; text-align: center; max-width: 300px; }
      </style>
      </head><body>
      <img src="${dataUrl}" alt="QR Carta" />
      <p>${cartaUrl}</p>
      <script>window.onload = function(){ window.print(); window.close(); }</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-5 py-4">
        <div className="p-4 bg-white rounded-2xl shadow border border-gray-100">
          <canvas ref={canvasRef} className="block rounded" />
        </div>
        <div className="w-full max-w-sm space-y-2">
          <div className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <span className="flex-1 truncate text-gray-600 text-xs font-mono">{cartaUrl}</span>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 flex items-center gap-1 text-xs font-medium cursor-pointer text-gray-600 hover:text-gray-900 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadQR}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Download size={15} />
              Descargar PNG
            </button>
            <button
              type="button"
              onClick={printQR}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors cursor-pointer"
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">💡 Cómo usar el QR</p>
        <ul className="list-disc list-inside text-xs space-y-1 text-blue-600">
          <li>Descarga el PNG e insértalo en tu diseño de mesa, cartel o web.</li>
          <li>Puedes colocar este QR en la mesa para que los clientes vean la carta en su móvil.</li>
          <li>La carta pública no requiere registro ni login.</li>
          <li>La URL siempre apunta a la carta actualizada — si cambias productos, se refleja inmediatamente.</li>
        </ul>
      </div>
    </div>
  );
}

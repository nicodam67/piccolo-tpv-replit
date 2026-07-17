/**
 * admin-instalacion-qr.tsx
 * QR code generator for restaurant tables.
 * Uses the qrcode package to generate client-side QR codes.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import QRCode from 'qrcode';
import {
  ArrowLeft, QrCode, Download, Printer as PrinterIcon,
  RefreshCw, CheckSquare, Square, Globe, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

function api(path: string) {
  const token = localStorage.getItem('token') ?? '';
  return fetch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); });
}

interface TableItem {
  id: string;
  name: string;
  capacity?: number;
  status?: string;
  zoneId?: string;
  zoneName?: string;
}

interface Zone {
  id: string;
  name: string;
}

function useQRDataUrl(url: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [url]);
  return dataUrl;
}

function QRCard({ table, baseUrl, selected, onToggle }: {
  table: TableItem;
  baseUrl: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const url = `${baseUrl}/carta/mesa/${table.id}`;
  const dataUrl = useQRDataUrl(url);

  const downloadPng = useCallback(() => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR-${table.name.replace(/\s+/g, '-')}.png`;
    a.click();
  }, [dataUrl, table.name]);

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all ${
      selected ? 'border-primary shadow-lg shadow-primary/10' : 'border-border'
    }`}>
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <button onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground">
          {selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{table.name}</p>
          {table.zoneName && <p className="text-xs text-muted-foreground truncate">{table.zoneName}</p>}
        </div>
        <button onClick={downloadPng} disabled={!dataUrl}
          title="Descargar PNG"
          className="p-1.5 hover:bg-secondary rounded-lg transition-colors disabled:opacity-40 text-muted-foreground">
          <Download size={14} />
        </button>
      </div>
      <div className="p-4 flex flex-col items-center gap-3">
        {dataUrl
          ? <img src={dataUrl} alt={`QR ${table.name}`} className="w-[120px] h-[120px] rounded-lg border border-border" />
          : <div className="w-[120px] h-[120px] rounded-lg border border-border flex items-center justify-center bg-secondary/30">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
        }
        <p className="text-[10px] text-muted-foreground font-mono break-all text-center leading-relaxed max-w-[180px]">
          {url}
        </p>
      </div>
    </div>
  );
}

/**
 * PrintPortal renders the print area as a direct body child via React portal
 * so that the print CSS rule `body > *:not(#print-area) { display: none }`
 * correctly hides the app shell while keeping the QR pages visible.
 */
function PrintPortal({ tables, baseUrl }: { tables: TableItem[]; baseUrl: string }) {
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [container] = useState(() => {
    const el = document.createElement('div');
    el.id = 'print-area';
    el.style.cssText = 'display:none';
    document.body.appendChild(el);
    return el;
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => { document.body.removeChild(container); };
  }, [container]);

  // Generate QR data URLs whenever tables/baseUrl change
  useEffect(() => {
    setQrUrls({});
    tables.forEach(t => {
      const url = `${baseUrl}/carta/mesa/${t.id}`;
      QRCode.toDataURL(url, { width: 500, margin: 3, errorCorrectionLevel: 'M' })
        .then(d => setQrUrls(prev => ({ ...prev, [t.id]: d })))
        .catch(() => {});
    });
  }, [tables, baseUrl]);

  const content = (
    <>
      <style>{`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; }
          .qr-page { page-break-after: always; }
          .qr-page:last-child { page-break-after: avoid; }
        }
      `}</style>
      {tables.map(t => (
        <div key={t.id} className="qr-page" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '2rem',
        }}>
          <div style={{
            border: '4px solid black', borderRadius: '1rem', padding: '2rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
            maxWidth: '320px', width: '100%', background: 'white',
          }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, color: 'black', margin: 0 }}>{t.name}</p>
            {qrUrls[t.id]
              ? <img src={qrUrls[t.id]} alt={`QR ${t.name}`} style={{ width: 256, height: 256 }} />
              : <div style={{ width: 256, height: 256, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.75rem' }}>Generando…</div>
            }
            <p style={{ fontSize: '0.65rem', color: '#6b7280', textAlign: 'center', wordBreak: 'break-all', margin: 0 }}>
              {baseUrl}/carta/mesa/{t.id}
            </p>
          </div>
        </div>
      ))}
    </>
  );

  return createPortal(content, container);
}

export default function AdminInstalacionQR() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);
  const [filterZone, setFilterZone] = useState('');

  useEffect(() => {
    Promise.all([
      api('/zones').catch(() => []),
      api('/admin/installation/devices').catch(() => []),
    ]).then(([zs, _devs]) => {
      setZones(zs);
    }).catch(() => {});

    api('/zones')
      .then(async (zs: Zone[]) => {
        setZones(zs);
        const allTables: TableItem[] = [];
        await Promise.all(
          zs.map(async (z: Zone) => {
            const ts = await api(`/zones/${z.id}/tables`).catch(() => []) as any[];
            ts.forEach((t: any) => allTables.push({ ...t, zoneName: z.name }));
          })
        );
        setTables(allTables.sort((a, b) => a.name.localeCompare(b.name)));
        setSelected(new Set(allTables.map(t => t.id)));
      })
      .catch(() => toast.error('Error al cargar mesas'))
      .finally(() => setLoading(false));
  }, []);

  const toggleAll = () => {
    if (selected.size === filteredTables.length) setSelected(new Set());
    else setSelected(new Set(filteredTables.map(t => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const printSelected = () => {
    window.print();
  };

  const downloadAllPngs = async () => {
    const toDownload = filteredTables.filter(t => selected.has(t.id));
    for (const t of toDownload) {
      const url = `${baseUrl}/carta/mesa/${t.id}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 3, errorCorrectionLevel: 'M' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR-${t.name.replace(/\s+/g, '-')}.png`;
      a.click();
      await new Promise(r => setTimeout(r, 100));
    }
    toast.success(`${toDownload.length} QR descargados`);
  };

  const filteredTables = filterZone
    ? tables.filter(t => zones.find(z => z.id === filterZone)?.name === t.zoneName)
    : tables;

  const selectedTables = filteredTables.filter(t => selected.has(t.id));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Print portal — renders QR pages as direct body children so print CSS works correctly */}
      <PrintPortal tables={selectedTables} baseUrl={baseUrl} />

      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 print:hidden">
        <Link href="/admin/instalacion">
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <QrCode size={20} className="text-primary" />
        <h1 className="font-black text-base flex-1">Códigos QR de mesas</h1>
        <div className="flex items-center gap-2">
          <button onClick={printSelected} disabled={selectedTables.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-border hover:bg-secondary disabled:opacity-50">
            <PrinterIcon size={13} /> PDF ({selectedTables.length})
          </button>
          <button onClick={downloadAllPngs} disabled={selectedTables.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Download size={13} /> PNG × {selectedTables.length}
          </button>
        </div>
      </header>

      {/* Controls */}
      <div className="px-4 py-4 flex flex-col sm:flex-row gap-3 print:hidden">
        <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl flex-1">
          <Globe size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">URL base:</span>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="flex-1 bg-transparent text-xs font-mono focus:outline-none min-w-0"
            placeholder="https://turestaurante.com"
          />
        </div>
        {zones.length > 0 && (
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
            className="px-3 py-2 text-xs bg-card border border-border rounded-xl">
            <option value="">Todas las zonas</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        )}
        <button onClick={toggleAll}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-border hover:bg-secondary">
          {selected.size === filteredTables.length ? <CheckSquare size={13} /> : <Square size={13} />}
          {selected.size === filteredTables.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
      </div>

      {/* QR URL format info */}
      {tables.length > 0 && (
        <div className="mx-4 mb-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 print:hidden">
          <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Los QR apuntan a <strong className="font-mono">{baseUrl}/carta/mesa/&lt;id&gt;</strong>. 
            Ajusta la URL base si tu carta pública tiene un dominio propio.
          </p>
        </div>
      )}

      {/* Grid */}
      <main className="flex-1 px-4 pb-8 print:hidden">
        {loading ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <RefreshCw size={24} className="animate-spin mr-3" /> Cargando mesas…
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="text-center py-16">
            <QrCode size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No hay mesas configuradas.</p>
            <Link href="/configuracion">
              <p className="text-primary text-xs mt-2 hover:underline cursor-pointer">Ir al editor de salas →</p>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredTables.map(t => (
              <QRCard key={t.id} table={t} baseUrl={baseUrl}
                selected={selected.has(t.id)} onToggle={() => toggleOne(t.id)} />
            ))}
          </div>
        )}
      </main>

      {/* No inline print styles needed — PrintPortal injects its own via portal */}
    </div>
  );
}

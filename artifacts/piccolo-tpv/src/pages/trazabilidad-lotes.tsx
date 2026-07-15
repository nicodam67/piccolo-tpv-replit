/**
 * Trazabilidad de Lotes — lot traceability search and trace report
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft, Search, AlertTriangle, Package, ShieldAlert, CheckCircle,
  X, Calendar, ChevronRight, Loader2,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Lot {
  id: string;
  lotNumber: string;
  ingredientId: string;
  ingredientName: string;
  supplierId?: string;
  supplierName?: string;
  expiryDate?: string;
  initialQty: string;
  remainingQty: string;
  createdAt: string;
  isBlocked: boolean;
  block?: { reason: string; blockedAt: string; resolvedAt?: string } | null;
}

interface TraceReport {
  lot: Lot;
  isBlocked: boolean;
  affectedProducts: { id: string; name: string }[];
  affectedOrders: { id: string; tableId?: string; tableNumber?: string; date: string }[];
  block: { id: string; reason: string; blockedAt: string; resolvedAt?: string } | null;
  movementCount: number;
}

async function authFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('token');
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

export default function TrazabilidadLotes() {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState('');
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLot, setSelectedLot] = useState<TraceReport | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);

  async function fetchLots(query = '') {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/traceability/lots?q=${encodeURIComponent(query)}&limit=100`);
      if (!res.ok) throw new Error();
      setLots(await res.json());
    } catch {
      toast.error('Error cargando lotes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLots(); }, []);

  async function openTrace(lot: Lot) {
    setTraceLoading(true);
    setSelectedLot(null);
    try {
      const res = await authFetch(`/api/admin/traceability/lots/${lot.id}`);
      if (!res.ok) throw new Error();
      setSelectedLot(await res.json());
    } catch {
      toast.error('Error cargando traza');
    } finally {
      setTraceLoading(false);
    }
  }

  async function handleBlock() {
    if (!selectedLot || !blockReason.trim()) { toast.error('El motivo es obligatorio'); return; }
    setBlocking(true);
    try {
      const res = await authFetch(`/api/admin/traceability/lots/${selectedLot.lot.id}/block`, {
        method: 'POST', body: JSON.stringify({ reason: blockReason }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Error'); }
      toast.success('Lote bloqueado correctamente');
      setShowBlockModal(false);
      setBlockReason('');
      await openTrace(selectedLot.lot);
      fetchLots(q);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBlocking(false);
    }
  }

  const filtered = q.length >= 2
    ? lots.filter(l =>
        l.lotNumber.toLowerCase().includes(q.toLowerCase()) ||
        l.ingredientName.toLowerCase().includes(q.toLowerCase()) ||
        (l.supplierName ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : lots;

  const isExpired = (lot: Lot) => lot.expiryDate ? new Date(lot.expiryDate) < new Date() : false;
  const statusLabel = (lot: Lot) =>
    lot.isBlocked ? 'BLOQUEADO' : isExpired(lot) ? 'CADUCADO' : 'ACTIVO';
  const statusClass = (lot: Lot) =>
    lot.isBlocked ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : isExpired(lot) ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
    : 'bg-green-500/20 text-green-400 border-green-500/40';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-black text-lg leading-tight">Trazabilidad de Lotes</h1>
          <p className="text-xs text-muted-foreground">Busca un lote y consulta su trazabilidad completa</p>
        </div>
        <div className="ml-auto">
          <button onClick={() => setLocation('/admin/retirada-lote')} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-1.5">
            <ShieldAlert size={13} /> Retiradas activas
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Lot list */}
        <div className="w-full max-w-sm border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
                placeholder="Lote, ingrediente, proveedor…"
                value={q}
                onChange={e => { setQ(e.target.value); if (e.target.value.length === 0 || e.target.value.length >= 2) fetchLots(e.target.value); }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 size={18} className="animate-spin mr-2" /> Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Sin lotes</div>
            ) : filtered.map(lot => (
              <button
                key={lot.id}
                onClick={() => openTrace(lot)}
                className={`w-full text-left px-3 py-3 hover:bg-secondary/50 transition-colors flex items-start gap-3 ${selectedLot?.lot.id === lot.id ? 'bg-primary/10 border-l-2 border-primary' : ''}`}
              >
                <Package size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{lot.lotNumber}</div>
                  <div className="text-xs text-muted-foreground truncate">{lot.ingredientName}</div>
                  {lot.expiryDate && (
                    <div className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                      <Calendar size={10} /> Cad. {new Date(lot.expiryDate).toLocaleDateString('es-ES')}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${statusClass(lot)}`}>
                  {statusLabel(lot)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Trace detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {traceLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 size={24} className="animate-spin mr-3" /> Cargando traza…
            </div>
          ) : !selectedLot ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <Search size={40} className="opacity-20" />
              <p className="text-sm">Selecciona un lote para ver su trazabilidad</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Lot header */}
              <div className={`rounded-2xl border p-5 ${selectedLot.isBlocked ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-card'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xl">{selectedLot.lot.lotNumber}</span>
                      <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full border ${statusClass({ ...selectedLot.lot, isBlocked: selectedLot.isBlocked, block: selectedLot.block })}`}>
                        {statusLabel({ ...selectedLot.lot, isBlocked: selectedLot.isBlocked, block: selectedLot.block })}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{selectedLot.lot.ingredientName}</div>
                    {selectedLot.lot.supplierName && (
                      <div className="text-xs text-muted-foreground/60 mt-0.5">Proveedor: {selectedLot.lot.supplierName}</div>
                    )}
                  </div>
                  {!selectedLot.isBlocked && (
                    <button onClick={() => setShowBlockModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-1">
                      <ShieldAlert size={12} /> Bloquear lote
                    </button>
                  )}
                </div>
                {selectedLot.block && (
                  <div className="mt-3 p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-sm text-red-300">
                    <strong>⚠ Bloqueado:</strong> {selectedLot.block.reason}
                    <span className="text-xs ml-2 text-red-400/70">{new Date(selectedLot.block.blockedAt).toLocaleString('es-ES')}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Cantidad inicial</div>
                    <div className="font-black text-lg">{selectedLot.lot.initialQty}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Cantidad restante</div>
                    <div className="font-black text-lg">{selectedLot.lot.remainingQty}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Movimientos</div>
                    <div className="font-black text-lg">{selectedLot.movementCount}</div>
                  </div>
                </div>
              </div>

              {/* Affected products */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-black text-sm mb-3 flex items-center gap-2">
                  <Package size={14} /> Productos afectados ({selectedLot.affectedProducts.length})
                </h3>
                {selectedLot.affectedProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin productos</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedLot.affectedProducts.map(p => (
                      <span key={p.id} className="px-2 py-1 rounded-lg bg-secondary text-xs font-semibold">{p.name}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Affected orders */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-black text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-orange-400" />
                  Ventas potencialmente afectadas ({selectedLot.affectedOrders.length})
                </h3>
                {selectedLot.affectedOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ventas registradas en el período</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedLot.affectedOrders.slice(0, 50).map((o, i) => (
                      <div key={i} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-secondary">
                        <span className="text-muted-foreground font-mono">{o.id.slice(0, 8)}…</span>
                        <span>{o.tableNumber ? `Mesa ${o.tableNumber}` : '—'}</span>
                        <span className="text-muted-foreground/60">{new Date(o.date).toLocaleDateString('es-ES')}</span>
                      </div>
                    ))}
                    {selectedLot.affectedOrders.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">+{selectedLot.affectedOrders.length - 50} más</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Block modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-red-400 flex items-center gap-2"><ShieldAlert size={16} /> Bloquear lote</h3>
              <button onClick={() => setShowBlockModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Lote <strong className="text-foreground">{selectedLot?.lot.lotNumber}</strong> — {selectedLot?.lot.ingredientName}
            </p>
            <p className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2">
              ⚠ Bloquear este lote lo marcará como retirado. Se generará un informe de afectación.
            </p>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Motivo de la retirada *</label>
              <textarea
                className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50 resize-none"
                rows={3} placeholder="Ej: Alerta RASFF por presencia de Listeria…"
                value={blockReason} onChange={e => setBlockReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockModal(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
              <button onClick={handleBlock} disabled={blocking || !blockReason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">
                {blocking ? 'Bloqueando…' : 'Bloquear lote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Retirada de Lotes — lot recall and block management
 */
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft, ShieldAlert, CheckCircle, AlertTriangle, X, Loader2,
  Package, Calendar, Search,
} from 'lucide-react';

import { api } from '../lib/api-client';

interface Block {
  id: string;
  lotId: string;
  lotNumber: string;
  ingredientId?: string;
  ingredientName?: string;
  blockedAt: string;
  reason: string;
  blockReport?: {
    affectedIngredients: { id: string; name: string }[];
    affectedProducts: { id: string; name: string }[];
    affectedOrders: { id: string; date: string }[];
    summary: string;
  };
  resolvedAt?: string;
  resolveNote?: string;
}


export default function RetiradasLote() {
  const [, setLocation] = useLocation();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  async function fetchBlocks() {
    try {
      setBlocks(await api.get('/api/admin/traceability/blocks'));
    } catch {
      toast.error('Error cargando retiradas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBlocks();
    const onVisibility = () => { if (!document.hidden) fetchBlocks(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResolve() {
    if (!selectedBlock) return;
    setResolving(true);
    try {
      await api.patch(`/api/admin/traceability/blocks/${selectedBlock.id}/resolve`, { resolveNote });
      toast.success('Retirada resuelta');
      setShowResolveModal(false);
      setResolveNote('');
      setSelectedBlock(null);
      fetchBlocks();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResolving(false);
    }
  }

  const [blockSearch, setBlockSearch] = useState('');

  const filtered = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    return blocks.filter(b => {
      if (filter === 'active' && b.resolvedAt) return false;
      if (filter === 'resolved' && !b.resolvedAt) return false;
      if (!q) return true;
      return (
        (b.lotNumber ?? '').toLowerCase().includes(q) ||
        (b.ingredientName ?? '').toLowerCase().includes(q) ||
        (b.reason ?? '').toLowerCase().includes(q)
      );
    });
  }, [blocks, filter, blockSearch]);

  const activeCount = blocks.filter(b => !b.resolvedAt).length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
        <button onClick={() => setLocation('/admin')} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-black text-lg leading-tight flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-400" /> Retirada de Lotes
          </h1>
          <p className="text-xs text-muted-foreground">Gestión de alertas y retiradas de lotes</p>
        </div>
        {activeCount > 0 && (
          <div className="ml-auto px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-black">
            {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Filters + Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {(['all', 'active', 'resolved'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                    {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Resueltas'}
                  </button>
                ))}
              </div>
              <button onClick={() => setLocation('/admin/trazabilidad-lotes')}
                className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold flex items-center gap-1.5 hover:bg-secondary/80">
                <Search size={12} /> Trazabilidad
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={blockSearch}
                autoFocus
              onChange={e => setBlockSearch(e.target.value)}
                placeholder="Buscar por nº lote, ingrediente o motivo…"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {blockSearch && (
                <button onClick={() => setBlockSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <CheckCircle size={32} className="text-green-400 opacity-60" />
              <p className="text-sm">{blockSearch ? `Sin resultados para "${blockSearch}"` : `Sin retiradas ${filter === 'active' ? 'activas' : filter === 'resolved' ? 'resueltas' : ''}`}</p>
              {blockSearch && (
                <button onClick={() => setBlockSearch('')} className="text-primary font-semibold text-sm hover:underline">Borrar búsqueda</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(block => (
                <div
                  key={block.id}
                  className={`rounded-2xl border p-4 ${block.resolvedAt
                    ? 'border-green-500/20 bg-green-500/5'
                    : 'border-red-500/40 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl ${block.resolvedAt ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                        {block.resolvedAt
                          ? <CheckCircle size={18} className="text-green-400" />
                          : <ShieldAlert size={18} className="text-red-400" />
                        }
                      </div>
                      <div>
                        <div className="font-black text-base">{block.lotNumber}</div>
                        <div className="text-sm text-muted-foreground">{block.ingredientName ?? 'Ingrediente desconocido'}</div>
                        <div className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                          <Calendar size={10} /> Bloqueado: {new Date(block.blockedAt).toLocaleString('es-ES')}
                        </div>
                        {block.resolvedAt && (
                          <div className="text-xs text-green-400 mt-0.5 flex items-center gap-1">
                            <CheckCircle size={10} /> Resuelto: {new Date(block.resolvedAt).toLocaleString('es-ES')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full border ${block.resolvedAt
                        ? 'bg-green-500/20 text-green-400 border-green-500/40'
                        : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                        {block.resolvedAt ? 'RESUELTO' : 'ACTIVO'}
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => setSelectedBlock(block === selectedBlock ? null : block)}
                          className="px-2 py-1 rounded-lg bg-secondary text-xs font-bold hover:bg-secondary/80 flex items-center gap-1">
                          Ver informe
                        </button>
                        {!block.resolvedAt && (
                          <button onClick={() => { setSelectedBlock(block); setShowResolveModal(true); }}
                            className="px-2 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 text-xs font-bold hover:bg-green-500/20">
                            Resolver
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="mt-3 px-3 py-2 rounded-lg bg-background/60 border border-border/40 text-sm">
                    <span className="text-muted-foreground text-xs font-bold">Motivo: </span>{block.reason}
                  </div>

                  {/* Resolve note */}
                  {block.resolveNote && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/20 text-sm text-green-300">
                      <span className="text-xs font-bold">Resolución: </span>{block.resolveNote}
                    </div>
                  )}

                  {/* Report panel */}
                  {selectedBlock?.id === block.id && block.blockReport && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Informe de afectación</p>
                      <p className="text-xs text-muted-foreground">{block.blockReport.summary}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 rounded-lg bg-background border border-border">
                          <div className="font-black text-lg">{block.blockReport.affectedIngredients.length}</div>
                          <div className="text-xs text-muted-foreground">Ingredientes</div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-background border border-border">
                          <div className="font-black text-lg">{block.blockReport.affectedProducts.length}</div>
                          <div className="text-xs text-muted-foreground">Productos</div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-background border border-border">
                          <div className="font-black text-lg">{block.blockReport.affectedOrders.length}</div>
                          <div className="text-xs text-muted-foreground">Ventas</div>
                        </div>
                      </div>
                      {block.blockReport.affectedProducts.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground mb-1">Productos afectados:</p>
                          <div className="flex flex-wrap gap-1">
                            {block.blockReport.affectedProducts.map(p => (
                              <span key={p.id} className="px-2 py-0.5 rounded-full bg-secondary text-xs font-semibold">{p.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resolve modal */}
      {showResolveModal && selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-green-400 flex items-center gap-2">
                <CheckCircle size={16} /> Resolver retirada
              </h3>
              <button onClick={() => setShowResolveModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Lote <strong className="text-foreground">{selectedBlock.lotNumber}</strong>
            </p>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Nota de resolución</label>
              <textarea
                className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50 resize-none"
                rows={3} placeholder="Describe cómo se resolvió el incidente…"
                value={resolveNote} onChange={e => setResolveNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowResolveModal(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
              <button onClick={handleResolve} disabled={resolving}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-60">
                {resolving ? 'Resolviendo…' : 'Marcar como resuelto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

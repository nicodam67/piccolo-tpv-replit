import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import type { IngredientLot } from '@workspace/api-client-react';
import { ArrowLeft, Package, AlertTriangle, Calendar, Clock } from 'lucide-react';

interface ExpiringLotsResponse {
  days: number;
  lots: IngredientLot[];
}

export default function LotesCaducidades() {
  const [, setLocation] = useLocation();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<ExpiringLotsResponse>({
    queryKey: ['expiring-lots', days],
    queryFn: () => customFetch(`/api/admin/purchase-reports/expiring-lots?days=${days}`),
  });

  const lots = data?.lots ?? [];
  const expired = lots.filter(l => l.isExpired);
  const expiringSoon = lots.filter(l => !l.isExpired && (l.daysUntilExpiry ?? 999) <= 7);
  const expiring = lots.filter(l => !l.isExpired && (l.daysUntilExpiry ?? 999) > 7);

  function urgencyColor(lot: IngredientLot): string {
    if (lot.isExpired) return 'border-red-800 bg-red-950/30';
    const d = lot.daysUntilExpiry ?? 999;
    if (d <= 3) return 'border-red-800 bg-red-950/30';
    if (d <= 7) return 'border-amber-800 bg-amber-950/30';
    return 'border-border bg-card';
  }

  function urgencyBadge(lot: IngredientLot): React.ReactNode {
    if (lot.isExpired) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300 font-medium">CADUCADO</span>;
    const d = lot.daysUntilExpiry ?? 999;
    if (d <= 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">Hoy</span>;
    return <span className={`text-xs px-2 py-0.5 rounded-full ${d <= 3 ? 'bg-red-900 text-red-300' : d <= 7 ? 'bg-amber-900 text-amber-300' : 'bg-muted text-muted-foreground'}`}>{d}d</span>;
  }

  function LotCard({ lot }: { lot: IngredientLot }) {
    return (
      <div className={`border rounded-xl p-4 ${urgencyColor(lot)}`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold">{lot.ingredientName}</h3>
            <p className="text-xs text-muted-foreground">{lot.ingredientUnit} · Lote: <span className="font-mono">{lot.lotNumber}</span></p>
          </div>
          {urgencyBadge(lot)}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Stock restante</p>
            <p className="font-bold">{parseFloat(lot.remainingQty).toFixed(2)} {lot.ingredientUnit}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Caducidad</p>
            <p className={`font-medium ${lot.isExpired ? 'text-red-400' : (lot.daysUntilExpiry ?? 999) <= 7 ? 'text-amber-400' : ''}`}>
              {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('es-ES') : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Proveedor</p>
            <p className="text-sm truncate">{lot.supplierName ?? '—'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-card/80 backdrop-blur">
        <button onClick={() => setLocation('/admin')} className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Lotes y caducidades</h1>
        <div className="ml-auto flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Próximos</span>
          <select value={days} onChange={e => setDays(parseInt(e.target.value))}
            className="bg-muted border border-border rounded-lg px-2 py-1 text-sm">
            <option value="7">7 días</option>
            <option value="15">15 días</option>
            <option value="30">30 días</option>
            <option value="60">60 días</option>
            <option value="90">90 días</option>
          </select>
        </div>
      </header>

      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando lotes...</p>
        ) : lots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Package className="w-16 h-16 opacity-20" />
            <p className="text-sm">✓ No hay lotes que caduquen en los próximos {days} días</p>
          </div>
        ) : (
          <>
            {/* Summary banner */}
            <div className="flex gap-4 mb-6">
              {expired.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span><strong>{expired.length}</strong> lote{expired.length > 1 ? 's' : ''} caducado{expired.length > 1 ? 's' : ''}</span>
                </div>
              )}
              {expiringSoon.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-950 border border-amber-800 rounded-lg text-amber-300 text-sm">
                  <Clock className="w-4 h-4" />
                  <span><strong>{expiringSoon.length}</strong> caducan en 7 días</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-muted-foreground text-sm">
                <Package className="w-4 h-4" />
                <span><strong>{lots.length}</strong> lotes total en los próximos {days} días</span>
              </div>
            </div>

            {/* Expired */}
            {expired.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5" /> Caducados ({expired.length})
                </h2>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {expired.map(l => <LotCard key={l.id} lot={l} />)}
                </div>
              </section>
            )}

            {/* Expiring soon */}
            {expiringSoon.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5" /> Caducan pronto — 7 días ({expiringSoon.length})
                </h2>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {expiringSoon.map(l => <LotCard key={l.id} lot={l} />)}
                </div>
              </section>
            )}

            {/* Rest */}
            {expiring.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4">Próximas caducidades ({expiring.length})</h2>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {expiring.map(l => <LotCard key={l.id} lot={l} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

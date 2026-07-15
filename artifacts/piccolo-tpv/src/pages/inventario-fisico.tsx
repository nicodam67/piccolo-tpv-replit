import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ClipboardList,
  Search,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { useGetAdminIngredients, getGetAdminIngredientsQueryKey, getGetStockAlertsQueryKey } from '@workspace/api-client-react';
import type { Ingredient } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

interface CountLine {
  ingredientId: string;
  name: string;
  unit: string;
  systemStock: number;
  actualQty: string;
}

export default function InventarioFisico() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const { data: ingredients = [], isLoading } = useGetAdminIngredients();

  // Initialise lines once from ingredient data (whether cached or freshly fetched)
  useEffect(() => {
    if (!initialised && ingredients.length > 0) {
      setLines(
        ingredients
          .filter((i) => i.active)
          .map((i) => ({
            ingredientId: i.id,
            name: i.name,
            unit: i.unit,
            systemStock: parseFloat(i.currentStock),
            actualQty: parseFloat(i.currentStock).toFixed(2),
          })),
      );
      setInitialised(true);
    }
  }, [ingredients, initialised]);

  const filtered = useMemo(
    () => lines.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())),
    [lines, search],
  );

  const changedLines = useMemo(
    () =>
      lines.filter((l) => {
        const actual = parseFloat(l.actualQty);
        return !isNaN(actual) && Math.abs(actual - l.systemStock) >= 0.001;
      }),
    [lines],
  );

  function setQty(id: string, val: string) {
    setLines((prev) => prev.map((l) => (l.ingredientId === id ? { ...l, actualQty: val } : l)));
  }

  async function handleConfirm() {
    if (changedLines.length === 0) {
      toast.info('No hay diferencias que registrar.');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token') ?? '';
      const resp = await fetch('/api/admin/stock/inventory-count', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: changedLines.map((l) => ({
            ingredientId: l.ingredientId,
            actualQty: l.actualQty,
            note: `Inventario físico — sistema: ${l.systemStock.toFixed(2)} ${l.unit}`,
          })),
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      await qc.invalidateQueries({ queryKey: getGetAdminIngredientsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetStockAlertsQueryKey() });
      toast.success(`Inventario confirmado. ${changedLines.length} ajustes registrados.`);
      setConfirmed(true);
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4">
        <CheckCircle2 size={56} className="text-green-500" strokeWidth={1.5} />
        <div className="text-center">
          <p className="font-black text-xl">Inventario registrado</p>
          <p className="text-muted-foreground text-sm mt-1">
            Se han registrado {changedLines.length} movimientos de tipo «inventario».
          </p>
        </div>
        <button
          onClick={() => setLocation('/stock')}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
        >
          Ver movimientos
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 flex items-center px-4 gap-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation('/admin')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <ClipboardList size={18} className="text-amber-500" />
        <div className="flex-1">
          <p className="font-black text-sm leading-tight">Inventario físico</p>
          <p className="text-[11px] text-muted-foreground">
            Recuento manual · ajuste automático
          </p>
        </div>
        {changedLines.length > 0 && (
          <div className="text-[11px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <AlertTriangle size={11} />
            {changedLines.length} diferencias
          </div>
        )}
      </header>

      {/* Info banner */}
      <div className="mx-4 mt-4 p-3 rounded-xl bg-secondary/50 border border-border text-[12px] text-muted-foreground">
        Introduce la cantidad <strong className="text-foreground">real</strong> que hay en almacén para cada ingrediente.
        Las diferencias generarán movimientos de tipo <em>inventario</em> automáticamente.
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar ingrediente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 pb-32">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            Cargando…
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {filtered.map((line) => {
              const actual = parseFloat(line.actualQty);
              const diff = isNaN(actual) ? 0 : actual - line.systemStock;
              const hasDiff = Math.abs(diff) >= 0.001;
              return (
                <div
                  key={line.ingredientId}
                  className={`rounded-xl border bg-card px-4 py-3 flex items-center gap-3 ${
                    hasDiff ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{line.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sistema: {line.systemStock.toFixed(2)} {line.unit}
                    </p>
                  </div>
                  {/* Diff indicator */}
                  {hasDiff && (
                    <div
                      className={`flex items-center gap-1 text-[11px] font-black shrink-0 ${
                        diff > 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                    </div>
                  )}
                  {!hasDiff && !isNaN(actual) && (
                    <Minus size={12} className="text-muted-foreground shrink-0" />
                  )}
                  {/* Input */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.actualQty}
                    onChange={(e) => setQty(line.ingredientId, e.target.value)}
                    className="w-24 text-right px-2 py-1.5 rounded-lg bg-secondary border border-border text-sm font-mono focus:outline-none focus:border-primary/50"
                  />
                  <span className="text-xs text-muted-foreground shrink-0 w-6">{line.unit}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer action */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 flex gap-3">
        <button
          onClick={() => setLocation('/admin')}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-secondary transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || changedLines.length === 0}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCircle2 size={15} />
          )}
          Confirmar inventario
          {changedLines.length > 0 && ` (${changedLines.length})`}
        </button>
      </div>
    </div>
  );
}

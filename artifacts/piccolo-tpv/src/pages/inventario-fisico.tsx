import { useState, useMemo, useEffect, useRef } from 'react';
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
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
} from 'lucide-react';
import {
  useGetAdminIngredients,
  useGetAdminCategories,
  getGetAdminIngredientsQueryKey,
  getGetStockAlertsQueryKey,
} from '@workspace/api-client-react';
import type { Ingredient } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api-client';

interface CountLine {
  ingredientId: string;
  categoryId: string | null;
  name: string;
  unit: string;
  systemStock: number;
  actualQty: string;
  note: string;
  touched: boolean;
}

interface Category {
  id: string;
  name: string;
}

// Group lines by category for section-by-section navigation
function groupByCategory(lines: CountLine[], categories: Category[]): { category: Category | null; lines: CountLine[] }[] {
  const catMap = new Map<string | null, CountLine[]>();
  catMap.set(null, []);
  categories.forEach(c => catMap.set(c.id, []));

  for (const l of lines) {
    const key = l.categoryId && catMap.has(l.categoryId) ? l.categoryId : null;
    catMap.get(key)!.push(l);
  }

  const result: { category: Category | null; lines: CountLine[] }[] = [];
  // Known categories first
  for (const cat of categories) {
    const ls = catMap.get(cat.id) ?? [];
    if (ls.length > 0) result.push({ category: cat, lines: ls });
  }
  // Uncategorised last
  const uncategorised = catMap.get(null) ?? [];
  if (uncategorised.length > 0) result.push({ category: null, lines: uncategorised });
  return result;
}

export default function InventarioFisico() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: ingredients = [], isLoading: loadingIng } = useGetAdminIngredients();
  const { data: categories = [], isLoading: loadingCat } = useGetAdminCategories();
  const isLoading = loadingIng || loadingCat;

  // Re-fetch ingredients on foreground restore so stock totals stay fresh
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        qc.invalidateQueries({ queryKey: getGetAdminIngredientsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAdminIngredientsQueryKey() });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [qc]);

  // Initialise lines once from ingredient data
  useEffect(() => {
    if (!initialised && ingredients.length > 0) {
      setLines(
        (ingredients as Ingredient[])
          .filter((i) => i.active)
          .map((i) => ({
            ingredientId: i.id,
            categoryId: (i as any).categoryId ?? null,
            name: i.name,
            unit: i.unit,
            systemStock: parseFloat(i.currentStock),
            actualQty: parseFloat(i.currentStock).toFixed(2),
            note: '',
            touched: false,
          })),
      );
      setInitialised(true);
    }
  }, [ingredients, initialised]);

  // Derived stats
  const changedLines = useMemo(
    () => lines.filter((l) => {
      const actual = parseFloat(l.actualQty);
      return !isNaN(actual) && Math.abs(actual - l.systemStock) >= 0.001;
    }),
    [lines],
  );

  const touchedCount = useMemo(() => lines.filter(l => l.touched).length, [lines]);
  const totalCount = lines.length;
  const progressPct = totalCount > 0 ? Math.round((touchedCount / totalCount) * 100) : 0;

  // Search-filtered view (flat list)
  const filtered = useMemo(
    () => lines.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())),
    [lines, search],
  );

  // Grouped view (when not searching)
  const grouped = useMemo(
    () => groupByCategory(lines, categories as Category[]),
    [lines, categories],
  );

  function setQty(id: string, val: string) {
    setLines((prev) => prev.map((l) => l.ingredientId === id ? { ...l, actualQty: val, touched: true } : l));
  }

  function setNote(id: string, val: string) {
    setLines((prev) => prev.map((l) => l.ingredientId === id ? { ...l, note: val } : l));
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function focusNext(currentId: string) {
    const ids = lines.map(l => l.ingredientId);
    const idx = ids.indexOf(currentId);
    if (idx >= 0 && idx < ids.length - 1) {
      const nextId = ids[idx + 1];
      inputRefs.current[nextId]?.focus();
    }
  }

  async function handleConfirm() {
    if (changedLines.length === 0) {
      toast.info('No hay diferencias que registrar.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/admin/stock/inventory-count', {
        lines: changedLines.map((l) => ({
          ingredientId: l.ingredientId,
          actualQty: l.actualQty,
          note: l.note.trim()
            ? l.note.trim()
            : `Inventario físico — sistema: ${l.systemStock.toFixed(2)} ${l.unit}`,
        })),
      });
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
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm leading-tight">Inventario físico</p>
          <p className="text-[11px] text-muted-foreground">Recuento manual · ajuste automático</p>
        </div>
        {changedLines.length > 0 && (
          <div className="text-[11px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0">
            <AlertTriangle size={11} />
            {changedLines.length} diferencias
          </div>
        )}
      </header>

      {/* Progress bar */}
      {!isLoading && totalCount > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <BarChart3 size={11} />
              Progreso: {touchedCount} / {totalCount} revisados
            </span>
            <span className="text-[11px] font-bold text-foreground">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="mx-4 mt-3 p-3 rounded-xl bg-secondary/50 border border-border text-[12px] text-muted-foreground">
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
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 pb-32">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : search ? (
          /* Flat search results */
          <div className="flex flex-col gap-2 mt-2">
            {filtered.length === 0
              ? <div className="text-center text-sm text-muted-foreground py-8">
                  <p>Sin resultados para "{search}"</p>
                  <button onClick={() => setSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
                </div>
              : filtered.map(line => (
                <CountLineRow key={line.ingredientId} line={line} onQtyChange={setQty} onNoteChange={setNote}
                  onEnter={focusNext} inputRef={el => { inputRefs.current[line.ingredientId] = el; }}
                  editingNote={editingNoteId === line.ingredientId} onToggleNote={() => setEditingNoteId(v => v === line.ingredientId ? null : line.ingredientId)} />
              ))
            }
          </div>
        ) : (
          /* Grouped by category */
          <div className="flex flex-col gap-4 mt-2">
            {grouped.map(({ category, lines: sectionLines }) => {
              const key = category?.id ?? '__uncategorised__';
              const isCollapsed = collapsedSections.has(key);
              const sectionChanged = sectionLines.filter(l => {
                const a = parseFloat(l.actualQty);
                return !isNaN(a) && Math.abs(a - l.systemStock) >= 0.001;
              }).length;
              const sectionTouched = sectionLines.filter(l => l.touched).length;
              return (
                <div key={key} className="rounded-xl border border-border overflow-hidden">
                  {/* Section header */}
                  <button
                    onClick={() => toggleSection(key)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-secondary/40 hover:bg-secondary/70 transition-colors text-left"
                  >
                    {isCollapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
                    <span className="flex-1 font-bold text-sm">{category?.name ?? 'Sin categoría'}</span>
                    <span className="text-[10px] text-muted-foreground">{sectionTouched}/{sectionLines.length}</span>
                    {sectionChanged > 0 && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">{sectionChanged} Δ</span>
                    )}
                  </button>

                  {/* Section lines */}
                  {!isCollapsed && (
                    <div className="divide-y divide-border/50">
                      {sectionLines.map(line => (
                        <CountLineRow key={line.ingredientId} line={line} onQtyChange={setQty} onNoteChange={setNote}
                          onEnter={focusNext} inputRef={el => { inputRefs.current[line.ingredientId] = el; }}
                          editingNote={editingNoteId === line.ingredientId} onToggleNote={() => setEditingNoteId(v => v === line.ingredientId ? null : line.ingredientId)}
                          inSection />
                      ))}
                    </div>
                  )}
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
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          Confirmar inventario
          {changedLines.length > 0 && ` (${changedLines.length})`}
        </button>
      </div>
    </div>
  );
}

// ── Row component ──────────────────────────────────────────────────────────────
function CountLineRow({
  line,
  onQtyChange,
  onNoteChange,
  onEnter,
  inputRef,
  editingNote,
  onToggleNote,
  inSection = false,
}: {
  line: CountLine;
  onQtyChange: (id: string, val: string) => void;
  onNoteChange: (id: string, val: string) => void;
  onEnter: (id: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  editingNote: boolean;
  onToggleNote: () => void;
  inSection?: boolean;
}) {
  const actual = parseFloat(line.actualQty);
  const diff = isNaN(actual) ? 0 : actual - line.systemStock;
  const hasDiff = Math.abs(diff) >= 0.001;

  return (
    <div className={`${inSection ? 'px-4 py-3' : 'rounded-xl border bg-card px-4 py-3'} ${hasDiff ? (inSection ? 'bg-amber-500/5' : 'border-amber-500/40 bg-amber-500/5') : (inSection ? '' : 'border-border')}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{line.name}</p>
          <p className="text-[11px] text-muted-foreground">
            Sistema: {line.systemStock.toFixed(2)} {line.unit}
          </p>
        </div>

        {/* Diff indicator */}
        {hasDiff && (
          <div className={`flex items-center gap-1 text-[11px] font-black shrink-0 ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {diff > 0 ? '+' : ''}{diff.toFixed(2)}
          </div>
        )}
        {!hasDiff && !isNaN(actual) && <Minus size={12} className="text-muted-foreground shrink-0" />}

        {/* Note button */}
        <button
          onClick={onToggleNote}
          title="Añadir nota"
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0 ${editingNote || line.note ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-secondary'}`}
        >
          <FileText size={13} />
        </button>

        {/* Qty input */}
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={line.actualQty}
          onChange={(e) => onQtyChange(line.ingredientId, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(line.ingredientId); } }}
          className="w-24 text-right px-2 py-1.5 rounded-lg bg-secondary border border-border text-sm font-mono focus:outline-none focus:border-primary/50"
        />
        <span className="text-xs text-muted-foreground shrink-0 w-6">{line.unit}</span>
      </div>

      {/* Inline note field */}
      {editingNote && (
        <div className="mt-2">
          <input
            autoFocus
            type="text"
            value={line.note}
            onChange={(e) => onNoteChange(line.ingredientId, e.target.value)}
            placeholder="Nota opcional (lote, motivo del ajuste…)"
            className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:border-primary/50"
          />
        </div>
      )}
    </div>
  );
}

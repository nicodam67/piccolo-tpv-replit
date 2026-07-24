import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminProducts,
  useUpdateAdminProductTaxRate,
  useUpdateProductFormatTaxRate,
  getGetAdminProductsQueryKey,
} from '@workspace/api-client-react/catalog-admin';
import { ArrowLeft, Percent, ChevronDown, ChevronRight, Receipt, Search, X } from 'lucide-react';

const TAX_RATES = [4, 10, 21] as const;
type TaxRate = 4 | 10 | 21;

const RATE_COLOR: Record<number, string> = {
  4:  'bg-green-500/15 text-green-400 border-green-500/30',
  10: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  21: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function RateBadge({ rate }: { rate: number }) {
  return (
    <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${RATE_COLOR[rate] ?? 'bg-secondary text-muted-foreground border-border'}`}>
      {rate}%
    </span>
  );
}

function RateSelector({
  current,
  inherited,
  onChange,
  loading,
}: {
  current: number | null;
  inherited: number;
  onChange: (rate: TaxRate | null) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {TAX_RATES.map((r) => {
        const active = current === r || (current == null && inherited === r);
        return (
          <button
            key={r}
            disabled={loading}
            onClick={() => onChange(current == null && inherited === r ? null : r)}
            className={`text-xs font-black px-2.5 py-1 rounded-lg border transition-all ${
              active
                ? `${RATE_COLOR[r]} scale-105`
                : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary'
            } disabled:opacity-40`}
          >
            {r}%
          </button>
        );
      })}
      {current != null && (
        <button
          disabled={loading}
          onClick={() => onChange(null)}
          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground px-1 transition-colors"
          title="Heredar del producto"
        >
          heredar
        </button>
      )}
    </div>
  );
}

export default function FiscalPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useGetAdminProducts();
  const patchProduct = useUpdateAdminProductTaxRate();
  const patchFormat = useUpdateProductFormatTaxRate();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [fiscalSearch, setFiscalSearch] = useState('');

  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() }); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [qc]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleProductRate = async (productId: string, rate: TaxRate) => {
    setLoadingId(productId);
    try {
      await patchProduct.mutateAsync({ productId, data: { taxRate: rate } });
      qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() });
      toast.success(`IVA del producto actualizado a ${rate}%`);
    } catch {
      toast.error('Error al actualizar el IVA');
    } finally {
      setLoadingId(null);
    }
  };

  const handleFormatRate = async (formatId: string, rate: TaxRate | null) => {
    setLoadingId(formatId);
    try {
      await patchFormat.mutateAsync({ formatId, data: { taxRate: rate } });
      qc.invalidateQueries({ queryKey: getGetAdminProductsQueryKey() });
      toast.success(rate ? `IVA del formato actualizado a ${rate}%` : 'Formato hereda IVA del producto');
    } catch {
      toast.error('Error al actualizar el IVA del formato');
    } finally {
      setLoadingId(null);
    }
  };

  // Group by category (apply search filter)
  const filteredProducts = useMemo(() => {
    const q = fiscalSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.categoryName.toLowerCase().includes(q) ||
      (p.internalCode ?? '').toLowerCase().includes(q)
    );
  }, [products, fiscalSearch]);

  const byCategory = filteredProducts.reduce<Record<string, { name: string; items: typeof products }>>((acc, p) => {
    if (!acc[p.categoryId]) acc[p.categoryId] = { name: p.categoryName, items: [] };
    acc[p.categoryId].items.push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-card shrink-0">
        <button
          onClick={() => setLocation('/admin')}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <Receipt size={20} className="text-primary" />
        <div>
          <h1 className="font-black text-base leading-tight">Tipos de IVA</h1>
          <p className="text-xs text-muted-foreground leading-none">Configura el IVA por producto y formato</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {TAX_RATES.map((r) => (
            <span key={r} className={`text-xs font-black px-2 py-0.5 rounded-full border ${RATE_COLOR[r]}`}>{r}%</span>
          ))}
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
        <div className="relative max-w-3xl mx-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={fiscalSearch}
            autoFocus
              onChange={e => setFiscalSearch(e.target.value)}
            placeholder="Buscar producto por nombre, categoría o código…"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {fiscalSearch && (
            <button onClick={() => setFiscalSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
        {isLoading && (
          <div className="text-center text-muted-foreground py-16 text-sm">Cargando productos…</div>
        )}
        {fiscalSearch && !isLoading && Object.keys(byCategory).length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-16">
            <p>Sin resultados para "{fiscalSearch}"</p>
            <button onClick={() => setFiscalSearch('')} className="mt-2 text-primary font-semibold hover:underline">Borrar búsqueda</button>
          </div>
        )}

        {Object.entries(byCategory).map(([catId, cat]) => (
          <div key={catId} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-secondary/30">
              <h2 className="font-black text-sm uppercase tracking-widest text-muted-foreground">{cat.name}</h2>
            </div>

            <div className="divide-y divide-border/50">
              {cat.items.map((product) => {
                const hasFormats = product.formats.length > 0;
                const isOpen = expanded.has(product.id);

                return (
                  <div key={product.id}>
                    {/* Product row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {hasFormats && (
                        <button
                          onClick={() => toggle(product.id)}
                          className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                      {!hasFormats && <div className="w-5 shrink-0" />}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{product.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{parseFloat(product.price).toFixed(2)}€</span>
                          {hasFormats && (
                            <span className="text-[10px] text-muted-foreground">({product.formats.length} formatos)</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Percent size={13} className="text-muted-foreground" />
                        {TAX_RATES.map((r) => (
                          <button
                            key={r}
                            disabled={loadingId === product.id}
                            onClick={() => handleProductRate(product.id, r)}
                            className={`text-xs font-black px-2.5 py-1 rounded-lg border transition-all ${
                              product.taxRate === r
                                ? `${RATE_COLOR[r]} scale-105`
                                : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary'
                            } disabled:opacity-40`}
                          >
                            {r}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Format rows */}
                    {hasFormats && isOpen && (
                      <div className="bg-secondary/10 divide-y divide-border/30">
                        {product.formats.map((fmt) => {
                          const effectiveRate = fmt.taxRate ?? product.taxRate ?? 10;
                          return (
                            <div key={fmt.id} className="flex items-center gap-3 px-4 py-2.5 pl-12">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground truncate">{fmt.name}</span>
                                  <span className="text-xs text-muted-foreground/60 font-mono">{parseFloat(fmt.price).toFixed(2)}€</span>
                                  {fmt.taxRate == null && (
                                    <span className="text-[10px] text-muted-foreground/50 italic">hereda {product.taxRate ?? 10}%</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <RateSelector
                                  current={fmt.taxRate ?? null}
                                  inherited={product.taxRate ?? 10}
                                  onChange={(r) => handleFormatRate(fmt.id, r)}
                                  loading={loadingId === fmt.id}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!isLoading && products.length === 0 && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            No hay productos cargados en la base de datos.
          </div>
        )}
      </main>
    </div>
  );
}

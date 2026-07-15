/**
 * QR Carta — public-facing menu page
 * Accessible without authentication at /carta
 */
import { useEffect, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { EU_ALLERGENS, parseAllergens } from '../lib/allergens';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface CartaFormat { id: string; name: string; price: string }
interface CartaProduct {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  allergens?: string;
  imageUrl?: string | null;
  outOfStock?: boolean;
  formats?: CartaFormat[];
}
interface CartaCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  products: CartaProduct[];
}

async function fetchMenu(): Promise<CartaCategory[]> {
  const res = await fetch(`${BASE}/api/public/menu`);
  if (!res.ok) throw new Error('Error cargando la carta');
  return res.json();
}

export default function CartaPage() {
  const [menu, setMenu] = useState<CartaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (initial) setLoading(true);
      fetchMenu()
        .then((data) => {
          if (cancelled) return;
          setMenu(data);
          if (data.length && initial) setActiveCategory(data[0].id);
        })
        .catch((e) => { if (!cancelled && initial) setError(e.message); })
        .finally(() => { if (!cancelled && initial) setLoading(false); });
    };
    load(true);
    // Re-fetch every 5 minutes so availability / out-of-stock status stays current
    const interval = setInterval(() => load(false), 5 * 60 * 1000);
    const onVisibility = () => { if (!document.hidden) load(false); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Cargando carta…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-destructive text-sm">{error}</div>
      </div>
    );
  }

  // When searching, show matches across ALL categories
  const searchQuery = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!searchQuery) return null;
    return menu.flatMap(cat =>
      cat.products
        .filter(p => p.name.toLowerCase().includes(searchQuery) || (p.description ?? '').toLowerCase().includes(searchQuery))
        .map(p => ({ ...p, categoryName: cat.name }))
    );
  }, [menu, searchQuery]);

  const activeData = searchQuery ? null : menu.find((c) => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-4 shrink-0 text-center">
        <h1 className="font-black text-xl">🍽 Nuestra Carta</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Los alérgenos se indican en cada plato según el Regl. UE 1169/2011
        </p>
      </header>

      {/* Search bar */}
      <div className="px-3 pt-2 pb-1 bg-card/60 shrink-0">
        <div className="relative max-w-2xl mx-auto">
          <input
            type="text"
            placeholder="Buscar plato…"
            value={search}
            autoFocus
              onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary rounded-xl px-3 py-2 pr-8 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs — hidden while searching */}
      {!searchQuery && (
        <nav className="flex gap-1 px-3 py-2 overflow-x-auto bg-card/60 border-b border-border shrink-0">
          {menu.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors
                ${activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
              style={activeCategory === cat.id && cat.color ? { background: cat.color } : undefined}
            >
              {cat.icon && <span className="mr-1">{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </nav>
      )}

      {/* Products */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {/* Search results */}
        {searchQuery && searchResults !== null && (
          <div className="space-y-3">
            {searchResults.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">No se encontraron platos para &ldquo;{search}&rdquo;.</p>
                <button onClick={() => setSearch('')} className="mt-2 text-primary text-sm font-semibold hover:underline">
                  Borrar búsqueda
                </button>
              </div>
            )}
            {searchResults.map(p => (
              <div key={p.id}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{(p as any).categoryName}</p>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        )}
        {activeData && !searchQuery && (
          <div className="space-y-3">
            {activeData.products.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No hay productos disponibles en esta categoría.
              </p>
            )}
            {activeData.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>

      {/* Allergen legend */}
      <footer className="bg-card border-t border-border px-4 py-4 shrink-0">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Leyenda de alérgenos
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EU_ALLERGENS.map((a) => (
            <div key={a.code} className="flex items-center gap-1 text-[10px]">
              <span
                className="font-black px-1.5 py-0.5 rounded text-[10px] leading-none"
                style={{ color: a.color, background: a.bg, border: `1px solid ${a.color}40` }}
              >
                {a.short}
              </span>
              <span className="text-muted-foreground">{a.label}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

function ProductCard({ product: p }: { product: CartaProduct }) {
  const allergenCodes = parseAllergens(p.allergens);

  return (
    <div className={`bg-card border border-border rounded-2xl p-4 flex gap-3 ${p.outOfStock ? 'opacity-50' : ''}`}>
      {p.imageUrl && (
        <img src={p.imageUrl} alt={p.name}
          className="w-16 h-16 rounded-xl object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-base leading-tight">{p.name}</h3>
          <span className="font-black text-primary shrink-0">
            {p.formats && p.formats.length > 0 ? (
              <span className="text-sm text-muted-foreground">desde {Math.min(...p.formats.map(f => parseFloat(f.price))).toFixed(2)}€</span>
            ) : (
              `${parseFloat(p.price).toFixed(2)}€`
            )}
          </span>
        </div>
        {p.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.description}</p>
        )}
        {p.outOfStock && (
          <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Agotado</span>
        )}

        {/* Formats */}
        {p.formats && p.formats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {p.formats.map((f) => (
              <span key={f.id} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                {f.name} · {parseFloat(f.price).toFixed(2)}€
              </span>
            ))}
          </div>
        )}

        {/* Allergen chips */}
        {allergenCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allergenCodes.map((code) => {
              const a = EU_ALLERGENS.find(x => x.code === code)!;
              return (
                <span
                  key={code}
                  title={a.label}
                  className="font-black px-1.5 py-0.5 rounded text-[10px] leading-none"
                  style={{ color: a.color, background: a.bg, border: `1px solid ${a.color}40` }}
                >
                  {a.short}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

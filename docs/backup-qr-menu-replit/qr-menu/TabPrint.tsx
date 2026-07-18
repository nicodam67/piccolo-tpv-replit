/**
 * TabPrint — Panel de impresión de carta con vista previa en tiempo real.
 * Genera un documento CSS+HTML que `window.print()` imprime como PDF.
 */
import { useState, useEffect } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { fetchQrCategories, fetchQrProducts } from './lib';
import type { QrCategory, QrProduct } from './lib';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from './types';
import type { Locale } from './types';

interface PrintOptions {
  columns: 2 | 3 | 4;
  paperSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showQR: boolean;
  showDescription: boolean;
  showPrice: boolean;
  showHalfPortion: boolean;
  showAllergens: boolean;
  showTags: boolean;
  bgColor: string;
  textColor: string;
  accentColor: string;
  locale: Locale;
  includedCategories: string[];
}

const DEFAULT_OPTIONS: PrintOptions = {
  columns: 2, paperSize: 'A4', orientation: 'portrait',
  showLogo: true, showName: true, showAddress: true, showPhone: true, showQR: true,
  showDescription: true, showPrice: true, showHalfPortion: true, showAllergens: true, showTags: true,
  bgColor: '#ffffff', textColor: '#1a1a1a', accentColor: '#c8963e',
  locale: 'es', includedCategories: [],
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

/** Escape HTML entities to prevent stored XSS when injecting into print HTML. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function localizeField(
  item: { name: string; description?: string | null; translations?: Record<string, { name?: string; description?: string }> },
  locale: string,
  field: 'name' | 'description',
): string {
  if (locale === 'es') return field === 'name' ? item.name : (item.description ?? '');
  const t = item.translations?.[locale] ?? {};
  return t[field] ?? (field === 'name' ? item.name : (item.description ?? ''));
}

interface BrandingSnap {
  restaurantName?: string;
  address?: string;
  city?: string;
  province?: string;
  phone?: string;
  logoUrl?: string;
  tagline?: string;
}

function buildPrintHtml(
  categories: QrCategory[],
  products: QrProduct[],
  opts: PrintOptions,
  cartaUrl: string,
  branding: BrandingSnap,
): string {
  const includedCats = categories.filter((c) =>
    opts.includedCategories.length === 0 || opts.includedCategories.includes(c.id)
  );

  // ── Header elements — all user-supplied strings escaped via esc() ─────────────
  const logoHtml = opts.showLogo && branding.logoUrl
    ? `<img src="${esc(branding.logoUrl)}" alt="logo" style="max-height:48pt;max-width:120pt;margin-bottom:8pt;object-fit:contain;" />`
    : '';
  const nameHtml = opts.showName && branding.restaurantName
    ? `<p class="restaurant-name">${esc(branding.restaurantName)}</p>`
    : '';
  const addressParts = [branding.address, branding.city, branding.province].filter(Boolean).join(', ');
  const addressHtml = opts.showAddress && addressParts
    ? `<p class="meta-line">${esc(addressParts)}</p>`
    : '';
  const phoneHtml = opts.showPhone && branding.phone
    ? `<p class="meta-line">📞 ${esc(branding.phone)}</p>`
    : '';
  // QR code URL is constructed from cartaUrl (same origin), not user input
  const qrHtml = opts.showQR
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(cartaUrl)}" alt="QR" style="width:56pt;height:56pt;margin-top:6pt;" />`
    : '';

  const hasHeader = logoHtml || nameHtml || addressHtml || phoneHtml || qrHtml;

  // ── Products HTML — all user content escaped before injection ────────────────
  const catsHtml = includedCats.map((cat) => {
    const catName = esc(localizeField(cat, opts.locale, 'name'));
    const catProds = products.filter((p) => p.categoryId === cat.id && p.qrVisible !== false);
    if (catProds.length === 0) return '';
    const prodsHtml = catProds.map((p) => {
      const name = esc(localizeField(p, opts.locale, 'name'));
      const desc = opts.showDescription ? esc(localizeField(p, opts.locale, 'description')) : '';
      // Emoji tags are safe literals — not user data
      const tagStr = opts.showTags ? [
        p.isVegetariano && '🥦',
        p.isVegano && '🌿',
        p.isSinGluten && '🚫🌾',
        p.isPicante && '🌶️',
      ].filter(Boolean).join(' ') : '';
      // Allergen codes come from KNOWN_CODES set — safe to display, but esc anyway
      const allergenStr = opts.showAllergens && p.allergens
        ? p.allergens.split(',').map((a) => esc(a.trim())).filter(Boolean).join(', ')
        : '';
      return `
        <div class="item">
          <div class="item-header">
            <span class="item-name">${name}${tagStr ? ` <span class="tags">${tagStr}</span>` : ''}</span>
            ${opts.showPrice ? `<span class="item-price">€${Number(p.price).toFixed(2)}</span>` : ''}
          </div>
          ${opts.showHalfPortion && p.halfPortionPrice ? `<span class="item-half">½ €${Number(p.halfPortionPrice).toFixed(2)}</span>` : ''}
          ${desc ? `<p class="item-desc">${desc}</p>` : ''}
          ${allergenStr ? `<p class="item-meta"><span class="allergens">${allergenStr}</span></p>` : ''}
        </div>
      `;
    }).join('');
    return `<div class="category"><h2 class="cat-name">${catName}</h2>${prodsHtml}</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${esc(opts.locale)}">
<head>
  <meta charset="UTF-8" />
  <title>${esc(branding.restaurantName ?? 'Carta')}</title>
  <style>
    @page { size: ${opts.paperSize} ${opts.orientation}; margin: 1.5cm; }
    * { box-sizing: border-box; }
    body { font-family: sans-serif; background: ${opts.bgColor}; color: ${opts.textColor}; font-size: 10pt; margin: 0; padding: 0; }
    .header { text-align: center; margin-bottom: 24pt; padding-bottom: 12pt; border-bottom: 1pt solid ${opts.accentColor}; }
    .header-inner { display: flex; flex-direction: column; align-items: center; gap: 2pt; }
    .restaurant-name { font-size: 20pt; font-weight: bold; margin: 4pt 0 2pt 0; color: ${opts.textColor}; }
    .meta-line { font-size: 9pt; color: #666; margin: 1pt 0; }
    .columns { columns: ${opts.columns}; column-gap: 20pt; }
    .category { break-inside: avoid-column; margin-bottom: 18pt; }
    .cat-name { font-size: 12pt; font-weight: bold; color: ${opts.accentColor}; border-bottom: 0.5pt solid ${opts.accentColor}; margin: 0 0 8pt 0; padding-bottom: 3pt; }
    .item { break-inside: avoid; margin-bottom: 8pt; }
    .item-header { display: flex; justify-content: space-between; gap: 6pt; }
    .item-name { font-weight: 600; font-size: 9.5pt; }
    .tags { font-size: 8pt; }
    .item-price { font-weight: bold; color: ${opts.accentColor}; white-space: nowrap; }
    .item-half { font-size: 8pt; color: #888; display: block; }
    .item-desc { font-size: 8pt; color: #555; margin: 2pt 0 0 0; line-height: 1.3; }
    .item-meta { font-size: 7.5pt; color: #888; margin-top: 2pt; }
    .allergens { display: inline; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  ${hasHeader ? `<div class="header"><div class="header-inner">${logoHtml}${nameHtml}${addressHtml}${phoneHtml}${qrHtml}</div></div>` : ''}
  <div class="columns">${catsHtml}</div>
</body>
</html>`;
}

export default function TabPrint() {
  const [opts, setOpts] = useState<PrintOptions>(DEFAULT_OPTIONS);
  const [categories, setCategories] = useState<QrCategory[]>([]);
  const [products, setProducts] = useState<QrProduct[]>([]);
  const [branding, setBranding] = useState<BrandingSnap>({});
  const [loading, setLoading] = useState(true);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
  const cartaUrl = `${window.location.origin}${BASE}/carta`;

  useEffect(() => {
    Promise.all([
      fetchQrCategories(),
      fetchQrProducts(),
      fetch(`${BASE}/api/public/branding`).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ])
      .then(([cats, prods, brand]) => {
        setCategories(cats);
        setProducts(prods);
        setBranding(brand as BrandingSnap);
        setOpts((o) => ({ ...o, includedCategories: cats.map((c) => c.id) }));
      })
      .finally(() => setLoading(false));
  }, []);

  function print() {
    const html = buildPrintHtml(categories, products, opts, cartaUrl, branding);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  }

  function toggle(key: keyof PrintOptions) {
    setOpts((o) => ({ ...o, [key]: !o[key] }));
  }

  function toggleCategory(id: string) {
    setOpts((o) => ({
      ...o,
      includedCategories: o.includedCategories.includes(id)
        ? o.includedCategories.filter((c) => c !== id)
        : [...o.includedCategories, id],
    }));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={20} />Cargando…</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
      {/* Options panel */}
      <div className="space-y-5">
        {/* Categorías */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Categorías</p>
          <div className="space-y-1">
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-xs">
                <input type="checkbox" checked={opts.includedCategories.includes(cat.id)} onChange={() => toggleCategory(cat.id)} className="cursor-pointer" />
                {cat.name}
              </label>
            ))}
          </div>
        </div>

        {/* Elementos */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Elementos</p>
          <div className="space-y-0.5">
            <Toggle label="Descripción" checked={opts.showDescription} onChange={() => toggle('showDescription')} />
            <Toggle label="Precio" checked={opts.showPrice} onChange={() => toggle('showPrice')} />
            <Toggle label="Media ración" checked={opts.showHalfPortion} onChange={() => toggle('showHalfPortion')} />
            <Toggle label="Alérgenos" checked={opts.showAllergens} onChange={() => toggle('showAllergens')} />
            <Toggle label="Etiquetas dietéticas" checked={opts.showTags} onChange={() => toggle('showTags')} />
          </div>
        </div>

        {/* Página */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Página</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Columnas</label>
              <select value={opts.columns} onChange={(e) => setOpts((o) => ({ ...o, columns: Number(e.target.value) as 2|3|4 }))}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 cursor-pointer">
                <option value={2}>2 columnas</option>
                <option value={3}>3 columnas</option>
                <option value={4}>4 columnas</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Papel</label>
              <select value={opts.paperSize} onChange={(e) => setOpts((o) => ({ ...o, paperSize: e.target.value as 'A4'|'Letter' }))}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 cursor-pointer">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Orientación</label>
              <select value={opts.orientation} onChange={(e) => setOpts((o) => ({ ...o, orientation: e.target.value as 'portrait'|'landscape' }))}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 cursor-pointer">
                <option value="portrait">Vertical</option>
                <option value="landscape">Horizontal</option>
              </select>
            </div>
          </div>
        </div>

        {/* Colores */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Colores</p>
          <div className="space-y-2">
            {[
              { key: 'bgColor', label: 'Fondo' },
              { key: 'textColor', label: 'Texto' },
              { key: 'accentColor', label: 'Acento' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input type="color" value={(opts as any)[key]}
                  onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.value }))}
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Idioma */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Idioma</p>
          <select value={opts.locale} onChange={(e) => setOpts((o) => ({ ...o, locale: e.target.value as Locale }))}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 cursor-pointer">
            {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
          </select>
        </div>

        <button
          type="button"
          onClick={print}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-gray-900 text-white hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <Printer size={16} />
          Imprimir / PDF
        </button>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Vista previa en tiempo real</p>
        <div
          className="rounded-xl overflow-hidden border border-gray-200 bg-white"
          dangerouslySetInnerHTML={{ __html: buildPrintHtml(categories, products, opts, cartaUrl, branding) }}
          style={{ minHeight: 300, padding: '1rem' }}
        />
        <p className="text-xs text-gray-400 text-center">La vista previa es aproximada. El resultado PDF depende del navegador.</p>
      </div>
    </div>
  );
}

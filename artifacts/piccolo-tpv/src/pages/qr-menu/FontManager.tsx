import { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { ThemeFonts } from './types';
import { DEFAULT_THEME_FONTS } from './types';

// ── Custom fonts owned and served by the TPV ─────────────────────────────────
const CUSTOM_FONTS = [
  { label: 'Algerian', value: 'Algerian__custom' },
  { label: 'AvantGarde Demi', value: 'AvantGardeBk__custom' },
  { label: 'American Text BT', value: 'AmericanTextBT__custom' },
  { label: 'ZapfChan Demi', value: 'ZapfChanDm__custom' },
  { label: 'ZapfChan Medium', value: 'ZapfChanMd__custom' },
];

const GOOGLE_FONTS = [
  { group: 'Serif (clásica)', fonts: ['Playfair Display', 'Lora', 'Merriweather', 'Cormorant Garamond', 'EB Garamond'] },
  { group: 'Sans-serif (moderna)', fonts: ['Lato', 'Raleway', 'Nunito', 'Montserrat', 'Poppins', 'Inter', 'Jost'] },
  { group: 'Decorativa / Script', fonts: ['Corinthia', 'Dancing Script', 'Pacifico', 'Josefin Sans', 'Cinzel'] },
];

function loadFont(fontValue: string) {
  const custom = CUSTOM_FONTS.find((f) => f.value === fontValue);
  if (custom) {
    const id = `custom-font-${fontValue}`;
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@font-face { font-family: "${custom.label}"; src: url("/fonts/${custom.value}.woff2") format("woff2"), url("/fonts/${custom.value}.ttf") format("truetype"); font-weight: normal; font-style: normal; font-display: swap; }`;
    document.head.appendChild(style);
    return;
  }
  // Google Font
  const id = `gf-${fontValue.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontValue)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function getFontFamily(value: string): string {
  const custom = CUSTOM_FONTS.find((f) => f.value === value);
  return custom ? `"${custom.label}", serif` : `"${value}", serif`;
}

type Props = { fonts: ThemeFonts; onChange: (f: ThemeFonts) => void };

function FontSelect({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  useEffect(() => { loadFont(value); }, [value]);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-700 block">{label}</label>
      <select
        id={id} value={value}
        onChange={(e) => { onChange(e.target.value); loadFont(e.target.value); }}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        <optgroup label="Fuentes exclusivas (CDN)">
          {CUSTOM_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </optgroup>
        {GOOGLE_FONTS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
          </optgroup>
        ))}
      </select>
      <p className="text-base truncate" style={{ fontFamily: getFontFamily(value) }}>
        Bienvenido a nuestro restaurante
      </p>
    </div>
  );
}

export default function FontManager({ fonts, onChange }: Props) {
  const hasHeadingColor = !!fonts.headingColor;
  const hasBodyColor = !!fonts.bodyColor;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Heading font */}
        <div className="space-y-3">
          <FontSelect id="font-heading" label="Fuente de títulos" value={fonts.heading} onChange={(v) => onChange({ ...fonts, heading: v })} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className={`text-xs font-medium ${hasHeadingColor ? 'text-gray-700' : 'text-gray-400'}`}>Color de títulos</label>
              {hasHeadingColor ? (
                <button type="button" onClick={() => onChange({ ...fonts, headingColor: '' })} className="text-gray-400 hover:text-red-500 cursor-pointer"><X size={12} /></button>
              ) : (
                <button type="button" onClick={() => onChange({ ...fonts, headingColor: '#1a1a1a' })} className="text-xs text-blue-500 underline cursor-pointer">Personalizar</button>
              )}
            </div>
            {hasHeadingColor ? (
              <div className="flex items-center gap-2">
                <input type="color" value={fonts.headingColor || '#1a1a1a'} onChange={(e) => onChange({ ...fonts, headingColor: e.target.value })} className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-xs font-mono text-gray-500">{fonts.headingColor}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic h-8 flex items-center">Usando color por defecto</p>
            )}
          </div>
        </div>
        {/* Body font */}
        <div className="space-y-3">
          <FontSelect id="font-body" label="Fuente de texto" value={fonts.body} onChange={(v) => onChange({ ...fonts, body: v })} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className={`text-xs font-medium ${hasBodyColor ? 'text-gray-700' : 'text-gray-400'}`}>Color de texto</label>
              {hasBodyColor ? (
                <button type="button" onClick={() => onChange({ ...fonts, bodyColor: '' })} className="text-gray-400 hover:text-red-500 cursor-pointer"><X size={12} /></button>
              ) : (
                <button type="button" onClick={() => onChange({ ...fonts, bodyColor: '#1a1a1a' })} className="text-xs text-blue-500 underline cursor-pointer">Personalizar</button>
              )}
            </div>
            {hasBodyColor ? (
              <div className="flex items-center gap-2">
                <input type="color" value={fonts.bodyColor || '#1a1a1a'} onChange={(e) => onChange({ ...fonts, bodyColor: e.target.value })} className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                <span className="text-xs font-mono text-gray-500">{fonts.bodyColor}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic h-8 flex items-center">Usando color por defecto</p>
            )}
          </div>
        </div>
      </div>

      {/* Combined preview */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-1 bg-gray-50">
        <p className="text-xl font-bold" style={{ fontFamily: getFontFamily(fonts.heading), ...(fonts.headingColor ? { color: fonts.headingColor } : {}) }}>
          Carta del restaurante
        </p>
        <p className="text-sm text-gray-500" style={{ fontFamily: getFontFamily(fonts.body), ...(fonts.bodyColor ? { color: fonts.bodyColor } : {}) }}>
          Descubre nuestra selección de platos elaborados con ingredientes frescos de temporada.
        </p>
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        onClick={() => onChange(DEFAULT_THEME_FONTS)}
      >
        <RotateCcw size={12} />
        Restaurar fuentes originales
      </button>
    </div>
  );
}

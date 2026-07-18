import { useState, useEffect } from 'react';
import { Save, Loader2, Globe } from 'lucide-react';
import { fetchQrCategories, fetchQrProducts, patchCategory, patchProduct } from './lib';
import type { QrCategory, QrProduct } from './lib';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from './types';
import type { Locale } from './types';

type TranslationRow = {
  type: 'category' | 'product';
  id: string;
  name: string;
  description?: string | null;
  translations: Record<string, { name?: string; description?: string }>;
};

function TranslationCell({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[120px] text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
    />
  );
}

export default function TabIdiomas() {
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchQrCategories(), fetchQrProducts()])
      .then(([cats, prods]) => {
        const catRows: TranslationRow[] = cats.map((c) => ({
          type: 'category',
          id: c.id,
          name: c.name,
          translations: c.translations ?? {},
        }));
        const prodRows: TranslationRow[] = prods.map((p) => ({
          type: 'product',
          id: p.id,
          name: p.name,
          description: p.description,
          translations: p.translations ?? {},
        }));
        setRows([...catRows, ...prodRows]);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function updateTranslation(index: number, field: 'name' | 'description', value: string) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== index) return r;
      const curr = r.translations[activeLocale] ?? {};
      return { ...r, translations: { ...r.translations, [activeLocale]: { ...curr, [field]: value } } };
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(rows.map(async (r) => {
        const patch = { translations: r.translations };
        if (r.type === 'category') {
          await patchCategory(r.id, patch);
        } else {
          await patchProduct(r.id, patch);
        }
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando traducciones…
      </div>
    );
  }

  const localesExceptEs = SUPPORTED_LOCALES.filter((l) => l !== 'es');
  const catRows = rows.filter((r) => r.type === 'category');
  const prodRows = rows.filter((r) => r.type === 'product');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Traducciones</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            El idioma base (Español) no se puede editar aquí — usa el administrador de productos. Selecciona un idioma y edita las traducciones.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
          style={{ background: '#1a1a1a' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? '¡Guardado!' : 'Guardar traducciones'}
        </button>
      </div>

      {error && <div className="text-red-500 text-xs bg-red-50 p-2 rounded">{error}</div>}

      {/* Locale selector */}
      <div className="flex gap-2 flex-wrap">
        <Globe size={16} className="text-gray-400 self-center" />
        {localesExceptEs.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeLocale === locale
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Español (original)</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {LOCALE_LABELS[activeLocale]} — Nombre
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {LOCALE_LABELS[activeLocale]} — Descripción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Categories */}
            {catRows.length > 0 && (
              <tr className="bg-gray-50/50">
                <td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Categorías ({catRows.length})
                </td>
              </tr>
            )}
            {catRows.map((row, i) => {
              const globalIndex = rows.indexOf(row);
              const trans = row.translations[activeLocale] ?? {};
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Cat</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800 text-sm">{row.name}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <TranslationCell
                      value={trans.name ?? ''}
                      placeholder={row.name}
                      onChange={(v) => updateTranslation(globalIndex, 'name', v)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-400 italic">No aplica</span>
                  </td>
                </tr>
              );
            })}
            {/* Products */}
            {prodRows.length > 0 && (
              <tr className="bg-gray-50/50">
                <td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Productos ({prodRows.length})
                </td>
              </tr>
            )}
            {prodRows.map((row) => {
              const globalIndex = rows.indexOf(row);
              const trans = row.translations[activeLocale] ?? {};
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Plato</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800 text-sm truncate max-w-[180px]">{row.name}</p>
                    {row.description && (
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{row.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <TranslationCell
                      value={trans.name ?? ''}
                      placeholder={row.name}
                      onChange={(v) => updateTranslation(globalIndex, 'name', v)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <TranslationCell
                      value={trans.description ?? ''}
                      placeholder={row.description ?? ''}
                      onChange={(v) => updateTranslation(globalIndex, 'description', v)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        💡 Las traducciones se muestran automáticamente cuando el cliente selecciona ese idioma en la carta pública.
        Si un campo se deja vacío, se muestra el nombre original en español.
      </p>
    </div>
  );
}

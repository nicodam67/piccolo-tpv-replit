/**
 * TabExport — Exportar menú completo a CSV
 * Fiel al MenuExport.tsx del programa original (papaparse)
 */
import { useState } from 'react';
import Papa from 'papaparse';
import { Download, Loader2, FileText } from 'lucide-react';
import { fetchPublicMenu } from './lib';

export default function TabExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const categories = await fetchPublicMenu();

      const rows: Record<string, string>[] = [];

      for (const cat of categories) {
        // Products directly in category
        for (const item of cat.products ?? []) {
          rows.push({
            categoria: cat.name,
            subcategoria: '',
            nombre: item.name,
            descripcion: item.description ?? '',
            precio: item.price ? `€${Number(item.price).toFixed(2)}` : '',
            media_racion: item.halfPortionPrice ? `€${Number(item.halfPortionPrice).toFixed(2)}` : '',
            cantidad: item.quantity ?? '',
            etiquetas: buildTags(item),
            alergenos: buildAllergens(item.allergens ?? ''),
            disponible: item.qrVisible === false ? 'No' : 'Sí',
          });
        }
        // Subcategories
        for (const sub of cat.subcategories ?? []) {
          for (const item of sub.products ?? []) {
            rows.push({
              categoria: cat.name,
              subcategoria: sub.name,
              nombre: item.name,
              descripcion: item.description ?? '',
              precio: item.price ? `€${Number(item.price).toFixed(2)}` : '',
              media_racion: item.halfPortionPrice ? `€${Number(item.halfPortionPrice).toFixed(2)}` : '',
              cantidad: item.quantity ?? '',
              etiquetas: buildTags(item),
              alergenos: buildAllergens(item.allergens ?? ''),
              disponible: item.qrVisible === false ? 'No' : 'Sí',
            });
          }
        }
      }

      const csv = Papa.unparse(rows, {
        header: true,
        columns: ['categoria', 'subcategoria', 'nombre', 'descripcion', 'precio', 'media_racion', 'cantidad', 'etiquetas', 'alergenos', 'disponible'],
      });

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `menu_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setLastCount(rows.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto">
        <FileText className="w-8 h-8 text-gray-500" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Exportar carta a CSV</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Descarga el menú completo en formato CSV con todas las categorías, precios, alérgenos y etiquetas dietéticas.
        </p>
      </div>

      {lastCount !== null && !loading && (
        <p className="text-sm text-green-600 font-medium">
          ✅ {lastCount} platos exportados correctamente
        </p>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm p-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">Cerrar</button>
        </div>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {loading ? 'Exportando…' : 'Descargar CSV'}
      </button>

      <div className="text-left rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-700 mb-2">Columnas incluidas:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Categoría y subcategoría</li>
          <li>Nombre y descripción del plato</li>
          <li>Precio y precio media ración</li>
          <li>Cantidad / Volumen</li>
          <li>Etiquetas dietéticas (Vegetariano, Vegano, Sin gluten, Picante)</li>
          <li>Alérgenos (14 EU)</li>
          <li>Disponible en carta</li>
        </ul>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ItemLike {
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
}

function buildTags(item: ItemLike): string {
  const tags: string[] = [];
  if (item.isVegetariano) tags.push('Vegetariano');
  if (item.isVegano) tags.push('Vegano');
  if (item.isSinGluten) tags.push('Sin gluten');
  if (item.isPicante) tags.push('Picante');
  return tags.join(', ');
}

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', crustaceos: 'Crustáceos', huevos: 'Huevos', pescado: 'Pescado',
  cacahuetes: 'Cacahuetes', soja: 'Soja', leche: 'Leche', frutos_cascara: 'Frutos secos',
  apio: 'Apio', mostaza: 'Mostaza', sesamo: 'Sésamo', sulfitos: 'Sulfitos',
  altramuces: 'Altramuces', moluscos: 'Moluscos',
  // English legacy
  crustaceans: 'Crustáceos', eggs: 'Huevos', fish: 'Pescado', peanuts: 'Cacahuetes',
  soy: 'Soja', milk: 'Leche', nuts: 'Frutos secos', celery: 'Apio', mustard: 'Mostaza',
  sesame: 'Sésamo', sulphites: 'Sulfitos', lupin: 'Altramuces', molluscs: 'Moluscos',
};

function buildAllergens(raw: string): string {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ALLERGEN_LABELS[id] ?? id)
    .join(', ');
}

/**
 * CartaPublicaApp — raíz del QR Menú público.
 *
 * Aislado completamente del panel TPV:
 * - Carga carta-publica.css (scope .qr-pub)
 * - Gestiona la navegación interna (inicio ↔ categoría)
 * - Sin Convex, sin Hercules, sin iframes, sin datos de BD
 * - Sin URLs externas de imágenes — placeholders CSS locales
 * - Datos de prueba en fixtures.ts
 *
 * Fase 1: validación visual — pendiente de aprobación.
 */
import './carta-publica.css';
import { useState } from 'react';
import CartaInicio from './CartaInicio';
import CategoriaVista from './CategoriaVista';
import type { FixtureCategory, AllergenId, DietaryTagId } from './fixtures';

type View = 'inicio' | 'categoria';

export default function CartaPublicaApp() {
  const [view,      setView]      = useState<View>('inicio');
  const [activeCat, setActiveCat] = useState<FixtureCategory | null>(null);
  const [allergen,  setAllergen]  = useState<AllergenId | null>(null);
  const [tag,       setTag]       = useState<DietaryTagId | null>(null);

  function goToCategory(cat: FixtureCategory) {
    setActiveCat(cat);
    setView('categoria');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToInicio() {
    setView('inicio');
    setActiveCat(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="qr-pub">
      {view === 'inicio' && (
        <CartaInicio
          activeAllergen={allergen}
          activeTag={tag}
          onAllergen={setAllergen}
          onTag={setTag}
          onCategory={goToCategory}
        />
      )}
      {view === 'categoria' && activeCat && (
        <CategoriaVista
          category={activeCat}
          activeAllergen={allergen}
          activeTag={tag}
          onAllergen={setAllergen}
          onTag={setTag}
          onBack={goToInicio}
        />
      )}
    </div>
  );
}

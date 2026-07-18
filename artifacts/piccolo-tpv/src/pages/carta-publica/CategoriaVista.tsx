/**
 * CategoriaVista — pantalla de detalle de una categoría.
 * Lista los productos de prueba con filtrado por alérgenos y etiquetas.
 */
import { ChevronLeft } from 'lucide-react';
import { FIXTURE_PRODUCTS, type FixtureCategory, type AllergenId, type DietaryTagId } from './fixtures';
import AlergenosLeyenda from './AlergenosLeyenda';
import ProductoCard from './ProductoCard';

interface Props {
  category:       FixtureCategory;
  activeAllergen: AllergenId | null;
  activeTag:      DietaryTagId | null;
  onAllergen:     (id: AllergenId | null) => void;
  onTag:          (id: DietaryTagId | null) => void;
  onBack:         () => void;
}

export default function CategoriaVista({
  category, activeAllergen, activeTag, onAllergen, onTag, onBack,
}: Props) {
  const products = FIXTURE_PRODUCTS.filter(p => {
    if (p.categoryId !== category.id) return false;
    if (!p.available) return false;
    if (activeTag && !p.tags.includes(activeTag as never)) return false;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--qr-bg)' }}>
      {/* Header sticky */}
      <div className="qr-cat-header">
        <button className="qr-back-btn" onClick={onBack}>
          <ChevronLeft size={15} />
          Carta
        </button>
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--qr-border)', flexShrink: 0 }} />
        <span className="qr-cat-title">
          {category.emoji} {category.name}
        </span>
      </div>

      {/* Filtros */}
      <AlergenosLeyenda
        activeAllergen={activeAllergen}
        activeTag={activeTag}
        onAllergen={onAllergen}
        onTag={onTag}
      />

      {/* Productos */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '0.5rem 1rem 3rem' }}>
        {products.length === 0 ? (
          <div style={{
            textAlign:  'center',
            padding:    '3rem 1rem',
            color:      'var(--qr-muted)',
            fontFamily: 'var(--qr-font-serif)',
            fontSize:   '1rem',
          }}>
            {activeAllergen || activeTag
              ? 'Sin platos disponibles con este filtro.'
              : 'Esta categoría no tiene platos disponibles.'}
          </div>
        ) : (
          products.map((p, i) => (
            <ProductoCard
              key={p.id}
              product={p}
              activeAllergen={activeAllergen}
              activeTag={activeTag}
              delay={i}
            />
          ))
        )}
      </main>

      {/* Nota de datos de prueba */}
      <div style={{
        textAlign:    'center',
        padding:      '0 1rem 1.5rem',
        fontSize:     '0.65rem',
        color:        'var(--qr-muted)',
        opacity:      0.5,
        fontFamily:   'var(--qr-font-sans)',
        letterSpacing:'0.04em',
      }}>
        Datos de prueba · Fase 1 diseño
      </div>
    </div>
  );
}

/**
 * ProductoCard — tarjeta de producto de la carta pública.
 *
 * Muestra dos estados:
 *   • showImage: true  → slot de imagen con placeholder local (emoji + gradiente CSS)
 *   • showImage: false → tarjeta solo texto (sin slot de imagen)
 *
 * Sin URLs externas. Sin Unsplash. Sin dependencias de red.
 */
import { FIXTURE_ALLERGENS, FIXTURE_DIETARY_TAGS, FIXTURE_CATEGORIES } from './fixtures';
import type { FixtureProduct } from './fixtures';

interface Props {
  product:        FixtureProduct;
  activeAllergen: string | null;
  activeTag:      string | null;
  delay?:         number;
}

export default function ProductoCard({ product, activeAllergen, activeTag, delay = 0 }: Props) {
  // Aplicar filtros
  const filtradoPorAlergeno = activeAllergen !== null && product.allergens.includes(activeAllergen as never);
  const filtradoPorTag      = activeTag !== null && !product.tags.includes(activeTag as never);
  if (filtradoPorAlergeno || filtradoPorTag) return null;

  const allergenMeta = FIXTURE_ALLERGENS.filter(a => product.allergens.includes(a.id));
  const tagMeta      = FIXTURE_DIETARY_TAGS.filter(t => product.tags.includes(t.id));
  const category     = FIXTURE_CATEGORIES.find(c => c.id === product.categoryId);
  const placeholderBg = category?.placeholderBg ?? 'linear-gradient(135deg,#1a0808,#2d1010)';

  return (
    <div
      className="qr-product-card qr-animate"
      style={{ animationDelay: `${delay * 0.06}s`, opacity: 0 }}
    >
      {/* ── Slot de imagen: placeholder CSS local ─────────────────────── */}
      {product.showImage && (
        <div
          aria-label={`Imagen de ${product.name}`}
          style={{
            width:          '5rem',
            height:         '5rem',
            borderRadius:   '10px',
            background:     placeholderBg,
            flexShrink:     0,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '2rem',
            boxShadow:      'inset 0 0 0 1px rgba(255,255,255,0.07)',
            position:       'relative',
            overflow:       'hidden',
          }}
        >
          {/* Brillo sutil en esquina superior */}
          <div style={{
            position:   'absolute',
            top:        '-30%',
            left:       '-20%',
            width:      '70%',
            height:     '70%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
          }} />
          <span style={{ position: 'relative', zIndex: 1 }}>{product.imagenEmoji}</span>
        </div>
      )}

      {/* ── Contenido ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Nombre */}
        <p className="qr-product-name">{product.name}</p>

        {/* Descripción */}
        {product.description && (
          <p className="qr-product-desc">{product.description}</p>
        )}

        {/* Etiquetas dietéticas */}
        {tagMeta.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
            {tagMeta.map(t => (
              <span key={t.id} className="qr-tag-badge">{t.icon} {t.label}</span>
            ))}
          </div>
        )}

        {/* Alérgenos */}
        {allergenMeta.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginBottom: '0.4rem' }}>
            {allergenMeta.map(a => (
              <span key={a.id} className="qr-allergen-badge" title={a.label}>
                {a.icon}
              </span>
            ))}
          </div>
        )}

        {/* Precio */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
          <span className="qr-product-price">{product.price.toFixed(2)} €</span>
          {product.halfPrice && (
            <span className="qr-product-half">· ½ {product.halfPrice.toFixed(2)} €</span>
          )}
        </div>
      </div>
    </div>
  );
}

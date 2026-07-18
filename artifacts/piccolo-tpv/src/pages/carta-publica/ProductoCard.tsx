/**
 * ProductoCard — tarjeta de producto de la carta pública.
 * Diseñada para mostrar u ocultar imagen, descripción, alérgenos y precio.
 */
import { FIXTURE_ALLERGENS, FIXTURE_DIETARY_TAGS, type FixtureProduct } from './fixtures';

interface Props {
  product:        FixtureProduct;
  activeAllergen: string | null;
  style?:         React.CSSProperties;
  delay?:         number;
}

export default function ProductoCard({ product, activeAllergen, style, delay = 0 }: Props) {
  const allergenMeta = FIXTURE_ALLERGENS.filter(a => product.allergens.includes(a.id));
  const tagMeta      = FIXTURE_DIETARY_TAGS.filter(t => product.tags.includes(t.id));
  const isFiltered   = activeAllergen !== null && product.allergens.includes(activeAllergen as never);

  if (isFiltered) return null;

  return (
    <div
      className="qr-product-card qr-animate"
      style={{ animationDelay: `${delay * 0.05}s`, opacity: 0, ...style }}
    >
      {/* Imagen */}
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="qr-product-img"
          loading="lazy"
        />
      )}

      {/* Contenido */}
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
              <span key={a.id} className="qr-allergen-badge">{a.icon}</span>
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

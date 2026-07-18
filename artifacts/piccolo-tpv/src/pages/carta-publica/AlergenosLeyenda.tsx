/**
 * AlergenosLeyenda — barra sticky de filtros dietéticos y alérgenos.
 * Idéntica en comportamiento a la del QR Menú original.
 */
import { FIXTURE_ALLERGENS, FIXTURE_DIETARY_TAGS, type AllergenId, type DietaryTagId } from './fixtures';

interface Props {
  activeAllergen: AllergenId | null;
  activeTag:      DietaryTagId | null;
  onAllergen:     (id: AllergenId | null) => void;
  onTag:          (id: DietaryTagId | null) => void;
}

export default function AlergenosLeyenda({ activeAllergen, activeTag, onAllergen, onTag }: Props) {
  return (
    <div className="qr-filters">
      {/* Fila 1: etiquetas dietéticas */}
      <div className="qr-scroll-x" style={{ display: 'flex', gap: '0.5rem', padding: '0.65rem 1rem 0.5rem' }}>
        {FIXTURE_DIETARY_TAGS.map(tag => (
          <button
            key={tag.id}
            className={`qr-filter-chip${activeTag === tag.id ? ' active-tag' : ''}`}
            onClick={() => onTag(activeTag === tag.id ? null : tag.id as DietaryTagId)}
          >
            {tag.icon} {tag.label}
          </button>
        ))}
        {(activeTag || activeAllergen) && (
          <button
            className="qr-filter-chip clear"
            onClick={() => { onTag(null); onAllergen(null); }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Fila 2: alérgenos */}
      <div
        className="qr-scroll-x"
        style={{
          display:    'flex',
          gap:        '0.5rem',
          padding:    '0.4rem 1rem 0.65rem',
          borderTop:  '1px solid rgba(232,224,213,0.6)',
          alignItems: 'center',
        }}
      >
        <span style={{
          flexShrink:    0,
          fontSize:      '0.65rem',
          color:         '#9e8f83',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          fontWeight:    600,
          marginRight:   '0.15rem',
          alignSelf:     'center',
        }}>
          Sin:
        </span>
        {FIXTURE_ALLERGENS.map(a => (
          <button
            key={a.id}
            className={`qr-filter-chip${activeAllergen === a.id ? ' active-allergen' : ''}`}
            onClick={() => onAllergen(activeAllergen === a.id ? null : a.id as AllergenId)}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

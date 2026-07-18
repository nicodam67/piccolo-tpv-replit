/**
 * CartaInicio — pantalla principal de la carta pública.
 * Hero · filtros · categorías · footer.
 */
import { ChevronRight, Clock, MapPin } from 'lucide-react';
import { useState } from 'react';
import {
  FIXTURE_BRANDING, FIXTURE_CATEGORIES,
  type FixtureCategory, type AllergenId, type DietaryTagId,
} from './fixtures';
import AlergenosLeyenda from './AlergenosLeyenda';
import IdiomaSelector from './IdiomaSelector';
import type { IdiomaCode } from './fixtures';

interface Props {
  activeAllergen: AllergenId | null;
  activeTag:      DietaryTagId | null;
  onAllergen:     (id: AllergenId | null) => void;
  onTag:          (id: DietaryTagId | null) => void;
  onCategory:     (cat: FixtureCategory) => void;
}

export default function CartaInicio({ activeAllergen, activeTag, onAllergen, onTag, onCategory }: Props) {
  const b = FIXTURE_BRANDING;
  const [idioma, setIdioma] = useState<IdiomaCode>('es');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--qr-bg)' }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="qr-hero">
        {/* Imagen de fondo */}
        <img
          src={b.heroImageUrl}
          alt=""
          aria-hidden="true"
          className="qr-hero-img"
        />

        {/* Selector de idioma */}
        <IdiomaSelector activeCode={idioma} onChange={setIdioma} />

        {/* Contenido central */}
        <div className="qr-hero-content">
          <p className="qr-hero-established">
            Fund. {b.establishedYear}
          </p>

          <h1 className="qr-hero-name">
            {b.restaurantName}
          </h1>

          <div className="qr-hero-divider" />

          <p className="qr-hero-tagline">
            {b.tagline}
          </p>
        </div>
      </header>

      {/* ── Info rápida (dirección + horario) ─────────────────────────────── */}
      <div style={{
        display:        'flex',
        justifyContent: 'center',
        gap:            '1rem',
        padding:        '0.75rem 1rem',
        borderBottom:   '1px solid var(--qr-border)',
        background:     'var(--qr-card)',
        flexWrap:       'wrap',
      }}>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [b.address, b.postalCode, b.city, b.province].filter(Boolean).join(', ')
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        '0.3rem',
            fontSize:   '0.75rem',
            color:      'var(--qr-muted)',
            textDecoration: 'none',
          }}
        >
          <MapPin size={13} style={{ color: 'var(--qr-accent)' }} />
          {b.address}, {b.city}
        </a>
        <button
          onClick={() => setScheduleOpen(true)}
          style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        '0.3rem',
            fontSize:   '0.75rem',
            color:      'var(--qr-muted)',
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            padding:    0,
            fontFamily: 'var(--qr-font-sans)',
          }}
        >
          <Clock size={13} style={{ color: 'var(--qr-accent)' }} />
          Ver horario
        </button>
      </div>

      {/* ── Filtros sticky ─────────────────────────────────────────────────── */}
      <AlergenosLeyenda
        activeAllergen={activeAllergen}
        activeTag={activeTag}
        onAllergen={onAllergen}
        onTag={onTag}
      />

      {/* ── Categorías ─────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
        <p style={{
          fontSize:      '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color:         'var(--qr-muted)',
          fontWeight:    600,
          marginBottom:  '0.75rem',
          fontFamily:    'var(--qr-font-sans)',
        }}>
          Nuestra carta
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
          {FIXTURE_CATEGORIES.map((cat, i) => (
            <button
              key={cat.id}
              className={`qr-category-card qr-animate qr-animate-d${Math.min(i + 1, 8)}`}
              style={{ opacity: 0 }}
              onClick={() => onCategory(cat)}
            >
              <span className="qr-category-emoji">{cat.emoji}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span className="qr-category-name">{cat.name}</span>
                <span className="qr-category-desc">{cat.description}</span>
              </span>
              <ChevronRight size={15} className="qr-chevron" />
            </button>
          ))}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="qr-footer">
        <p className="qr-footer-name">{b.restaurantName}</p>
        <div className="qr-footer-info">
          <p>{b.address}</p>
          <p>{b.postalCode} {b.city} · {b.province}</p>
          <p>{b.country}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              [b.address, b.postalCode, b.city].filter(Boolean).join(', ')
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="qr-footer-link"
          >
            <MapPin size={11} />
            Ver en Google Maps
          </a>
        </div>
        <p style={{ marginTop: '1.5rem', fontSize: '0.65rem', color: 'var(--qr-muted)', opacity: 0.4 }}>
          © {new Date().getFullYear()} {b.restaurantName}
        </p>
        {/* Nota de datos de prueba */}
        <p style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: 'var(--qr-muted)', opacity: 0.35, letterSpacing: '0.04em' }}>
          Datos de prueba · Fase 1 diseño visual
        </p>
      </footer>

      {/* ── Modal horario ──────────────────────────────────────────────────── */}
      {scheduleOpen && (
        <div
          onClick={() => setScheduleOpen(false)}
          style={{
            position:   'fixed',
            inset:      0,
            zIndex:     50,
            background: 'rgba(26,8,8,0.5)',
            display:    'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding:    '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   'var(--qr-card)',
              borderRadius: '1rem 1rem 0 0',
              padding:      '1.5rem',
              width:        '100%',
              maxWidth:     '400px',
              maxHeight:    '70vh',
              overflowY:    'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Clock size={16} style={{ color: 'var(--qr-accent)' }} />
              <h2 style={{ fontFamily: 'var(--qr-font-serif)', fontSize: '1.1rem', color: 'var(--qr-fg)', fontWeight: 500 }}>
                Horario
              </h2>
              <button
                onClick={() => setScheduleOpen(false)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--qr-muted)', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
              >
                ✕
              </button>
            </div>
            {b.schedule.map(row => (
              <div
                key={row.day}
                style={{
                  display:        'flex',
                  justifyContent: 'space-between',
                  padding:        '0.55rem 0',
                  borderBottom:   '1px solid var(--qr-border)',
                  fontSize:       '0.85rem',
                  gap:            '1rem',
                }}
              >
                <span style={{ color: 'var(--qr-fg)', fontWeight: 500 }}>{row.day}</span>
                <span style={{ color: row.hours === 'Cerrado' ? '#b45309' : 'var(--qr-muted)', textAlign: 'right' }}>
                  {row.hours}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

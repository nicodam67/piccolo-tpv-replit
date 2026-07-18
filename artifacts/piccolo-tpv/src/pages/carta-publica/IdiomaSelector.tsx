/**
 * IdiomaSelector — selector visual de idioma para la carta pública.
 * Fase 1: solo visual (no cambia el idioma todavía).
 */
import { useState } from 'react';
import { FIXTURE_IDIOMAS, type IdiomaCode } from './fixtures';
import { Globe } from 'lucide-react';

interface Props {
  activeCode?: IdiomaCode;
  onChange?: (code: IdiomaCode) => void;
}

export default function IdiomaSelector({ activeCode = 'es', onChange }: Props) {
  const [open, setOpen] = useState(false);

  const active = FIXTURE_IDIOMAS.find(l => l.code === activeCode) ?? FIXTURE_IDIOMAS[0];

  return (
    <div className="qr-locale-btn" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10 }}>
      {/* Botón comprimido */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            '0.3rem',
          padding:        '0.3rem 0.65rem',
          borderRadius:   '999px',
          background:     'rgba(26,8,8,0.55)',
          border:         '1px solid rgba(255,255,255,0.2)',
          color:          '#fff',
          fontSize:       '0.72rem',
          fontWeight:     600,
          cursor:         'pointer',
          backdropFilter: 'blur(4px)',
          letterSpacing:  '0.05em',
        }}
      >
        <Globe size={11} />
        {active.flag} {active.label}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position:      'absolute',
            top:           'calc(100% + 0.4rem)',
            right:         0,
            background:    'rgba(26,8,8,0.92)',
            backdropFilter:'blur(12px)',
            border:        '1px solid rgba(255,255,255,0.12)',
            borderRadius:  '10px',
            overflow:      'hidden',
            minWidth:      '9rem',
            boxShadow:     '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {FIXTURE_IDIOMAS.map(lang => (
            <button
              key={lang.code}
              onClick={() => { onChange?.(lang.code); setOpen(false); }}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            '0.5rem',
                width:          '100%',
                padding:        '0.55rem 0.9rem',
                background:     lang.code === activeCode ? 'rgba(201,169,110,0.15)' : 'transparent',
                border:         'none',
                color:          lang.code === activeCode ? '#c9a96e' : 'rgba(255,255,255,0.8)',
                fontSize:       '0.78rem',
                fontWeight:     lang.code === activeCode ? 600 : 400,
                cursor:         'pointer',
                textAlign:      'left',
                letterSpacing:  '0.03em',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

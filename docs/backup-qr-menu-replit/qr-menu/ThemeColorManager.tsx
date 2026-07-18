import { RotateCcw, X } from 'lucide-react';
import type { ThemeColors, EnabledColors } from './types';
import { DEFAULT_THEME_COLORS, DEFAULT_ENABLED_COLORS, COLOR_PRESETS } from './types';

type Props = {
  colors: ThemeColors;
  enabledColors: EnabledColors;
  onChange: (colors: ThemeColors, enabled: EnabledColors) => void;
};

type ColorKey = keyof ThemeColors;

function ColorRow({
  id, label, value, enabled, onChange, onToggle,
}: {
  id: string; label: string; value: string; enabled: boolean;
  onChange: (v: string) => void; onToggle: (e: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={`text-xs font-medium ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{label}</label>
        {enabled ? (
          <button type="button" onClick={() => onToggle(false)} title="Quitar color" className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer">
            <X size={12} />
          </button>
        ) : (
          <button type="button" onClick={() => onToggle(true)} className="text-xs text-blue-500 underline cursor-pointer hover:opacity-70">
            Personalizar
          </button>
        )}
      </div>
      {enabled ? (
        <div className="flex items-center gap-2">
          <input
            id={id} type="color" value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5 bg-white"
          />
          <input
            type="text" value={value}
            onChange={(e) => { if (/^#[0-9a-fA-F]{0,8}$/.test(e.target.value)) onChange(e.target.value); }}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 font-mono"
            placeholder="#000000"
          />
        </div>
      ) : (
        <div className="h-8 flex items-center">
          <span className="text-xs text-gray-400 italic">Usando valor por defecto</span>
        </div>
      )}
    </div>
  );
}

export default function ThemeColorManager({ colors, enabledColors, onChange }: Props) {
  function update(key: ColorKey, value: string) {
    onChange({ ...colors, [key]: value }, enabledColors);
  }
  function toggle(key: ColorKey, enabled: boolean) {
    onChange(colors, { ...enabledColors, [key]: enabled });
  }
  function isEnabled(key: ColorKey) { return enabledColors[key] !== false; }
  function applyPreset(preset: ThemeColors) { onChange(preset, DEFAULT_ENABLED_COLORS); }

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Paletas predefinidas</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.colors)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:border-gray-400 transition-colors cursor-pointer bg-white"
            >
              <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: preset.colors.primary }} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Base */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Colores base</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorRow id="col-primary" label="Color principal" value={colors.primary} enabled={isEnabled('primary')} onChange={(v) => update('primary', v)} onToggle={(e) => toggle('primary', e)} />
          <ColorRow id="col-bg" label="Fondo de página" value={colors.background} enabled={isEnabled('background')} onChange={(v) => update('background', v)} onToggle={(e) => toggle('background', e)} />
          <ColorRow id="col-accent" label="Color de acento" value={colors.accent} enabled={isEnabled('accent')} onChange={(v) => update('accent', v)} onToggle={(e) => toggle('accent', e)} />
        </div>
      </div>

      {/* Hero */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Portada (hero)</p>
        <p className="text-xs text-gray-500 mb-3">Colores del nombre, eslogan y año de fundación sobre la imagen.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorRow id="col-hero-title" label="Nombre del restaurante" value={colors.heroTitleColor} enabled={isEnabled('heroTitleColor')} onChange={(v) => update('heroTitleColor', v)} onToggle={(e) => toggle('heroTitleColor', e)} />
          <ColorRow id="col-hero-tag" label="Eslogan" value={colors.heroTaglineColor} enabled={isEnabled('heroTaglineColor')} onChange={(v) => update('heroTaglineColor', v)} onToggle={(e) => toggle('heroTaglineColor', e)} />
          <ColorRow id="col-hero-est" label="Año de fundación" value={colors.heroEstablishedColor} enabled={isEnabled('heroEstablishedColor')} onChange={(v) => update('heroEstablishedColor', v)} onToggle={(e) => toggle('heroEstablishedColor', e)} />
        </div>
      </div>

      {/* Info */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Información del pie</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="col-info" label="Color de texto informativo" value={colors.infoTextColor} enabled={isEnabled('infoTextColor')} onChange={(v) => update('infoTextColor', v)} onToggle={(e) => toggle('infoTextColor', e)} />
          <ColorRow id="col-tap" label="&quot;Toca para detalles&quot;" value={colors.tapDetailsColor} enabled={isEnabled('tapDetailsColor')} onChange={(v) => update('tapDetailsColor', v)} onToggle={(e) => toggle('tapDetailsColor', e)} />
        </div>
      </div>

      {/* Category cards */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Tarjetas de categorías</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="col-card-bg" label="Fondo de tarjeta" value={colors.categoryCardBg} enabled={isEnabled('categoryCardBg')} onChange={(v) => update('categoryCardBg', v)} onToggle={(e) => toggle('categoryCardBg', e)} />
          <ColorRow id="col-card-txt" label="Texto de tarjeta" value={colors.categoryCardText} enabled={isEnabled('categoryCardText')} onChange={(v) => update('categoryCardText', v)} onToggle={(e) => toggle('categoryCardText', e)} />
        </div>
      </div>

      {/* Buttons */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Botones flotantes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">📞 Llamar</p>
            <div className="grid grid-cols-2 gap-3">
              <ColorRow id="col-call-bg" label="Fondo" value={colors.callButtonBg} enabled={isEnabled('callButtonBg')} onChange={(v) => update('callButtonBg', v)} onToggle={(e) => toggle('callButtonBg', e)} />
              <ColorRow id="col-call-txt" label="Texto" value={colors.callButtonText} enabled={isEnabled('callButtonText')} onChange={(v) => update('callButtonText', v)} onToggle={(e) => toggle('callButtonText', e)} />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">🕐 Horario</p>
            <div className="grid grid-cols-2 gap-3">
              <ColorRow id="col-sched-bg" label="Fondo" value={colors.scheduleButtonBg} enabled={isEnabled('scheduleButtonBg')} onChange={(v) => update('scheduleButtonBg', v)} onToggle={(e) => toggle('scheduleButtonBg', e)} />
              <ColorRow id="col-sched-txt" label="Texto" value={colors.scheduleButtonText} enabled={isEnabled('scheduleButtonText')} onChange={(v) => update('scheduleButtonText', v)} onToggle={(e) => toggle('scheduleButtonText', e)} />
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3" style={{ background: isEnabled('background') ? colors.background : '#fafaf9' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vista previa</p>
        <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm"
          style={{ background: isEnabled('categoryCardBg') ? colors.categoryCardBg : '#fff' }}>
          <span className="text-base font-medium" style={{ color: isEnabled('categoryCardText') ? colors.categoryCardText : '#1a1a1a' }}>Pizzas</span>
          <span style={{ color: (isEnabled('categoryCardText') ? colors.categoryCardText : '#1a1a1a') + '55' }}>›</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-4 py-2 rounded-full text-sm font-medium"
            style={{ background: isEnabled('callButtonBg') ? colors.callButtonBg : '#1a1a1a', color: isEnabled('callButtonText') ? colors.callButtonText : '#fff' }}>
            📞 Llamar
          </span>
          <span className="px-4 py-2 rounded-full text-sm font-medium border"
            style={{ background: isEnabled('scheduleButtonBg') ? colors.scheduleButtonBg : '#f0f0f0', color: isEnabled('scheduleButtonText') ? colors.scheduleButtonText : '#1a1a1a' }}>
            🕐 Horario
          </span>
        </div>
        <p className="text-sm" style={{ color: isEnabled('infoTextColor') ? colors.infoTextColor : '#6b7280' }}>
          Calle Mayor, 12 · Barcelona · 🗺 Ver en Google Maps
        </p>
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        onClick={() => onChange(DEFAULT_THEME_COLORS, DEFAULT_ENABLED_COLORS)}
      >
        <RotateCcw size={12} />
        Restaurar colores originales
      </button>
    </div>
  );
}

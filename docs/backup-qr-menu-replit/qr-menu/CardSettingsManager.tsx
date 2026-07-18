import { LayoutGrid, List, Rows3 } from 'lucide-react';
import type { CardSettings } from './types';
import { DEFAULT_CARD_SETTINGS } from './types';

type Props = { settings: CardSettings; onChange: (s: CardSettings) => void };

const LAYOUT_OPTIONS: { value: CardSettings['layout']; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'grid', label: 'Cuadrícula', Icon: LayoutGrid },
  { value: 'list', label: 'Lista', Icon: List },
  { value: 'compact', label: 'Compacto', Icon: Rows3 },
];

const TOGGLE_FIELDS: { key: keyof Omit<CardSettings, 'layout'>; label: string; description: string }[] = [
  { key: 'showImage', label: 'Foto / Vídeo', description: 'Imagen o vídeo del plato' },
  { key: 'showDescription', label: 'Descripción', description: 'Texto descriptivo del plato' },
  { key: 'showPrice', label: 'Precio', description: 'Precio principal' },
  { key: 'showHalfPortion', label: 'Media ración', description: 'Precio de media ración cuando aplique' },
  { key: 'showQuantity', label: 'Cantidad / Volumen', description: 'Gramos, mililitros, etc.' },
  { key: 'showTags', label: 'Etiquetas dietéticas', description: 'Vegano, vegetariano, picante…' },
  { key: 'showAllergens', label: 'Alérgenos', description: 'Lista de alérgenos del plato' },
];

export default function CardSettingsManager({ settings, onChange }: Props) {
  function toggle(key: keyof Omit<CardSettings, 'layout'>) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  return (
    <div className="space-y-5">
      {/* Layout */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Disposición de los productos</p>
        <div className="flex gap-2">
          {LAYOUT_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...settings, layout: value })}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                settings.layout === value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Elementos a mostrar</p>
        <div className="space-y-3">
          {TOGGLE_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-1">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings[key]}
                onClick={() => toggle(key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings[key] ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings[key] ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

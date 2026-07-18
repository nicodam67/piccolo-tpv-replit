import { useState } from 'react';
import type { QrBranding, ThemeColors, EnabledColors, ThemeFonts, CardSettings, DaySchedule } from './types';
import { DEFAULT_THEME_COLORS, DEFAULT_ENABLED_COLORS, DEFAULT_THEME_FONTS, DEFAULT_CARD_SETTINGS, DEFAULT_SCHEDULE } from './types';
import ThemeColorManager from './ThemeColorManager';
import FontManager from './FontManager';
import CardSettingsManager from './CardSettingsManager';
import TabSchedule from './TabSchedule';

type Props = { branding: QrBranding; onChange: (b: QrBranding) => void };

type BrandingSection = 'info' | 'hero' | 'colors' | 'fonts' | 'cards' | 'schedule';

const SECTIONS: { id: BrandingSection; label: string; icon: string }[] = [
  { id: 'info',     label: 'Información',   icon: '🏷️' },
  { id: 'hero',     label: 'Portada',        icon: '🖼️' },
  { id: 'colors',   label: 'Colores',        icon: '🎨' },
  { id: 'fonts',    label: 'Tipografías',    icon: '✍️' },
  { id: 'cards',    label: 'Tarjetas',       icon: '🃏' },
  { id: 'schedule', label: 'Horario',        icon: '🕐' },
];

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700 block mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  );
}

export default function TabBranding({ branding, onChange }: Props) {
  const [section, setSection] = useState<BrandingSection>('info');

  const colors = branding.themeColors ?? DEFAULT_THEME_COLORS;
  const enabledColors: EnabledColors = DEFAULT_ENABLED_COLORS;
  const fonts = branding.themeFonts ?? DEFAULT_THEME_FONTS;
  const cardSettings = branding.cardSettings ?? DEFAULT_CARD_SETTINGS;
  const schedule = branding.schedule ?? DEFAULT_SCHEDULE;

  function patch(partial: Partial<QrBranding>) {
    onChange({ ...branding, ...partial });
  }

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none bg-gray-50 p-1 rounded-xl">
        {SECTIONS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              section === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="mr-1">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Section: info */}
      {section === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormRow label="Nombre del restaurante" required>
              <TextInput value={branding.restaurantName} onChange={(v) => patch({ restaurantName: v })} placeholder="Piccolo Ristorante" />
            </FormRow>
            <FormRow label="Eslogan">
              <TextInput value={branding.tagline} onChange={(v) => patch({ tagline: v })} placeholder="Cocina con sabor italiano" />
            </FormRow>
            <FormRow label="Teléfono">
              <TextInput value={branding.phone} onChange={(v) => patch({ phone: v })} placeholder="+34 93 000 00 00" type="tel" />
            </FormRow>
            <FormRow label="Año de fundación">
              <TextInput value={branding.establishedYear} onChange={(v) => patch({ establishedYear: v })} placeholder="1985" type="number" />
            </FormRow>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dirección</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormRow label="Calle y número">
                <TextInput value={branding.address} onChange={(v) => patch({ address: v })} placeholder="Calle Mayor, 12" />
              </FormRow>
              <FormRow label="Código postal">
                <TextInput value={branding.postalCode} onChange={(v) => patch({ postalCode: v })} placeholder="08001" />
              </FormRow>
              <FormRow label="Ciudad">
                <TextInput value={branding.city} onChange={(v) => patch({ city: v })} placeholder="Barcelona" />
              </FormRow>
              <FormRow label="Provincia / Comunidad">
                <TextInput value={branding.province} onChange={(v) => patch({ province: v })} placeholder="Barcelona" />
              </FormRow>
              <FormRow label="País">
                <TextInput value={branding.country} onChange={(v) => patch({ country: v })} placeholder="España" />
              </FormRow>
            </div>
          </div>
        </div>
      )}

      {/* Section: hero */}
      {section === 'hero' && (
        <div className="space-y-4">
          <FormRow label="URL de imagen de portada">
            <TextInput value={branding.heroImageUrl} onChange={(v) => patch({ heroImageUrl: v })} placeholder="https://…" type="url" />
          </FormRow>
          {branding.heroImageUrl && (
            <div className="relative h-44 rounded-xl overflow-hidden">
              <img src={branding.heroImageUrl} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <p className="text-white text-xs font-medium">Vista previa</p>
              </div>
            </div>
          )}
          <FormRow label="URL de vídeo de portada">
            <TextInput value={branding.heroVideoUrl} onChange={(v) => patch({ heroVideoUrl: v })} placeholder="https://… (MP4)" type="url" />
          </FormRow>
          {branding.heroVideoUrl && (
            <video src={branding.heroVideoUrl} className="w-full h-32 object-cover rounded-xl" autoPlay loop muted playsInline />
          )}
          <p className="text-xs text-gray-500">
            💡 Si se configura vídeo, tiene preferencia sobre la imagen. Se recomienda aspecto 16:9 o 4:3.
          </p>
          <FormRow label="URL del logo">
            <TextInput value={branding.logoUrl} onChange={(v) => patch({ logoUrl: v })} placeholder="https://…/logo.png" type="url" />
          </FormRow>
        </div>
      )}

      {/* Section: colors */}
      {section === 'colors' && (
        <ThemeColorManager
          colors={colors}
          enabledColors={enabledColors}
          onChange={(newColors, newEnabled) => patch({ themeColors: newColors })}
        />
      )}

      {/* Section: fonts */}
      {section === 'fonts' && (
        <FontManager fonts={fonts} onChange={(f) => patch({ themeFonts: f })} />
      )}

      {/* Section: cards */}
      {section === 'cards' && (
        <CardSettingsManager settings={cardSettings} onChange={(s) => patch({ cardSettings: s })} />
      )}

      {/* Section: schedule — embebido tal como el original */}
      {section === 'schedule' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Configura el horario que verán los clientes en la carta pública al pulsar el botón 🕐 Horario.
          </p>
          <TabSchedule
            schedule={schedule}
            onChange={(s: DaySchedule[]) => patch({ schedule: s })}
          />
        </div>
      )}
    </div>
  );
}

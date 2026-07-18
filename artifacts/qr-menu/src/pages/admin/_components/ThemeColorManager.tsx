import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { RotateCcw, X } from "lucide-react";
import ColorPickerWithPalette from "@/components/ui/color-picker.tsx";

type ThemeColors = {
  primary: string;
  background: string;
  accent: string;
  infoTextColor: string;
  categoryCardBg: string;
  categoryCardText: string;
  callButtonBg: string;
  callButtonText: string;
  scheduleButtonBg: string;
  scheduleButtonText: string;
  heroTitleColor: string;
  heroTaglineColor: string;
  heroEstablishedColor: string;
  tapDetailsColor: string;
};

// Which keys are currently "enabled" (have a custom color)
type EnabledColors = Partial<Record<keyof ThemeColors, boolean>>;

type Props = {
  colors: ThemeColors;
  enabledColors: EnabledColors;
  onChange: (colors: ThemeColors, enabled: EnabledColors) => void;
};

const PRESETS: { label: string; colors: ThemeColors }[] = [
  {
    label: "Burdeos",
    colors: {
      primary: "#5c1f1f", background: "#faf8f4", accent: "#c8963e",
      infoTextColor: "#6b5a4a", categoryCardBg: "#ffffff", categoryCardText: "#2d1c0e",
      callButtonBg: "#5c1f1f", callButtonText: "#ffffff",
      scheduleButtonBg: "#f0ece4", scheduleButtonText: "#5c1f1f",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#c8963e",
      tapDetailsColor: "#5c1f1f",
    },
  },
  {
    label: "Verde",
    colors: {
      primary: "#1e4d2b", background: "#f5f9f4", accent: "#8ab87a",
      infoTextColor: "#4a6650", categoryCardBg: "#ffffff", categoryCardText: "#1a2d1e",
      callButtonBg: "#1e4d2b", callButtonText: "#ffffff",
      scheduleButtonBg: "#e8f0e9", scheduleButtonText: "#1e4d2b",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#8ab87a",
      tapDetailsColor: "#1e4d2b",
    },
  },
  {
    label: "Azul marino",
    colors: {
      primary: "#1a2e4a", background: "#f4f7fa", accent: "#5b8fc9",
      infoTextColor: "#3a5470", categoryCardBg: "#ffffff", categoryCardText: "#1a2e4a",
      callButtonBg: "#1a2e4a", callButtonText: "#ffffff",
      scheduleButtonBg: "#e6edf5", scheduleButtonText: "#1a2e4a",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#5b8fc9",
      tapDetailsColor: "#1a2e4a",
    },
  },
  {
    label: "Negro elegante",
    colors: {
      primary: "#1a1a1a", background: "#f9f7f5", accent: "#c9a84c",
      infoTextColor: "#555555", categoryCardBg: "#ffffff", categoryCardText: "#1a1a1a",
      callButtonBg: "#1a1a1a", callButtonText: "#ffffff",
      scheduleButtonBg: "#eeeeee", scheduleButtonText: "#1a1a1a",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#c9a84c",
      tapDetailsColor: "#1a1a1a",
    },
  },
  {
    label: "Terracota",
    colors: {
      primary: "#8b3a1e", background: "#fdf5ee", accent: "#d4a96a",
      infoTextColor: "#7a5040", categoryCardBg: "#ffffff", categoryCardText: "#3d1a0a",
      callButtonBg: "#8b3a1e", callButtonText: "#ffffff",
      scheduleButtonBg: "#f5e8de", scheduleButtonText: "#8b3a1e",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#d4a96a",
      tapDetailsColor: "#8b3a1e",
    },
  },
  {
    label: "Lila",
    colors: {
      primary: "#5b3572", background: "#faf8fd", accent: "#b38fd4",
      infoTextColor: "#6b5080", categoryCardBg: "#ffffff", categoryCardText: "#2d1845",
      callButtonBg: "#5b3572", callButtonText: "#ffffff",
      scheduleButtonBg: "#ede5f5", scheduleButtonText: "#5b3572",
      heroTitleColor: "#ffffff", heroTaglineColor: "#ffffffb3", heroEstablishedColor: "#b38fd4",
      tapDetailsColor: "#5b3572",
    },
  },
];

const DEFAULT_COLORS: ThemeColors = {
  primary: "#5c1f1f",
  background: "#faf8f4",
  accent: "#c8963e",
  infoTextColor: "#6b5a4a",
  categoryCardBg: "#ffffff",
  categoryCardText: "#2d1c0e",
  callButtonBg: "#5c1f1f",
  callButtonText: "#ffffff",
  scheduleButtonBg: "#f0ece4",
  scheduleButtonText: "#5c1f1f",
  heroTitleColor: "#ffffff",
  heroTaglineColor: "#ffffffb3",
  heroEstablishedColor: "#c8963e",
  tapDetailsColor: "#5c1f1f",
};

const DEFAULT_ENABLED: EnabledColors = {
  primary: true, background: true, accent: true,
  infoTextColor: true, categoryCardBg: true, categoryCardText: true,
  callButtonBg: true, callButtonText: true,
  scheduleButtonBg: true, scheduleButtonText: true,
  heroTitleColor: true, heroTaglineColor: true, heroEstablishedColor: true,
  tapDetailsColor: true,
};

type ColorFieldKey = keyof ThemeColors;

function ColorRow({
  id,
  label,
  value,
  enabled,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
  onChange: (v: string) => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className={enabled ? "" : "text-muted-foreground"}>{label}</Label>
        {enabled ? (
          <button
            type="button"
            onClick={() => onToggle(false)}
            title="Quitar color personalizado"
            className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(true)}
            className="text-xs text-primary underline underline-offset-2 cursor-pointer hover:opacity-70 transition-opacity"
          >
            Personalizar
          </button>
        )}
      </div>
      {enabled ? (
        <ColorPickerWithPalette id={id} value={value} onChange={onChange} />
      ) : (
        <div className="h-10 flex items-center">
          <span className="text-xs text-muted-foreground italic">Usando color por defecto</span>
        </div>
      )}
    </div>
  );
}

export default function ThemeColorManager({ colors, enabledColors, onChange }: Props) {
  function update(key: ColorFieldKey, value: string) {
    onChange({ ...colors, [key]: value }, enabledColors);
  }

  function toggle(key: ColorFieldKey, enabled: boolean) {
    onChange(colors, { ...enabledColors, [key]: enabled });
  }

  function isEnabled(key: ColorFieldKey): boolean {
    return enabledColors[key] !== false;
  }

  function applyPreset(preset: ThemeColors) {
    // Enable all colors when applying a preset
    onChange(preset, DEFAULT_ENABLED);
  }

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Paletas predefinidas</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.colors)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-foreground/40 transition-colors cursor-pointer"
            >
              <span
                className="w-3 h-3 rounded-full border border-black/10"
                style={{ background: preset.colors.primary }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Base colors */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Colores base</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorRow id="color-primary" label="Color principal" value={colors.primary} enabled={isEnabled("primary")} onChange={(v) => update("primary", v)} onToggle={(e) => toggle("primary", e)} />
          <ColorRow id="color-background" label="Color de fondo" value={colors.background} enabled={isEnabled("background")} onChange={(v) => update("background", v)} onToggle={(e) => toggle("background", e)} />
          <ColorRow id="color-accent" label="Color de acento" value={colors.accent} enabled={isEnabled("accent")} onChange={(v) => update("accent", v)} onToggle={(e) => toggle("accent", e)} />
        </div>
      </div>

      {/* Hero text colors */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Portada (hero)</p>
        <p className="text-xs text-muted-foreground">Colores del nombre, eslogan y año de fundación sobre la imagen de fondo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorRow id="color-hero-title" label="Nombre del restaurante" value={colors.heroTitleColor} enabled={isEnabled("heroTitleColor")} onChange={(v) => update("heroTitleColor", v)} onToggle={(e) => toggle("heroTitleColor", e)} />
          <ColorRow id="color-hero-tagline" label="Eslogan" value={colors.heroTaglineColor} enabled={isEnabled("heroTaglineColor")} onChange={(v) => update("heroTaglineColor", v)} onToggle={(e) => toggle("heroTaglineColor", e)} />
          <ColorRow id="color-hero-established" label="Año de fundación" value={colors.heroEstablishedColor} enabled={isEnabled("heroEstablishedColor")} onChange={(v) => update("heroEstablishedColor", v)} onToggle={(e) => toggle("heroEstablishedColor", e)} />
        </div>
      </div>

      {/* Info text */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Información del restaurante</p>
        <p className="text-xs text-muted-foreground">Color del texto en el pie de página (dirección, teléfono, etc.)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="color-info-text" label="Color de texto informativo" value={colors.infoTextColor} enabled={isEnabled("infoTextColor")} onChange={(v) => update("infoTextColor", v)} onToggle={(e) => toggle("infoTextColor", e)} />
        </div>
      </div>

      {/* Dish cards */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Platos</p>
        <p className="text-xs text-muted-foreground">Colores en las tarjetas de platos del menú.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="color-tap-details" label="&quot;Toca para los detalles&quot;" value={colors.tapDetailsColor} enabled={isEnabled("tapDetailsColor")} onChange={(v) => update("tapDetailsColor", v)} onToggle={(e) => toggle("tapDetailsColor", e)} />
        </div>
      </div>

      {/* Category cards */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Tarjetas de categorías</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="color-card-bg" label="Fondo de tarjeta" value={colors.categoryCardBg} enabled={isEnabled("categoryCardBg")} onChange={(v) => update("categoryCardBg", v)} onToggle={(e) => toggle("categoryCardBg", e)} />
          <ColorRow id="color-card-text" label="Texto de tarjeta" value={colors.categoryCardText} enabled={isEnabled("categoryCardText")} onChange={(v) => update("categoryCardText", v)} onToggle={(e) => toggle("categoryCardText", e)} />
        </div>
      </div>

      {/* Call button */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Botón de llamada</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="color-call-bg" label="Fondo del botón" value={colors.callButtonBg} enabled={isEnabled("callButtonBg")} onChange={(v) => update("callButtonBg", v)} onToggle={(e) => toggle("callButtonBg", e)} />
          <ColorRow id="color-call-text" label="Texto del botón" value={colors.callButtonText} enabled={isEnabled("callButtonText")} onChange={(v) => update("callButtonText", v)} onToggle={(e) => toggle("callButtonText", e)} />
        </div>
      </div>

      {/* Schedule button */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Botón de horario</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorRow id="color-schedule-bg" label="Fondo del botón" value={colors.scheduleButtonBg} enabled={isEnabled("scheduleButtonBg")} onChange={(v) => update("scheduleButtonBg", v)} onToggle={(e) => toggle("scheduleButtonBg", e)} />
          <ColorRow id="color-schedule-text" label="Texto del botón" value={colors.scheduleButtonText} enabled={isEnabled("scheduleButtonText")} onChange={(v) => update("scheduleButtonText", v)} onToggle={(e) => toggle("scheduleButtonText", e)} />
        </div>
      </div>

      {/* Preview */}
      <div
        className="rounded-xl border border-border p-4 space-y-3"
        style={{ background: isEnabled("background") ? colors.background : undefined }}
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vista previa</p>
        <div
          className="rounded-xl border border-border/60 p-4 flex items-center justify-between gap-4 shadow-sm"
          style={{ background: isEnabled("categoryCardBg") ? colors.categoryCardBg : undefined }}
        >
          <span className="text-base font-medium" style={{ color: isEnabled("categoryCardText") ? colors.categoryCardText : undefined }}>Pizzas</span>
          <span className="text-xs" style={{ color: isEnabled("categoryCardText") ? colors.categoryCardText : undefined, opacity: 0.5 }}>›</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <span
            className="px-4 py-2 rounded-full text-sm font-medium"
            style={{ background: isEnabled("callButtonBg") ? colors.callButtonBg : undefined, color: isEnabled("callButtonText") ? colors.callButtonText : undefined }}
          >
            📞 Llamar
          </span>
          <span
            className="px-4 py-2 rounded-full text-sm font-medium border"
            style={{ background: isEnabled("scheduleButtonBg") ? colors.scheduleButtonBg : undefined, color: isEnabled("scheduleButtonText") ? colors.scheduleButtonText : undefined }}
          >
            🕐 Horario
          </span>
        </div>
        <p className="text-sm" style={{ color: isEnabled("infoTextColor") ? colors.infoTextColor : undefined }}>Calle Mayor, 12 · Barcelona · 🗺 Ver en Google Maps</p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer gap-1.5 text-muted-foreground"
        onClick={() => onChange(DEFAULT_COLORS, DEFAULT_ENABLED)}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Restaurar colores originales
      </Button>
    </div>
  );
}

export { DEFAULT_COLORS, DEFAULT_ENABLED };
export type { ThemeColors, EnabledColors };

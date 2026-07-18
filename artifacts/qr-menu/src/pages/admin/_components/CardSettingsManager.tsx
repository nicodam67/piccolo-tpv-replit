import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export type CardSettings = {
  showImage: boolean;
  showDescription: boolean;
  showTags: boolean;
  showAllergens: boolean;
  showPrice: boolean;
  showHalfPortion: boolean;
  showQuantity: boolean;
  layout: "grid" | "list" | "compact";
};

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  showImage: true,
  showDescription: true,
  showTags: true,
  showAllergens: true,
  showPrice: true,
  showHalfPortion: true,
  showQuantity: true,
  layout: "grid",
};

type Props = {
  settings: CardSettings;
  onChange: (s: CardSettings) => void;
};

const LAYOUT_OPTIONS: { value: CardSettings["layout"]; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "grid", label: "Cuadrícula", Icon: LayoutGrid },
  { value: "list", label: "Lista", Icon: List },
  { value: "compact", label: "Compacto", Icon: Rows3 },
];

const TOGGLE_FIELDS: { key: keyof Omit<CardSettings, "layout">; label: string; description: string }[] = [
  { key: "showImage", label: "Foto / Vídeo", description: "Imagen o vídeo del plato" },
  { key: "showDescription", label: "Descripción", description: "Texto descriptivo del plato" },
  { key: "showPrice", label: "Precio", description: "Precio principal" },
  { key: "showHalfPortion", label: "Media ración", description: "Precio de media ración cuando aplique" },
  { key: "showQuantity", label: "Cantidad / Volumen", description: "Gramos, mililitros, etc." },
  { key: "showTags", label: "Etiquetas dietéticas", description: "Vegano, vegetariano, picante…" },
  { key: "showAllergens", label: "Alérgenos", description: "Lista de alérgenos del plato" },
];

export default function CardSettingsManager({ settings, onChange }: Props) {
  function toggle(key: keyof Omit<CardSettings, "layout">) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  return (
    <div className="space-y-5">
      {/* Layout selector */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Disposición de los productos</p>
        <div className="flex gap-2">
          {LAYOUT_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...settings, layout: value })}
              className={cn(
                "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                settings.layout === value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle fields */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Elementos a mostrar</p>
        <div className="space-y-3">
          {TOGGLE_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-1">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={settings[key]}
                onCheckedChange={() => toggle(key)}
                className="cursor-pointer shrink-0"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

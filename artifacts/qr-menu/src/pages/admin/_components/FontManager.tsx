import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import ColorPickerWithPalette from "@/components/ui/color-picker.tsx";

export type ThemeFonts = {
  heading: string;
  body: string;
  headingColor: string;
  bodyColor: string;
};

export const DEFAULT_FONTS: ThemeFonts = {
  heading: "Playfair Display",
  body: "Lato",
  headingColor: "",
  bodyColor: "",
};

type FontOption = {
  label: string;
  value: string;
  category: "serif" | "sans" | "display" | "custom";
  preview: string;
  cdnUrl?: string; // for custom uploaded fonts
};

// Custom uploaded fonts with their CDN URLs
const CUSTOM_FONTS: FontOption[] = [
  { label: "Algerian", value: "Algerian__custom", category: "custom", preview: "Menú del día", cdnUrl: "https://hercules-cdn.com/file_Up90gFAtg9wEAXyeMzwFEHgS" },
  { label: "AvantGarde Demi", value: "AvantGardeBk__custom", category: "custom", preview: "Menú del día", cdnUrl: "https://hercules-cdn.com/file_89mHnxjgA9M4oKd6cCL5tH3G" },
  { label: "American Text BT", value: "AmericanTextBT__custom", category: "custom", preview: "Menú del día", cdnUrl: "https://hercules-cdn.com/file_ZvU6mje17p5pww4n7ZuLTmNH" },
  { label: "ZapfChan Demi", value: "ZapfChanDm__custom", category: "custom", preview: "Menú del día", cdnUrl: "https://hercules-cdn.com/file_H5zrJAiF1ZRToxIbF6PxUlIC" },
  { label: "ZapfChan Medium", value: "ZapfChanMd__custom", category: "custom", preview: "Menú del día", cdnUrl: "https://hercules-cdn.com/file_46LrUGLTssadG0rlxFlWL1tR" },
];

const FONT_OPTIONS: FontOption[] = [
  // Custom uploaded fonts
  ...CUSTOM_FONTS,
  // Serif
  { label: "Playfair Display", value: "Playfair Display", category: "serif", preview: "Menú del día" },
  { label: "Lora", value: "Lora", category: "serif", preview: "Menú del día" },
  { label: "Merriweather", value: "Merriweather", category: "serif", preview: "Menú del día" },
  { label: "Cormorant Garamond", value: "Cormorant Garamond", category: "serif", preview: "Menú del día" },
  { label: "EB Garamond", value: "EB Garamond", category: "serif", preview: "Menú del día" },
  // Sans-serif
  { label: "Lato", value: "Lato", category: "sans", preview: "Menú del día" },
  { label: "Raleway", value: "Raleway", category: "sans", preview: "Menú del día" },
  { label: "Nunito", value: "Nunito", category: "sans", preview: "Menú del día" },
  { label: "Montserrat", value: "Montserrat", category: "sans", preview: "Menú del día" },
  { label: "Poppins", value: "Poppins", category: "sans", preview: "Menú del día" },
  { label: "Inter", value: "Inter", category: "sans", preview: "Menú del día" },
  { label: "Avant Garde (Jost)", value: "Jost", category: "sans", preview: "Menú del día" },
  // Display / Script
  { label: "Zapf Chancery (Corinthia)", value: "Corinthia", category: "display", preview: "Menú del día" },
  { label: "Dancing Script", value: "Dancing Script", category: "display", preview: "Menú del día" },
  { label: "Pacifico", value: "Pacifico", category: "display", preview: "Menú del día" },
  { label: "Josefin Sans", value: "Josefin Sans", category: "display", preview: "Menú del día" },
  { label: "Cinzel", value: "Cinzel", category: "display", preview: "Menú del día" },
];

// Inject @font-face rules for custom fonts into the document
function injectCustomFontFaces() {
  if (document.getElementById("custom-font-faces")) return;
  const style = document.createElement("style");
  style.id = "custom-font-faces";
  style.textContent = CUSTOM_FONTS.map((f) =>
    `@font-face { font-family: "${f.value}"; src: url("${f.cdnUrl}") format("truetype"); font-display: swap; }`
  ).join("\n");
  document.head.appendChild(style);
}

// Get the actual CSS font-family name from a font value
export function getFontFamily(value: string): string {
  const custom = CUSTOM_FONTS.find((f) => f.value === value);
  return custom ? `"${custom.value}"` : `'${value}'`;
}

const CATEGORY_LABELS: Record<string, string> = {
  custom: "⭐ Mis fuentes",
  serif: "Serif (clásica)",
  sans: "Sans-serif (moderna)",
  display: "Decorativa",
};

type Props = {
  fonts: ThemeFonts;
  onChange: (fonts: ThemeFonts) => void;
};

function FontSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const grouped = ["custom", "serif", "sans", "display"] as const;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
      >
        {grouped.map((cat) => {
          const opts = FONT_OPTIONS.filter((f) => f.category === cat);
          return (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {opts.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      {/* Live preview */}
      <p
        className="mt-1.5 text-base text-foreground/80 truncate"
        style={{ fontFamily: getFontFamily(value) }}
      >
        Bienvenido a nuestro restaurante
      </p>
    </div>
  );
}

export default function FontManager({ fonts, onChange }: Props) {
  // Inject custom font-face rules so previews render correctly
  useEffect(() => {
    injectCustomFontFaces();
  }, []);

  const hasHeadingColor = !!fonts.headingColor;
  const hasBodyColor = !!fonts.bodyColor;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-3">
          <FontSelect
            id="font-heading"
            label="Fuente de títulos"
            value={fonts.heading}
            onChange={(v) => onChange({ ...fonts, heading: v })}
          />
          {/* Heading color with toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="font-heading-color" className={hasHeadingColor ? "" : "text-muted-foreground"}>
                Color de títulos
              </Label>
              {hasHeadingColor ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...fonts, headingColor: "" })}
                  title="Quitar color personalizado"
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange({ ...fonts, headingColor: "#1a1008" })}
                  className="text-xs text-primary underline underline-offset-2 cursor-pointer hover:opacity-70 transition-opacity"
                >
                  Personalizar
                </button>
              )}
            </div>
            <div className={`transition-opacity ${hasHeadingColor ? "opacity-100" : "opacity-0 pointer-events-none h-10"}`}>
              <ColorPickerWithPalette
                id="font-heading-color"
                value={fonts.headingColor || "#1a1008"}
                onChange={(hex) => onChange({ ...fonts, headingColor: hex })}
              />
            </div>
            {!hasHeadingColor && (
              <div className="h-10 flex items-center">
                <span className="text-xs text-muted-foreground italic">Usando color por defecto</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <FontSelect
            id="font-body"
            label="Fuente de texto"
            value={fonts.body}
            onChange={(v) => onChange({ ...fonts, body: v })}
          />
          {/* Body color with toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="font-body-color" className={hasBodyColor ? "" : "text-muted-foreground"}>
                Color de texto
              </Label>
              {hasBodyColor ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...fonts, bodyColor: "" })}
                  title="Quitar color personalizado"
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange({ ...fonts, bodyColor: "#1a1008" })}
                  className="text-xs text-primary underline underline-offset-2 cursor-pointer hover:opacity-70 transition-opacity"
                >
                  Personalizar
                </button>
              )}
            </div>
            <div className={`transition-opacity ${hasBodyColor ? "opacity-100" : "opacity-0 pointer-events-none h-10"}`}>
              <ColorPickerWithPalette
                id="font-body-color"
                value={fonts.bodyColor || "#1a1008"}
                onChange={(hex) => onChange({ ...fonts, bodyColor: hex })}
              />
            </div>
            {!hasBodyColor && (
              <div className="h-10 flex items-center">
                <span className="text-xs text-muted-foreground italic">Usando color por defecto</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Combined preview */}
      <div className="rounded-xl border border-border p-5 space-y-1 bg-background/60">
        <p
          className="text-xl font-bold text-foreground"
          style={{
            fontFamily: getFontFamily(fonts.heading),
            ...(fonts.headingColor ? { color: fonts.headingColor } : {}),
          }}
        >
          Carta del restaurante
        </p>
        <p
          className="text-sm text-muted-foreground"
          style={{
            fontFamily: getFontFamily(fonts.body),
            ...(fonts.bodyColor ? { color: fonts.bodyColor } : {}),
          }}
        >
          Descubre nuestra selección de platos elaborados con ingredientes frescos de temporada.
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer gap-1.5 text-muted-foreground"
        onClick={() => onChange(DEFAULT_FONTS)}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Restaurar fuentes originales
      </Button>
    </div>
  );
}

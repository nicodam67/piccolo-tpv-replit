import { useRef } from "react";
import { X, Plus } from "lucide-react";
import { useSavedColors } from "@/hooks/use-saved-colors.ts";

type Props = {
  id: string;
  value: string;
  onChange: (hex: string) => void;
};

/**
 * Color picker with a saved-colors palette.
 * - Clicking the native color input and confirming a new color auto-saves it.
 * - Saved swatches can be clicked to reuse or right-click/X to remove.
 */
export default function ColorPickerWithPalette({ id, value, onChange }: Props) {
  const { saved, addColor, removeColor } = useSavedColors();
  const inputRef = useRef<HTMLInputElement>(null);

  // Valid 6-digit hex to pass to <input type="color">
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    onChange(hex);
    addColor(hex);
  }

  return (
    <div className="space-y-2">
      {/* Current color + input */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            type="color"
            value={safeHex}
            onChange={handleChange}
            className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5 bg-transparent"
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{value}</span>
      </div>

      {/* Saved palette */}
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((hex) => (
            <div key={hex} className="relative group">
              <button
                type="button"
                title={hex}
                onClick={() => onChange(hex)}
                className="w-7 h-7 rounded-md border border-border/60 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                style={{ background: hex }}
              />
              {/* Remove button on hover */}
              <button
                type="button"
                title="Eliminar color"
                onClick={() => removeColor(hex)}
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 rounded-full bg-background border border-border items-center justify-center cursor-pointer shadow-sm hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {/* Hint to add more */}
          <button
            type="button"
            title="Selecciona un color para guardarlo"
            onClick={() => inputRef.current?.click()}
            className="w-7 h-7 rounded-md border border-dashed border-border/60 cursor-pointer hover:border-foreground/40 transition-colors flex items-center justify-center text-muted-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

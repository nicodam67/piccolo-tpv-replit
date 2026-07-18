import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Download, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";
import { ALLERGENS } from "@/lib/allergens.ts";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";

// Builds a human-readable category path like "Pizzas > Especiales"
function buildCategoryPath(
  catId: string,
  byId: Map<string, { name: string; parentId?: string }>,
): string {
  const parts: string[] = [];
  let current: string | undefined = catId;
  let guard = 0;
  while (current && guard < 10) {
    const cat = byId.get(current);
    if (!cat) break;
    parts.unshift(cat.name);
    current = cat.parentId;
    guard++;
  }
  return parts.join(" > ");
}

export default function MenuExport() {
  const categories = useQuery(api.menu.listCategories, {});
  const items = useQuery(api.menu.listAllItems, {});

  const allergenLabel = (id: string) => ALLERGENS.find((a) => a.id === id)?.label ?? id;
  const tagLabel = (id: string) => DIETARY_TAGS.find((tag) => tag.id === id)?.label ?? id;

  const handleExport = () => {
    if (!categories || !items) return;

    const byId = new Map(
      categories.map((c) => [c._id as string, { name: c.name, parentId: c.parentId as string | undefined }]),
    );

    const rows = [...items]
      .sort((a, b) => {
        const catA = buildCategoryPath(a.categoryId, byId);
        const catB = buildCategoryPath(b.categoryId, byId);
        if (catA !== catB) return catA.localeCompare(catB);
        return a.order - b.order;
      })
      .map((item) => ({
        Categoria: buildCategoryPath(item.categoryId, byId),
        Plato: item.name,
        Descripcion: item.description ?? "",
        "Precio (€)": item.price.toFixed(2),
        "Media racion (€)": item.halfPortionPrice != null ? item.halfPortionPrice.toFixed(2) : "",
        Cantidad: item.quantity ?? "",
        Alergenos: (item.allergens ?? []).map(allergenLabel).join(", "),
        Etiquetas: (item.tags ?? []).map(tagLabel).join(", "),
        Disponible: item.available ? "Si" : "No",
      }));

    // Semicolon delimiter works best with Excel in Spanish/European locales
    const csv = Papa.unparse(rows, { delimiter: ";", header: true, quotes: true });

    // Prepend UTF-8 BOM so Excel shows accents correctly
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `platos-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const itemCount = items?.length ?? 0;

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <FileSpreadsheet className="w-7 h-7 text-primary" />
        </div>
        <h2
          className="text-xl font-medium text-foreground mb-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Exportar platos
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
          Descarga todos los platos en un archivo CSV (compatible con Excel y Google Sheets).
          Incluye categoría, precio, media ración, cantidad, alérgenos y etiquetas. Úsalo para
          importarlos en tu sistema de food cost.
        </p>
        <Button
          onClick={handleExport}
          disabled={itemCount === 0}
          className="cursor-pointer gap-2"
        >
          <Download className="w-4 h-4" />
          Descargar CSV ({itemCount} platos)
        </Button>
      </div>
    </div>
  );
}

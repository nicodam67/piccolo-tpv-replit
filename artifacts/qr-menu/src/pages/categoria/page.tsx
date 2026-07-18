import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import MenuItemCard from "../_components/MenuItemCard.tsx";
import ItemDetailModal from "../_components/ItemDetailModal.tsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, ArrowLeft, ChevronRight } from "lucide-react";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";
import { ALLERGENS } from "@/lib/allergens.ts";
import { cn } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";
import { isSupportedLocale } from "@/i18n.ts";
import { localize, localizeCategory } from "@/lib/translations.ts";
import { useThemeColors, useThemeFonts } from "@/hooks/use-theme-colors.ts";
import { DEFAULT_CARD_SETTINGS } from "@/pages/admin/_components/CardSettingsManager.tsx";
import type { CardSettings } from "@/pages/admin/_components/CardSettingsManager.tsx";

export default function CategoriaPage() {
  const { lng, categoryId } = useParams<{ lng: string; categoryId: string }>();
  const { t } = useTranslation("common");
  const locale = isSupportedLocale(lng) ? lng : "en";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const catId = categoryId as Id<"categories">;

  const categories = useQuery(api.menu.listCategories, {});
  const items = useQuery(api.menu.listAvailableItems, { categoryId: catId });
  const branding = useQuery(api.branding.get, {});

  useThemeColors(branding?.themeColors ?? null);
  useThemeFonts(branding?.themeFonts ?? null);

  const cs = branding?.cardSettings;
  const cardSettings: CardSettings = {
    showImage: cs?.showImage ?? DEFAULT_CARD_SETTINGS.showImage,
    showDescription: cs?.showDescription ?? DEFAULT_CARD_SETTINGS.showDescription,
    showTags: cs?.showTags ?? DEFAULT_CARD_SETTINGS.showTags,
    showAllergens: cs?.showAllergens ?? DEFAULT_CARD_SETTINGS.showAllergens,
    showPrice: cs?.showPrice ?? DEFAULT_CARD_SETTINGS.showPrice,
    showHalfPortion: cs?.showHalfPortion ?? DEFAULT_CARD_SETTINGS.showHalfPortion,
    showQuantity: cs?.showQuantity ?? DEFAULT_CARD_SETTINGS.showQuantity,
    layout: (cs?.layout as CardSettings["layout"]) ?? DEFAULT_CARD_SETTINGS.layout,
  };

  const category = categories?.find((c) => c._id === catId);
  const { name: catName, description: catDescription } = category
    ? localizeCategory(category, locale)
    : { name: "", description: undefined };

  // Subcategories of the current category (only available ones)
  const subcategories = categories
    ? categories.filter((c) => c.parentId === catId && c.available !== false).sort((a, b) => a.order - b.order)
    : [];
  const hasSubcategories = subcategories.length > 0;

  const [activeTag, setActiveTag] = useState<string | null>(searchParams.get("tag"));
  const [activeAllergen, setActiveAllergen] = useState<string | null>(searchParams.get("allergen"));
  const [selectedItem, setSelectedItem] = useState<Doc<"menuItems"> | null>(null);

  const displayedItems = useMemo(() => {
    let result = [...(items ?? [])].sort((a, b) => a.order - b.order);
    if (activeTag) {
      result = result.filter((item) => item.tags?.includes(activeTag));
    }
    if (activeAllergen) {
      result = result.filter((item) => !(item.allergens ?? []).includes(activeAllergen));
    }
    return result;
  }, [items, activeTag, activeAllergen]);

  function clearFilters() {
    setActiveTag(null);
    setActiveAllergen(null);
  }

  const hasFilters = activeTag || activeAllergen;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(`/${lng}`)}
            className="shrink-0 p-1.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            {categories === undefined ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <h1
                className="text-xl font-medium text-foreground truncate"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {catName}
              </h1>
            )}
          </div>
        </div>

        {/* Dietary tags */}
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
          {DIETARY_TAGS.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveTag((prev) => prev === tag.id ? null : tag.id)}
              className={cn(
                "shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium",
                activeTag === tag.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              {tag.icon} {t(`tag.${tag.id}`)}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="shrink-0 text-xs px-3 py-1 rounded-full border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
            >
              {t("search.clear")}
            </button>
          )}
        </div>

        {/* Allergens */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none border-t border-border/40 pt-2">
          <span className="shrink-0 text-xs text-muted-foreground/60 uppercase tracking-wider self-center mr-1">
            {t("allergens.title")}:
          </span>
          {ALLERGENS.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAllergen((prev) => prev === a.id ? null : a.id)}
              className={cn(
                "shrink-0 text-xs px-3 py-1 rounded-full border transition-all cursor-pointer font-medium gap-1 flex items-center",
                activeAllergen === a.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border text-muted-foreground hover:border-amber-400/60",
              )}
            >
              <span>{a.icon}</span>
              <span>{t(`allergen.${a.id}`)}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Items or Subcategories */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {catDescription && !hasFilters && !hasSubcategories && (
          <p className="text-muted-foreground mb-6 text-sm">{catDescription}</p>
        )}

        {/* Subcategories grid */}
        {hasSubcategories ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subcategories.map((sub, i) => {
              const { name: subName, description: subDesc } = localizeCategory(sub, locale);
              return (
                <motion.button
                  key={sub._id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  onClick={() => navigate(`/${lng}/categoria/${sub._id}`)}
                  className="group text-left rounded-2xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all cursor-pointer p-6 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h2
                      className="text-xl font-medium text-foreground truncate mb-1"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {subName}
                    </h2>
                    {subDesc && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{subDesc}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </motion.button>
              );
            })}
          </div>
        ) : (
          <>
            {hasFilters && (
              <p className="text-sm text-muted-foreground mb-5">
                {displayedItems.length === 0
                  ? t("search.no_results")
                  : t("search.results", { count: displayedItems.length })}
              </p>
            )}

            {items === undefined ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-72 w-full rounded-xl" />
                ))}
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
                <Search className="w-8 h-8 opacity-30" />
                <p className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
                  {hasFilters ? t("search.no_results") : t("menu.no_items")}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-sm underline cursor-pointer hover:text-foreground">
                    {t("search.clear")}
                  </button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeTag}-${activeAllergen}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    cardSettings.layout === "grid" && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6",
                    cardSettings.layout === "list" && "flex flex-col gap-3",
                    cardSettings.layout === "compact" && "flex flex-col gap-1",
                  )}
                >
                  {displayedItems.map((item, i) => (
                    <MenuItemCard
                      key={item._id}
                      item={item}
                      index={i}
                      onClick={() => setSelectedItem(item)}
                      cardSettings={cardSettings}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </>
        )}
      </main>

      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

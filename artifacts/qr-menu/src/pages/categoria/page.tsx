import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import MenuItemCard from "../_components/MenuItemCard.tsx";
import ItemDetailModal from "../_components/ItemDetailModal.tsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";
import { ALLERGENS } from "@/lib/allergens.ts";
import { useTranslation } from "react-i18next";
import { isSupportedLocale } from "@/i18n.ts";
import { localizeCategory } from "@/lib/translations.ts";
import { useThemeColors, useThemeFonts } from "@/hooks/use-theme-colors.ts";
import { DEFAULT_CARD_SETTINGS } from "@/pages/admin/_components/CardSettingsManager.tsx";
import type { CardSettings } from "@/pages/admin/_components/CardSettingsManager.tsx";

export default function CategoriaPage() {
  const { lng, categoryId } = useParams<{ lng: string; categoryId: string }>();
  const { t }    = useTranslation("common");
  const locale   = isSupportedLocale(lng) ? lng : "en";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const catId = categoryId ?? "";

  // ── Convex data ───────────────────────────────────────────────────────────
  const categories = useQuery(api.menu.listCategories, {});
  const items      = useQuery(api.menu.getItemsByCategoryId, { catId });
  const branding   = useQuery(api.branding.get, {});

  useThemeColors(branding?.themeColors ?? null);
  useThemeFonts(branding?.themeFonts ?? null);

  // Card display settings from branding
  const cs = branding?.cardSettings;
  const cardSettings: CardSettings = {
    showImage:       cs?.showImage       ?? DEFAULT_CARD_SETTINGS.showImage,
    showDescription: cs?.showDescription ?? DEFAULT_CARD_SETTINGS.showDescription,
    showTags:        cs?.showTags        ?? DEFAULT_CARD_SETTINGS.showTags,
    showAllergens:   cs?.showAllergens   ?? DEFAULT_CARD_SETTINGS.showAllergens,
    showPrice:       cs?.showPrice       ?? DEFAULT_CARD_SETTINGS.showPrice,
    showHalfPortion: cs?.showHalfPortion ?? DEFAULT_CARD_SETTINGS.showHalfPortion,
    showQuantity:    cs?.showQuantity    ?? DEFAULT_CARD_SETTINGS.showQuantity,
    layout: (cs?.layout as CardSettings["layout"]) ?? DEFAULT_CARD_SETTINGS.layout,
  };

  // Current category + subcategories
  const category = categories?.find(c => c._id === catId);
  const { name: catName, description: catDescription } = category
    ? localizeCategory(category, locale)
    : { name: "", description: undefined };

  const subcategories = categories
    ? categories.filter(c => c.parentId === catId && c.available !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const hasSubcategories = subcategories.length > 0;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [activeTag,      setActiveTag     ] = useState<string | null>(searchParams.get("tag"));
  const [activeAllergen, setActiveAllergen] = useState<string | null>(searchParams.get("allergen"));
  const [selectedItem,   setSelectedItem  ] = useState<Doc<"menuItems"> | null>(null);

  const displayedItems = useMemo(() => {
    let result = [...(items ?? [])].sort((a, b) => a.order - b.order);
    if (activeTag)      result = result.filter(i => i.tags?.includes(activeTag));
    if (activeAllergen) result = result.filter(i => !(i.allergens ?? []).includes(activeAllergen));
    return result;
  }, [items, activeTag, activeAllergen]);

  const hasFilters = !!(activeTag || activeAllergen);

  // ── Colors ────────────────────────────────────────────────────────────────
  const catCardBg        = branding?.themeColors?.categoryCardBg   ?? "#ffffff";
  const catCardText      = branding?.themeColors?.categoryCardText ?? branding?.themeColors?.primary ?? "#c41a1a";
  const cardChevronColor = branding?.themeFonts?.headingColor ?? catCardText;

  // ── Pill helpers ──────────────────────────────────────────────────────────
  const pillBase: React.CSSProperties = {
    flexShrink: 0, fontSize: "12px", padding: "5px 12px",
    borderRadius: "9999px", border: "1.5px solid #d1d5db",
    cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
    background: "#ffffff", color: "#374151", lineHeight: 1.4,
    fontFamily: "inherit",
  };
  const pillOn: React.CSSProperties = {
    ...pillBase, background: "#1f2937", borderColor: "#1f2937", color: "#ffffff",
  };
  const aPillBase: React.CSSProperties = {
    ...pillBase, fontSize: "11px", padding: "4px 10px",
    display: "flex", alignItems: "center", gap: "4px",
  };
  const aPillOn: React.CSSProperties = {
    ...aPillBase, background: "#fef3c7", borderColor: "#d97706", color: "#92400e",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: branding?.themeColors?.background ?? "#ffffff" }}>

      {/* ── STICKY HEADER (back + title + filters) ───────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {/* Back button + category name */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px 8px" }}>
          <button
            onClick={() => navigate(`/${lng}`)}
            aria-label={t("nav.back")}
            style={{
              flexShrink: 0, padding: "6px", borderRadius: "9999px",
              border: "none", background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#6b7280",
            }}
          >
            <ArrowLeft style={{ width: "20px", height: "20px" }} />
          </button>
          <h1 style={{
            flex: 1, minWidth: 0,
            fontSize: "1.25rem", fontWeight: 600,
            fontFamily: "var(--font-serif, serif)",
            color: catCardText,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {catName}
          </h1>
        </div>

        {/* Dietary tag pills */}
        <div style={{ display: "flex", gap: "8px", padding: "0 16px 8px", overflowX: "auto", scrollbarWidth: "none" }}>
          {DIETARY_TAGS.map(tag => (
            <button key={tag.id}
              onClick={() => setActiveTag(p => p === tag.id ? null : tag.id)}
              style={activeTag === tag.id ? pillOn : pillBase}>
              {tag.icon} {t(`tag.${tag.id}`)}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={() => { setActiveTag(null); setActiveAllergen(null); }}
              style={{ ...pillBase, borderColor: "#fca5a5", color: "#dc2626" }}>
              {t("search.clear")}
            </button>
          )}
        </div>

        {/* Allergen pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 16px 10px", overflowX: "auto", scrollbarWidth: "none" }}>
          <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: "bold", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "4px" }}>
            {t("allergens.title")}:
          </span>
          {ALLERGENS.map(a => (
            <button key={a.id}
              onClick={() => setActiveAllergen(p => p === a.id ? null : a.id)}
              style={activeAllergen === a.id ? aPillOn : aPillBase}>
              <span>{a.icon}</span><span>{t(`allergen.${a.id}`)}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── CONTENT ──────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "24px 12px" }}>
        {catDescription && !hasFilters && !hasSubcategories && (
          <p style={{ color: "#6b7280", marginBottom: "24px", fontSize: "0.875rem" }}>{catDescription}</p>
        )}

        {/* ── Subcategories ────────────────────────────────────────────── */}
        {hasSubcategories ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {subcategories.map((sub, i) => {
              const { name: subName, description: subDesc } = localizeCategory(sub, locale);
              return (
                <motion.button
                  key={sub._id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  onClick={() => navigate(`/${lng}/categoria/${sub._id}`)}
                  style={{
                    width: "100%", textAlign: "left",
                    border: "none", outline: "none",
                    borderRadius: "16px",
                    background: catCardBg,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: "12px",
                    padding: "20px 24px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span data-heading="" style={{
                      display: "block",
                      fontSize: "1.2rem", fontWeight: "bold",
                      fontFamily: "var(--font-serif, serif)",
                      color: catCardText, letterSpacing: "0.05em",
                    }}>
                      {subName}
                    </span>
                    {subDesc && (
                      <span style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginTop: "2px" }}>
                        {subDesc}
                      </span>
                    )}
                  </div>
                  <ChevronRight style={{ color: cardChevronColor, width: "20px", height: "20px", flexShrink: 0 }} />
                </motion.button>
              );
            })}
          </div>

        /* ── Items ────────────────────────────────────────────────────── */
        ) : items === undefined ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ height: "120px", borderRadius: "16px", background: "#e5e7eb", opacity: 0.6 }} />
            ))}
          </div>
        ) : displayedItems.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6rem 0", color: "#9ca3af", gap: "12px" }}>
            <Search style={{ width: "32px", height: "32px", opacity: 0.3 }} />
            <p style={{ fontSize: "1.125rem", fontFamily: "var(--font-serif, serif)" }}>
              {hasFilters ? t("search.no_results") : t("menu.no_items")}
            </p>
            {hasFilters && (
              <button onClick={() => { setActiveTag(null); setActiveAllergen(null); }}
                style={{ fontSize: "0.875rem", textDecoration: "underline", cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }}>
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
              style={
                cardSettings.layout === "grid"
                  ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }
                  : cardSettings.layout === "compact"
                  ? { display: "flex", flexDirection: "column", gap: "4px" }
                  : { display: "flex", flexDirection: "column", gap: "12px" }
              }
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
      </main>

      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

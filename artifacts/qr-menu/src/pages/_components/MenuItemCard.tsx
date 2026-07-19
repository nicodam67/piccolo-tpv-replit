import { motion } from "motion/react";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { getTagMeta } from "@/lib/dietary-tags.ts";
import { getAllergenMeta } from "@/lib/allergens.ts";
import { cn } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isSupportedLocale } from "@/i18n.ts";
import { localize } from "@/lib/translations.ts";
import type { CardSettings } from "@/pages/admin/_components/CardSettingsManager.tsx";
import { DEFAULT_CARD_SETTINGS } from "@/pages/admin/_components/CardSettingsManager.tsx";

type Props = {
  item: Doc<"menuItems">;
  index: number;
  onClick: () => void;
  cardSettings?: CardSettings;
};

export default function MenuItemCard({ item, index, onClick, cardSettings = DEFAULT_CARD_SETTINGS }: Props) {
  const { t } = useTranslation("common");
  const { lng } = useParams<{ lng: string }>();
  const locale = isSupportedLocale(lng) ? lng : "es";
  const { name, description } = localize(item, locale);

  const hasMedia = !!(item.videoUrl || item.imageUrl);

  // ── List layout (default — matches Hércules compact style) ────────────────
  if (cardSettings.layout === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: index * 0.04 }}
        onClick={onClick}
        className="group flex gap-3 p-3 rounded-xl border border-border/60 bg-card hover:shadow-md transition-shadow cursor-pointer items-start"
      >
        {/* Text side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
              {name}
            </h3>
            {cardSettings.showPrice && (
              <div className="shrink-0 text-right ml-2 flex flex-col items-end">
                <span data-item-price className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--primary, #c41a1a)" }}>
                  {item.halfPortionPrice !== undefined ? `${t("menu.full_price")} ` : ""}€{item.price.toFixed(2)}
                </span>
                {cardSettings.showHalfPortion && item.halfPortionPrice !== undefined && (
                  <span data-item-price className="text-xs whitespace-nowrap" style={{ color: "var(--primary, #c41a1a)" }}>
                    {t("menu.half_portion")} €{item.halfPortionPrice.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
          {cardSettings.showQuantity && item.quantity && (
            <span className="text-xs text-muted-foreground/60">{item.quantity}</span>
          )}
          {cardSettings.showDescription && description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {cardSettings.showTags && item.tags?.map((tagId) => {
              const meta = getTagMeta(tagId);
              if (!meta) return null;
              return <span key={tagId} className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", meta.color)}>{meta.icon} {t(`tag.${tagId}`)}</span>;
            })}
            {cardSettings.showAllergens && item.allergens?.map((id) => {
              const meta = getAllergenMeta(id);
              if (!meta) return null;
              return <span key={id} className="text-xs px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300">{meta.icon}</span>;
            })}
          </div>
          <p data-tap-details className="text-xs opacity-40 group-hover:opacity-70 transition-opacity mt-1" style={{ color: "var(--primary)" }}>
            {t("menu.tap_details")}
          </p>
        </div>

        {/* Image thumbnail — right side, compact square */}
        {cardSettings.showImage && hasMedia && (
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0">
            {item.videoUrl ? (
              <video src={item.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
            ) : (
              <img
                src={item.imageUrl}
                alt={name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Compact layout: single line, no image ─────────────────────────────────
  if (cardSettings.layout === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.03 }}
        onClick={onClick}
        className="group flex items-baseline justify-between gap-3 py-3 px-4 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-serif)" }}>{name}</span>
          {cardSettings.showQuantity && item.quantity && (
            <span className="text-xs text-muted-foreground/60 ml-2">{item.quantity}</span>
          )}
          {cardSettings.showTags && item.tags && item.tags.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {item.tags.map((t_) => getTagMeta(t_)?.icon).filter(Boolean).join(" ")}
            </span>
          )}
          <span data-tap-details className="block text-xs opacity-40 group-hover:opacity-70 transition-opacity mt-0.5" style={{ color: "var(--primary)" }}>
            {t("menu.tap_details")}
          </span>
        </div>
        {cardSettings.showPrice && (
          <div className="shrink-0 text-right">
            <span data-item-price className="text-sm font-semibold">€{item.price.toFixed(2)}</span>
            {cardSettings.showHalfPortion && item.halfPortionPrice !== undefined && (
              <span data-item-price className="text-xs ml-2">/ €{item.halfPortionPrice.toFixed(2)}</span>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Grid layout ───────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      onClick={onClick}
      className="group rounded-xl overflow-hidden border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Media */}
      {cardSettings.showImage && (
        <div className="relative h-40 overflow-hidden bg-muted">
          {item.videoUrl ? (
            <video src={item.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          ) : item.imageUrl ? (
            <img src={item.imageUrl} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-4xl">🍽</div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-base font-medium leading-tight text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {name}
          </h3>
          {cardSettings.showPrice && (
            <div className="shrink-0 text-right">
              <span data-item-price className="text-sm font-semibold block" style={{ color: "var(--primary)" }}>
                {item.halfPortionPrice !== undefined ? `${t("menu.full_price")} ` : ""}€{item.price.toFixed(2)}
              </span>
              {cardSettings.showHalfPortion && item.halfPortionPrice !== undefined && (
                <span data-item-price className="text-xs" style={{ color: "var(--primary)" }}>
                  {t("menu.half_portion")} €{item.halfPortionPrice.toFixed(2)}
                </span>
              )}
              {cardSettings.showQuantity && item.quantity && (
                <span className="text-xs text-muted-foreground/70 block mt-0.5">{item.quantity}</span>
              )}
            </div>
          )}
        </div>
        {cardSettings.showDescription && description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">{description}</p>
        )}
        {cardSettings.showTags && item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tagId) => {
              const meta = getTagMeta(tagId);
              if (!meta) return null;
              return <span key={tagId} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", meta.color)}>{meta.icon} {t(`tag.${tagId}`)}</span>;
            })}
          </div>
        )}
        {cardSettings.showAllergens && item.allergens && item.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.allergens.map((id) => {
              const meta = getAllergenMeta(id);
              if (!meta) return null;
              return (
                <span key={id} title={t(`allergen.${id}`)} className="text-xs px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300">
                  {meta.icon} {t(`allergen.${id}`)}
                </span>
              );
            })}
          </div>
        )}
        <p data-tap-details className="text-xs opacity-50 mt-3 group-hover:opacity-100 transition-opacity" style={{ color: "var(--primary)" }}>
          {t("menu.tap_details")}
        </p>
      </div>
    </motion.div>
  );
}

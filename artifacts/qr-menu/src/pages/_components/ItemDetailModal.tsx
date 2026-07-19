import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { getTagMeta } from "@/lib/dietary-tags.ts";
import { getAllergenMeta } from "@/lib/allergens.ts";
import { cn } from "@/lib/utils.ts";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { isSupportedLocale } from "@/i18n.ts";
import { localize } from "@/lib/translations.ts";

type Props = {
  item: Doc<"menuItems"> | null;
  onClose: () => void;
};

export default function ItemDetailModal({ item, onClose }: Props) {
  const { t } = useTranslation("common");
  const { lng } = useParams<{ lng: string }>();
  const locale = isSupportedLocale(lng) ? lng : "en";

  const localized = item ? localize(item, locale) : null;
  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [item, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (item) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [item]);

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={localized?.name ?? item.name}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
            className="fixed inset-x-4 bottom-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 z-50 w-full md:w-[640px] max-h-[92vh] md:max-h-[80vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              aria-label={t("modal.close")}
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors cursor-pointer backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Media: video or image */}
            <div className="relative shrink-0 h-64 md:h-80 bg-muted overflow-hidden">
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                />
              ) : item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={localized?.name ?? item.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-muted-foreground">
                  🍽
                </div>
              )}
              {/* Gradient overlay for readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-6 py-6">
              {/* Price pill */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2
                  className="text-2xl md:text-3xl font-light leading-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {localized?.name ?? item.name}
                </h2>
                <div className="shrink-0 text-right mt-0.5">
                  <span
                    data-item-price
                    className="text-xl font-semibold block"
                    style={{ color: "var(--primary)" }}
                  >
                    {item.halfPortionPrice !== undefined ? `${t("menu.full_price")} ` : ""}€{item.price.toFixed(2)}
                  </span>
                  {item.halfPortionPrice !== undefined && (
                    <span
                      data-item-price
                      className="text-sm font-medium"
                      style={{ color: "var(--primary)" }}
                    >
                      {t("menu.half_portion")} €{item.halfPortionPrice.toFixed(2)}
                    </span>
                  )}
                  {item.quantity && (
                    <span className="text-sm text-muted-foreground/70 block mt-0.5">{item.quantity}</span>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px w-12 mb-4" style={{ background: "var(--accent)" }} />

              {/* Description */}
              {localized?.description && (
                <p className="text-muted-foreground leading-relaxed mb-5">
                  {localized.description}
                </p>
              )}

              {/* Dietary tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {item.tags.map((tagId) => {
                    const meta = getTagMeta(tagId);
                    if (!meta) return null;
                    return (
                      <span
                        key={tagId}
                        className={cn("text-sm px-3 py-1 rounded-full font-medium", meta.color)}
                      >
                        {meta.icon} {t(`tag.${tagId}`)}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Allergens */}
              {item.allergens && item.allergens.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">
                    {t("allergens.title")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.allergens.map((id) => {
                      const meta = getAllergenMeta(id);
                      if (!meta) return null;
                      return (
                        <span
                          key={id}
                          className="text-sm px-2.5 py-1 rounded border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 flex items-center gap-1.5"
                        >
                          <span>{meta.icon}</span>
                          {t(`allergen.${id}`)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

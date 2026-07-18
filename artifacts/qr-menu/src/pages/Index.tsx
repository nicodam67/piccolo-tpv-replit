import InstallBanner from "@/components/InstallBanner.tsx";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import ItemDetailModal from "./_components/ItemDetailModal.tsx";
import { useNavigate, useParams } from "react-router-dom";
import { Phone, Clock, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { ALLERGENS } from "@/lib/allergens.ts";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";
import { cn } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";
import LocaleSwitcher from "@/components/ui/locale-switcher.tsx";
import { isSupportedLocale } from "@/i18n.ts";
import { localize, localizeCategory } from "@/lib/translations.ts";
import ScheduleDisplay from "./_components/ScheduleDisplay.tsx";
import { useThemeColors, useThemeFonts } from "@/hooks/use-theme-colors.ts";

export default function Index() {
  const { lng } = useParams<{ lng: string }>();
  const { t } = useTranslation("common");
  const locale = isSupportedLocale(lng) ? lng : "en";
  const navigate = useNavigate();

  const categories = useQuery(api.menu.listCategories, {});
  const branding = useQuery(api.branding.get, {});
  const allItems = useQuery(api.menu.listAvailableItems, {});
  const seed = useMutation(api.seed.publicSeedIfEmpty);

  useThemeColors(branding?.themeColors ? {
    primary: branding.themeColors.primary,
    background: branding.themeColors.background,
    accent: branding.themeColors.accent,
    heroTitleColor: branding.themeColors.heroTitleColor,
    heroTaglineColor: branding.themeColors.heroTaglineColor,
    heroEstablishedColor: branding.themeColors.heroEstablishedColor,
    callButtonBg: branding.themeColors.callButtonBg,
    callButtonText: branding.themeColors.callButtonText,
    scheduleButtonBg: branding.themeColors.scheduleButtonBg,
    scheduleButtonText: branding.themeColors.scheduleButtonText,
    tapDetailsColor: branding.themeColors.tapDetailsColor,
  } : null);
  useThemeFonts(branding?.themeFonts ?? null);

  const restaurantName = branding?.restaurantName ?? "";
  const tagline = branding?.tagline ?? "";
  const heroImageUrl = branding?.heroImageUrl ?? "https://images.unsplash.com/photo-1761515397055-1bba63a150d3?w=1400&q=80";
  const heroVideoUrl = branding?.heroVideoUrl ?? null;
  const establishedYear = branding?.establishedYear ?? "";

  const [activeAllergen, setActiveAllergen] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Doc<"menuItems"> | null>(null);

  useEffect(() => {
    seed({ secret: "init" }).catch(() => {});
  }, [seed]);

  // Only top-level categories (no parentId) that are available
  const sortedCategories = categories
    ? [...categories].filter((c) => !c.parentId && c.available !== false).sort((a, b) => a.order - b.order)
    : [];

  // Count items per category (filtered), including subcategory items
  function countForCategory(catId: string) {
    if (!allItems) return null;
    let items = allItems.filter((i) => i.categoryId === catId);
    if (activeAllergen) {
      items = items.filter((i) => !(i.allergens ?? []).includes(activeAllergen));
    }
    if (activeTag) {
      items = items.filter((i) => i.tags?.includes(activeTag));
    }
    return items.length;
  }

  function goToCategory(catId: string) {
    const params = new URLSearchParams();
    if (activeAllergen) params.set("allergen", activeAllergen);
    if (activeTag) params.set("tag", activeTag);
    const qs = params.toString();
    navigate(`/${lng}/categoria/${catId}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Hero */}
      <header className="relative overflow-hidden">
        {heroVideoUrl ? (
          <video
            src={heroVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "brightness(0.35)" }}
            autoPlay loop muted playsInline
          />
        ) : (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageUrl})`, filter: "brightness(0.35)" }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <LocaleSwitcher />
          </div>
          {establishedYear && (
            <motion.p
              data-hero-established
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-sm tracking-[0.25em] uppercase mb-3"
              style={{ fontFamily: "var(--font-sans)", color: branding?.themeColors?.heroEstablishedColor ?? "var(--accent)" }}
            >
              {t("established")} {establishedYear}
            </motion.p>
          )}
          <motion.h1
            data-hero-title
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: branding !== undefined ? 1 : 0, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-light text-balance mb-4"
            style={{ fontFamily: "var(--font-display)", color: branding?.themeColors?.heroTitleColor ?? "#ffffff" }}
          >
            {restaurantName}
          </motion.h1>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="h-px w-24 mx-auto mb-4"
            style={{ background: "var(--accent)" }}
          />
          {tagline && (
            <motion.p
              data-hero-tagline
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="text-lg max-w-md"
              style={{ fontFamily: "var(--font-script)", fontWeight: 400, color: branding?.themeColors?.heroTaglineColor ?? "rgba(255,255,255,0.7)" }}
            >
              {tagline}
            </motion.p>
          )}
        </div>
      </header>

      {/* Filters bar */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        {/* Dietary tag filters */}
        <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto scrollbar-none">
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
          {(activeTag || activeAllergen) && (
            <button
              onClick={() => { setActiveTag(null); setActiveAllergen(null); }}
              className="shrink-0 text-xs px-3 py-1 rounded-full border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
            >
              {t("search.clear")}
            </button>
          )}
        </div>
        {/* Allergen filters */}
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
      </div>

      {/* Categories grid */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        {categories === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
          </div>
        ) : sortedCategories.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>{t("menu.no_items")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sortedCategories.map((cat, i) => {
              const { name, description } = localizeCategory(cat, locale);
              const count = countForCategory(cat._id);
              return (
                <motion.button
                  key={cat._id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  onClick={() => goToCategory(cat._id)}
                  className="group text-left rounded-2xl border border-border/60 shadow-sm hover:shadow-md transition-all cursor-pointer p-6 flex items-center justify-between gap-4"
                  style={{ background: branding?.themeColors?.categoryCardBg ?? "var(--card)" }}
                >
                  <div className="flex-1 min-w-0">
                    <h2
                      className="text-xl font-medium truncate mb-1"
                      style={{ fontFamily: "var(--font-serif)", color: branding?.themeColors?.categoryCardText ?? "var(--foreground)" }}
                    >
                      {name}
                    </h2>
                    {description && (
                      <p className="text-sm line-clamp-2" style={{ color: branding?.themeColors?.categoryCardText ? branding.themeColors.categoryCardText + "99" : "var(--muted-foreground)" }}>{description}</p>
                    )}

                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0 transition-colors" style={{ color: branding?.themeColors?.categoryCardText ? branding.themeColors.categoryCardText + "55" : "var(--muted-foreground)" }} />
                </motion.button>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10 text-center text-sm">
        <p style={{ fontFamily: "var(--font-serif)", fontSize: "1rem", color: branding?.themeColors?.infoTextColor ?? "var(--foreground)", opacity: 0.6 }} className="mb-1">
          {branding !== undefined ? restaurantName : ""}
        </p>
        {(branding?.address || branding?.city) && (
          <div className="mb-2 space-y-0.5" style={{ color: branding?.themeColors?.infoTextColor ?? "var(--muted-foreground)" }}>
            {branding?.address && <p>{branding.address}</p>}
            {(branding?.postalCode || branding?.city) && (
              <p>{[branding?.postalCode, branding?.city].filter(Boolean).join(" ")}</p>
            )}
            {(branding?.province || branding?.country) && (
              <p>{[branding?.province, branding?.country].filter(Boolean).join(" · ")}</p>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [branding?.address, branding?.postalCode, branding?.city, branding?.province, branding?.country]
                  .filter(Boolean)
                  .join(", ")
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors hover:opacity-80"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.003 3.5-4.697 3.5-8.057a8 8 0 10-16 0c0 3.36 1.556 6.054 3.5 8.057a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.25a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5z" clipRule="evenodd" />
              </svg>
              Ver en Google Maps
            </a>
          </div>
        )}
        {branding?.phone && (
          <p className="mb-2" style={{ color: branding?.themeColors?.infoTextColor ?? "var(--muted-foreground)" }}>
            <a href={`tel:${branding.phone}`} className="hover:opacity-70 transition-opacity">{branding.phone}</a>
          </p>
        )}
        <p className="mt-2" style={{ color: branding?.themeColors?.infoTextColor ?? "var(--muted-foreground)" }}>&copy; {new Date().getFullYear()} {restaurantName}. {t("footer.rights")}</p>
      </footer>

      {/* Floating schedule button */}
      {(branding?.schedule && branding.schedule.length > 0) && (
        <button
          data-schedule-btn
          onClick={() => setScheduleOpen(true)}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-medium cursor-pointer transition-transform hover:scale-105 active:scale-95"
          style={{
            background: branding?.themeColors?.scheduleButtonBg ?? "var(--secondary)",
            color: branding?.themeColors?.scheduleButtonText ?? "var(--secondary-foreground)",
            border: "1px solid var(--border)",
          }}
        >
          <Clock className="w-4 h-4" />
          <span>{t("schedule.title")}</span>
        </button>
      )}

      {/* Schedule modal */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)" }}>{t("schedule.title")}</DialogTitle>
          </DialogHeader>
          {branding?.schedule && <ScheduleDisplay schedule={branding.schedule} />}
        </DialogContent>
      </Dialog>

      {/* Floating call button */}
      {branding?.phone && (
        <a
          data-call-btn
          href={`tel:${branding.phone}`}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-medium cursor-pointer transition-transform hover:scale-105 active:scale-95"
          style={{
            background: branding?.themeColors?.callButtonBg ?? "var(--primary)",
            color: branding?.themeColors?.callButtonText ?? "var(--primary-foreground)",
          }}
        >
          <Phone className="w-4 h-4" />
          <span>{t("call")}</span>
        </a>
      )}

      <InstallBanner />

      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChevronRight, Clock, Phone } from "lucide-react";
import { ALLERGENS } from "@/lib/allergens.ts";
import { DIETARY_TAGS } from "@/lib/dietary-tags.ts";
import { useTranslation } from "react-i18next";
import { isSupportedLocale } from "@/i18n.ts";
import { localizeCategory } from "@/lib/translations.ts";
import { useThemeColors, useThemeFonts } from "@/hooks/use-theme-colors.ts";
import { useNavigate, useParams } from "react-router-dom";
import LocaleSwitcher from "@/components/ui/locale-switcher.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import ScheduleDisplay from "./_components/ScheduleDisplay.tsx";
import InstallBanner from "@/components/InstallBanner.tsx";

export default function Index() {
  const { lng } = useParams<{ lng: string }>();
  const { t } = useTranslation("common");
  const locale = isSupportedLocale(lng) ? lng : "es";
  const navigate = useNavigate();

  // ── Convex data ───────────────────────────────────────────────────────────
  const categories = useQuery(api.menu.listCategories, {});
  const branding   = useQuery(api.branding.get, {});
  const seed       = useMutation(api.seed.publicSeedIfEmpty);

  // Apply branding theme (fonts + colors) from Convex
  useThemeColors(branding?.themeColors ? { ...branding.themeColors } : null);
  useThemeFonts(branding?.themeFonts ?? null);

  // Seed demo data only when the DB is empty
  useEffect(() => { seed({ secret: "init" }).catch(() => {}); }, [seed]);

  // ── Derived branding values (with safe fallbacks) ─────────────────────────
  const restaurantName  = branding?.restaurantName  ?? "Piccolo La Ràpita";
  const tagline         = branding?.tagline         ?? "";
  const heroImageUrl    = branding?.heroImageUrl    ?? "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=80";
  const heroVideoUrl    = branding?.heroVideoUrl    ?? null;
  const establishedYear = branding?.establishedYear ?? "2007";

  const accentColor      = branding?.themeColors?.accent              ?? "#c9a84c";
  const heroTitleColor   = branding?.themeColors?.heroTitleColor      ?? "#ffffff";
  const heroTaglineColor = branding?.themeColors?.heroTaglineColor    ?? "rgba(255,255,255,0.85)";
  const heroEstColor     = branding?.themeColors?.heroEstablishedColor ?? accentColor;
  const catCardBg        = branding?.themeColors?.categoryCardBg      ?? "#ffffff";
  const catCardText      = branding?.themeColors?.categoryCardText    ?? branding?.themeColors?.primary ?? "#c41a1a";
  // Chevrons use heading color (matches font heading color set in applyThemeFonts)
  const cardChevronColor = branding?.themeFonts?.headingColor ?? catCardText;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [activeAllergen, setActiveAllergen] = useState<string | null>(null);
  const [activeTag,      setActiveTag     ] = useState<string | null>(null);
  const [scheduleOpen,   setScheduleOpen  ] = useState(false);

  // ── Category list: top-level only, sorted ────────────────────────────────
  const allTopLevel = categories
    ? categories.filter(c => !c.parentId && c.available !== false)
    : [];
  const sortedCategories = categories
    ? (allTopLevel.length > 0 ? allTopLevel : categories.filter(c => c.available !== false))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  function goToCategory(catId: string) {
    const params = new URLSearchParams();
    if (activeAllergen) params.set("allergen", activeAllergen);
    if (activeTag)      params.set("tag",      activeTag);
    const qs = params.toString();
    navigate(`/${locale}/categoria/${catId}${qs ? `?${qs}` : ""}`);
  }

  // ── Shared pill style helpers ─────────────────────────────────────────────
  const pillBase: React.CSSProperties = {
    flexShrink: 0, fontSize: "13px", padding: "6px 14px",
    borderRadius: "9999px", border: "1.5px solid #d1d5db",
    cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap",
    background: "#ffffff", color: "#374151", lineHeight: 1.4,
    fontFamily: "inherit",
  };
  const pillOn: React.CSSProperties = {
    ...pillBase, background: "#1f2937", borderColor: "#1f2937", color: "#ffffff",
  };
  const aPillBase: React.CSSProperties = {
    ...pillBase, fontSize: "12px", padding: "4px 10px",
    display: "flex", alignItems: "center", gap: "4px",
  };
  const aPillOn: React.CSSProperties = {
    ...aPillBase, background: "#fef3c7", borderColor: "#d97706", color: "#92400e",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: branding?.themeColors?.background ?? "#ffffff" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header style={{ position: "relative", minHeight: "50vmax", background: "#1a0a08", overflow: "hidden" }}>

        {/* Background media */}
        {heroVideoUrl ? (
          <video
            src={heroVideoUrl}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.38)" }}
            autoPlay loop muted playsInline
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url("${heroImageUrl}"), url("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=80")`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "brightness(0.38)",
          }} />
        )}

        {/* Language switcher — absolute top-right */}
        <div style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 10 }}>
          <LocaleSwitcher />
        </div>

        {/* Centered hero text */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center",
          minHeight: "50vmax",
          padding: "2rem 1.5rem",
        }}>
          {establishedYear && (
            <motion.p
              data-hero-established
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              style={{
                color: heroEstColor, fontStyle: "italic",
                letterSpacing: "0.3em", fontSize: "0.875rem",
                marginBottom: "1rem", textTransform: "uppercase",
              }}
            >
              {t("established")} {establishedYear}
            </motion.p>
          )}

          <motion.h1
            data-hero-title
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
            style={{
              color: heroTitleColor,
              fontSize: "clamp(2.8rem, 13vw, 6rem)",
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              fontFamily: "var(--font-serif, serif)",
              fontWeight: "bold",
              marginBottom: "1.25rem",
              maxWidth: "90vw",
            }}
          >
            {restaurantName}
          </motion.h1>

          {/* Accent separator */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            style={{ width: "7rem", height: "1px", background: accentColor, marginBottom: "1.25rem" }}
          />

          {tagline && (
            <motion.p
              data-hero-tagline
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              style={{ color: heroTaglineColor, fontStyle: "italic", fontSize: "1.125rem" }}
            >
              {tagline}
            </motion.p>
          )}
        </div>
      </header>

      {/* ── FILTER BAR ───────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {/* Dietary tag pills */}
        <div style={{ display: "flex", gap: "8px", padding: "10px 16px 8px", overflowX: "auto", scrollbarWidth: "none" }}>
          {DIETARY_TAGS.map(tag => (
            <button key={tag.id} onClick={() => setActiveTag(p => p === tag.id ? null : tag.id)}
              style={activeTag === tag.id ? pillOn : pillBase}>
              {tag.icon} {t(`tag.${tag.id}`)}
            </button>
          ))}
          {(activeTag || activeAllergen) && (
            <button onClick={() => { setActiveTag(null); setActiveAllergen(null); }}
              style={{ ...pillBase, borderColor: "#fca5a5", color: "#dc2626" }}>
              {t("search.clear")}
            </button>
          )}
        </div>

        {/* Allergen pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 16px 10px", overflowX: "auto", scrollbarWidth: "none" }}>
          <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: "bold", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: "4px" }}>
            {t("allergens.title")}:
          </span>
          {ALLERGENS.map(a => (
            <button key={a.id} onClick={() => setActiveAllergen(p => p === a.id ? null : a.id)}
              style={activeAllergen === a.id ? aPillOn : aPillBase}>
              <span>{a.icon}</span><span>{t(`allergen.${a.id}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CATEGORY GRID ────────────────────────────────────────────────── */}
      {/* Extra bottom padding avoids floating buttons overlapping last category row */}
      <main style={{ padding: "16px 12px 120px", maxWidth: "800px", margin: "0 auto" }}>
        {categories === undefined ? (
          /* Loading skeletons — 2-col grid */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ height: "68px", borderRadius: "16px", background: "#e5e7eb", opacity: 0.6 }} />
            ))}
          </div>
        ) : sortedCategories.length === 0 ? (
          <div style={{ textAlign: "center", padding: "6rem 0", color: "#9ca3af" }}>
            <p style={{ fontSize: "1.125rem" }}>{t("menu.no_items")}</p>
          </div>
        ) : (
          /* 2-column grid matching Hércules layout */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
            {sortedCategories.map((cat, i) => {
              const { name } = localizeCategory(cat, locale);
              return (
                <motion.button
                  key={cat._id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                  onClick={() => goToCategory(cat._id)}
                  style={{
                    width: "100%", textAlign: "left",
                    border: "1px solid #e5e7eb", outline: "none",
                    borderRadius: "16px",
                    background: catCardBg,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: "8px",
                    padding: "18px 16px",
                    transition: "box-shadow 0.15s, transform 0.1s",
                    minHeight: "68px",
                  }}
                >
                  <span data-heading="" style={{
                    fontSize: "clamp(0.85rem, 2.8vw, 1.1rem)",
                    fontWeight: "bold",
                    fontFamily: "var(--font-serif, serif)",
                    color: catCardText,
                    letterSpacing: "0.04em",
                    lineHeight: 1.25,
                    textTransform: "uppercase",
                    wordBreak: "break-word",
                    hyphens: "auto",
                  }}>
                    {name}
                  </span>
                  <ChevronRight style={{ color: cardChevronColor, width: "18px", height: "18px", flexShrink: 0 }} />
                </motion.button>
              );
            })}
          </div>
        )}
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{
        background: "#ffffff", borderTop: "1px solid #e5e7eb",
        marginTop: "24px", padding: "32px 16px", textAlign: "center",
      }}>
        {branding && (
          <>
            <p style={{ fontFamily: "var(--font-serif, serif)", fontWeight: 600, marginBottom: "4px", color: "#374151" }}>
              {restaurantName}
            </p>
            {(branding.address || branding.city) && (
              <div style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "8px", lineHeight: 1.6 }}>
                {branding.address && <p>{branding.address}</p>}
                {(branding.postalCode || branding.city) && (
                  <p>{[branding.postalCode, branding.city].filter(Boolean).join(" ")}</p>
                )}
                {(branding.province || branding.country) && (
                  <p>{[branding.province, branding.country].filter(Boolean).join(" · ")}</p>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [branding.address, branding.postalCode, branding.city, branding.province, branding.country]
                      .filter(Boolean).join(", ")
                  )}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "inline-block", marginTop: "8px",
                    padding: "4px 12px", borderRadius: "9999px",
                    fontSize: "11px", fontWeight: 500,
                    background: "#f3f4f6", color: "#6b7280",
                    textDecoration: "none",
                  }}
                >
                  📍 {t("footer.maps")}
                </a>
              </div>
            )}
            {branding.phone && (
              <p style={{ marginBottom: "8px" }}>
                <a href={`tel:${branding.phone}`} style={{ color: "#6b7280", textDecoration: "none" }}>
                  {branding.phone}
                </a>
              </p>
            )}
          </>
        )}
        <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "#9ca3af" }}>
          &copy; {new Date().getFullYear()} {restaurantName}. {t("footer.rights")}
        </p>
      </footer>

      {/* ── FLOATING BUTTONS ─────────────────────────────────────────────── */}
      {/* Schedule button: always visible when branding is loaded */}
      {branding !== undefined && (
        <button
          data-schedule-btn
          onClick={() => setScheduleOpen(true)}
          style={{
            position: "fixed", bottom: "24px", left: "16px", zIndex: 50,
            display: "flex", alignItems: "center", gap: "8px",
            padding: "12px 16px", borderRadius: "9999px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            fontSize: "14px", fontWeight: 500, cursor: "pointer",
            border: "1px solid #e5e7eb",
            background: branding?.themeColors?.scheduleButtonBg ?? "#ffffff",
            color: branding?.themeColors?.scheduleButtonText ?? "#374151",
          }}
        >
          <Clock style={{ width: "16px", height: "16px" }} />
          <span>{t("schedule.title")}</span>
        </button>
      )}

      {/* Call button: always visible when branding has phone */}
      {branding?.phone && (
        <a
          data-call-btn
          href={`tel:${branding.phone}`}
          style={{
            position: "fixed", bottom: "24px", right: "16px", zIndex: 50,
            display: "flex", alignItems: "center", gap: "8px",
            padding: "12px 16px", borderRadius: "9999px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            fontSize: "14px", fontWeight: 500,
            textDecoration: "none",
            background: branding?.themeColors?.callButtonBg ?? "#c41a1a",
            color: branding?.themeColors?.callButtonText ?? "#ffffff",
          }}
        >
          <Phone style={{ width: "16px", height: "16px" }} />
          <span>{t("call")}</span>
        </a>
      )}

      {/* ── SCHEDULE MODAL ───────────────────────────────────────────────── */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif, serif)" }}>
              {t("schedule.title")}
            </DialogTitle>
          </DialogHeader>
          {branding?.schedule && branding.schedule.length > 0
            ? <ScheduleDisplay schedule={branding.schedule} />
            : (
              <p style={{ textAlign: "center", color: "#9ca3af", padding: "1rem 0", fontStyle: "italic" }}>
                {t("schedule.no_schedule")}
              </p>
            )
          }
        </DialogContent>
      </Dialog>

      <InstallBanner />
    </div>
  );
}

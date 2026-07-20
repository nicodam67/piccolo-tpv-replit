// Utilities for dynamic theme color application

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

// Returns 0 (dark) to 1 (light)
export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Returns a foreground color (white or near-black) that contrasts with bg
export function contrastForeground(hex: string): string {
  return getLuminance(hex) > 0.55 ? "#1a1008" : "#faf8f4";
}

// Inject (or update) a <style> tag with CSS variable overrides
export function applyThemeColors(colors: {
  primary?: string;
  background?: string;
  accent?: string;
  heroTitleColor?: string;
  heroTaglineColor?: string;
  heroEstablishedColor?: string;
  callButtonBg?: string;
  callButtonText?: string;
  scheduleButtonBg?: string;
  scheduleButtonText?: string;
  tapDetailsColor?: string;
}) {
  const id = "dynamic-theme";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }

  const rules: string[] = [];

  if (colors.primary) {
    const fg = contrastForeground(colors.primary);
    rules.push(`--primary: ${colors.primary};`);
    rules.push(`--primary-foreground: ${fg};`);
    rules.push(`--ring: ${colors.primary};`);
  }
  if (colors.background) {
    const fg = contrastForeground(colors.background);
    rules.push(`--background: ${colors.background};`);
    rules.push(`--foreground: ${fg};`);
    // Slightly lighter/darker for card
    rules.push(`--card: ${colors.background};`);
    rules.push(`--card-foreground: ${fg};`);
  }
  if (colors.accent) {
    const fg = contrastForeground(colors.accent);
    rules.push(`--accent: ${colors.accent};`);
    rules.push(`--accent-foreground: ${fg};`);
  }

  // Hero color overrides — ALWAYS injected with defaults so they beat
  // the global h1/h2 heading-color rule from applyThemeFonts.
  // [data-hero-*] is an attribute selector (0,1,0) vs h1 type selector (0,0,1),
  // so it wins when both carry !important.
  const heroRules: string[] = [
    `[data-hero-title]       { color: ${colors.heroTitleColor       ?? "#ffffff"                  } !important; }`,
    `[data-hero-established] { color: ${colors.heroEstablishedColor ?? "#c9a84c"                  } !important; }`,
    `[data-hero-tagline]     { color: ${colors.heroTaglineColor     ?? "rgba(255,255,255,0.85)"   } !important; }`,
  ];
  if (colors.callButtonText) {
    heroRules.push(`[data-call-btn], [data-call-btn] * { color: ${colors.callButtonText} !important; }`);
  }
  if (colors.callButtonBg) {
    heroRules.push(`[data-call-btn] { background: ${colors.callButtonBg} !important; }`);
  }
  if (colors.scheduleButtonText) {
    heroRules.push(`[data-schedule-btn], [data-schedule-btn] * { color: ${colors.scheduleButtonText} !important; }`);
  }
  if (colors.scheduleButtonBg) {
    heroRules.push(`[data-schedule-btn] { background: ${colors.scheduleButtonBg} !important; }`);
  }

  // price color is controlled by applyThemeFonts (headingColor) or falls back to --primary via CSS
  if (colors.tapDetailsColor) {
    heroRules.push(`[data-tap-details] { color: ${colors.tapDetailsColor} !important; }`);
  }

  const rootBlock = rules.length ? `:root { ${rules.join(" ")} }` : "";
  el.textContent = [rootBlock, ...heroRules].join("\n");
}

export function removeThemeColors() {
  const el = document.getElementById("dynamic-theme");
  if (el) el.remove();
}

// Custom uploaded fonts map (value -> public/fonts/ paths served under Vite base).
// WOFF2 is served first (smaller, universally supported, no OTS quirks from
// legacy TTF table ordering). TTF is kept as a fallback for very old clients.
// NOTE: paths use import.meta.env.BASE_URL because the app is mounted at
// /qr-menu/ — omitting the base would fetch from the wrong origin root.
const CUSTOM_FONT_URLS: Record<string, { woff2: string; ttf: string }> = {
  "Algerian__custom":     { woff2: `${import.meta.env.BASE_URL}fonts/Algerian__custom.woff2`,     ttf: `${import.meta.env.BASE_URL}fonts/Algerian__custom.ttf`     },
  "AvantGardeBk__custom": { woff2: `${import.meta.env.BASE_URL}fonts/AvantGardeBk__custom.woff2`, ttf: `${import.meta.env.BASE_URL}fonts/AvantGardeBk__custom.ttf` },
  "AmericanTextBT__custom": { woff2: `${import.meta.env.BASE_URL}fonts/AmericanTextBT__custom.woff2`, ttf: `${import.meta.env.BASE_URL}fonts/AmericanTextBT__custom.ttf` },
  "ZapfChanDm__custom":   { woff2: `${import.meta.env.BASE_URL}fonts/ZapfChanDm__custom.woff2`,   ttf: `${import.meta.env.BASE_URL}fonts/ZapfChanDm__custom.ttf`   },
  "ZapfChanMd__custom":   { woff2: `${import.meta.env.BASE_URL}fonts/ZapfChanMd__custom.woff2`,   ttf: `${import.meta.env.BASE_URL}fonts/ZapfChanMd__custom.ttf`   },
};

function isCustomFont(value: string) {
  return value.endsWith("__custom");
}

function ensureCustomFontFace(value: string) {
  const urls = CUSTOM_FONT_URLS[value];
  if (!urls) return;
  const styleId = `custom-font-${value}`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  // WOFF2 first — modern format with no OTS legacy-TTF parsing issues.
  // TTF kept as fallback for clients that don't support WOFF2 (< 1% today).
  style.textContent = `@font-face { font-family: "${value}"; src: url("${urls.woff2}") format("woff2"), url("${urls.ttf}") format("truetype"); font-display: swap; }`;
  document.head.appendChild(style);
}

// Load Google Fonts and inject CSS variable overrides for typography
export function applyThemeFonts(fonts: { heading?: string; body?: string; headingColor?: string; bodyColor?: string }) {
  // Separate Google fonts from custom fonts
  const googleFamilies: string[] = [];
  if (fonts.heading && !isCustomFont(fonts.heading)) googleFamilies.push(fonts.heading.replace(/ /g, "+") + ":wght@400;600;700");
  if (fonts.body && !isCustomFont(fonts.body)) googleFamilies.push(fonts.body.replace(/ /g, "+") + ":wght@400;500;600");

  // Ensure custom font-face rules are injected
  if (fonts.heading && isCustomFont(fonts.heading)) ensureCustomFontFace(fonts.heading);
  if (fonts.body && isCustomFont(fonts.body)) ensureCustomFontFace(fonts.body);

  if (googleFamilies.length > 0) {
    const linkId = "dynamic-fonts-link";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${googleFamilies.map((f) => `family=${f}`).join("&")}&display=swap`;
  }

  // Inject CSS variable overrides
  const id = "dynamic-fonts";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }

  const rules: string[] = [];
  if (fonts.heading) rules.push(`--font-serif: "${fonts.heading}", serif;`);
  if (fonts.body) rules.push(`--font-sans: "${fonts.body}", sans-serif;`);

  // Apply fonts globally since Tailwind 4 compiles font variables at build time
  const globalRules: string[] = [];

  if (fonts.body) {
    // Apply body font to body (inherited by children).
    // bodyColor uses normal cascade — no !important — so inline styles and
    // heading-font rules can override it on individual elements.
    const colorRule = fonts.bodyColor ? `color: ${fonts.bodyColor};` : "";
    globalRules.push(`body { font-family: "${fonts.body}", sans-serif; ${colorRule} }`);
    // Font-family only (no color !important) on children so specific selectors win.
    globalRules.push(`body * { font-family: "${fonts.body}", sans-serif; }`);
  }

  if (fonts.heading) {
    const colorRule = fonts.headingColor ? `color: ${fonts.headingColor} !important;` : "";
    // Heading font + color take priority over inherited body styles.
    // Note: [style*="font-serif"] is intentionally omitted here — elements that
    // use fontFamily:"var(--font-serif)" via inline style already inherit the
    // heading font through the CSS variable; including that selector would bleed
    // headingColor into hero elements (h1 with data-hero-title) unexpectedly.
    globalRules.push(
      `h1, h2, h3, h4, h5, h6,
       [data-heading],
       [class*="font-serif"] { font-family: "${fonts.heading}", serif !important; ${colorRule} }`
    );
  }

  // Prices use heading color if set, else fall back to --primary
  if (fonts.headingColor) {
    globalRules.push(`[data-item-price] { color: ${fonts.headingColor} !important; }`);
  } else {
    globalRules.push(`[data-item-price] { color: var(--primary) !important; }`);
  }

  el.textContent = rules.length
    ? `:root { ${rules.join(" ")} } ${globalRules.join("\n")}`
    : "";
}

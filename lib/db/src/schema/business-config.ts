import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── QR Branding types ─────────────────────────────────────────────────────────
export type ThemeColors = {
  primary?: string;
  background?: string;
  accent?: string;
  infoTextColor?: string;
  categoryCardBg?: string;
  categoryCardText?: string;
  callButtonBg?: string;
  callButtonText?: string;
  scheduleButtonBg?: string;
  scheduleButtonText?: string;
  heroTitleColor?: string;
  heroTaglineColor?: string;
  heroEstablishedColor?: string;
  tapDetailsColor?: string;
};
export type ThemeFonts = {
  heading?: string;
  body?: string;
  headingColor?: string;
  bodyColor?: string;
};
export type CardSettings = {
  showImage?: boolean;
  showDescription?: boolean;
  showTags?: boolean;
  showAllergens?: boolean;
  showPrice?: boolean;
  showHalfPortion?: boolean;
  showQuantity?: boolean;
  layout?: "grid" | "list" | "compact";
};
export type QrShift = { open: boolean; openTime: string; closeTime: string };
export type QrDaySchedule = { day: string; shift1: QrShift; shift2: QrShift };

export const businessConfigTable = pgTable("business_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreComercial: text("nombre_comercial").notNull().default(""),
  razonSocial: text("razon_social").notNull().default(""),
  nif: text("nif").notNull().default(""),
  direccionFiscal: text("direccion_fiscal").notNull().default(""),
  codigoPostal: text("codigo_postal").notNull().default(""),
  poblacion: text("poblacion").notNull().default(""),
  provincia: text("provincia").notNull().default(""),
  pais: text("pais").notNull().default("España"),
  telefono: text("telefono").notNull().default(""),
  email: text("email").notNull().default(""),
  web: text("web").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // ── QR carta branding ──────────────────────────────────────────────────────
  heroImageUrl: text("hero_image_url").notNull().default(""),
  heroVideoUrl: text("hero_video_url").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  foundedYear: integer("founded_year"),
  /** Public address shown on the carta (can differ from direccionFiscal) */
  address: text("address").notNull().default(""),
  /** Public phone shown on the carta */
  phone: text("phone").notNull().default(""),
  /**
   * Opening hours per weekday. Structure:
   * { mon: { open: "09:00", close: "16:00", open2?: "19:00", close2?: "23:00" }, tue: …, … }
   * Keys: mon tue wed thu fri sat sun. Omitted key means closed that day.
   */
  openingHours: jsonb("opening_hours").$type<Record<string, { open: string; close: string; open2?: string; close2?: string }>>(),
  /** Default card layout for the QR carta: grid | list | compact */
  cardLayout: text("card_layout").notNull().default("grid"),
  /** Accent/primary color for the QR carta, e.g. "#ef4444" */
  accentColor: text("accent_color").notNull().default("#ef4444"),
  // ── Printing module ────────────────────────────────────────────────────────
  /** kds_only | printers_only | both */
  printMode: text("print_mode").notNull().default("kds_only"),
  /** PrintTemplateConfig stored as jsonb */
  printTemplateConfig: jsonb("print_template_config"),
  // ── Setup wizard / onboarding ──────────────────────────────────────────────
  /** ISO 4217 currency code, e.g. "EUR" */
  moneda: text("moneda").notNull().default("EUR"),
  /** BCP-47 locale, e.g. "es" */
  idioma: text("idioma").notNull().default("es"),
  /** "general" | "simplificado" | "recargo_equivalencia" | "regimen_especial" */
  regimenFiscal: text("regimen_fiscal").notNull().default("general"),
  /** Whether the restaurant has been fully set up and is in production */
  setupCompleted: boolean("setup_completed").notNull().default(false),
  /** When production mode was activated */
  goLiveAt: timestamp("go_live_at", { withTimezone: true }),
  // ── QR Branding extended fields ────────────────────────────────────────────
  /** City shown on the public carta footer */
  qrCity: text("qr_city").notNull().default(""),
  /** Province/state shown on the public carta footer */
  qrProvince: text("qr_province").notNull().default(""),
  /** Postal code shown on the public carta footer */
  qrPostalCode: text("qr_postal_code").notNull().default(""),
  /** Country shown on the public carta footer */
  qrCountry: text("qr_country").notNull().default(""),
  /** 14-key theme color object for the QR carta */
  themeColors: jsonb("theme_colors").$type<ThemeColors>(),
  /** Heading + body font settings for the QR carta */
  themeFonts: jsonb("theme_fonts").$type<ThemeFonts>(),
  /** Card display settings for the QR carta items */
  cardSettings: jsonb("card_settings").$type<CardSettings>(),
  /** Schedule as DaySchedule[] with two shifts per day */
  qrSchedule: jsonb("qr_schedule").$type<QrDaySchedule[]>(),
});

export type BusinessConfig = typeof businessConfigTable.$inferSelect;

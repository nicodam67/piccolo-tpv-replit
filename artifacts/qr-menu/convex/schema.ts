import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Auth (OIDC / legacy Hercules sync) ───────────────────────────────────
  // Kept for backward compatibility; new auth uses the `admins` table below.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  // ── Custom admin authentication (Task #273 wires the frontend) ───────────
  admins: defineTable({
    email: v.string(),
    passwordHash: v.string(),     // bcrypt hash — never store plaintext
    role: v.string(),             // "admin" | "employee"
    createdAt: v.number(),        // Unix ms timestamp
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // ── Import tracking (Task #274 uses this for reanudable imports) ─────────
  importLog: defineTable({
    table: v.string(),            // "categories" | "menuItems" | "branding" | "images"
    externalId: v.string(),       // ID in the original (Hercules) system
    convexId: v.string(),         // New Convex document ID
    importedAt: v.number(),       // Unix ms timestamp
    batch: v.optional(v.string()), // Batch identifier for grouping
    status: v.optional(v.string()), // "ok" | "skipped" | "error"
    errorMessage: v.optional(v.string()),
  })
    .index("by_table", ["table"])
    .index("by_external_id", ["externalId"])
    .index("by_table_and_external_id", ["table", "externalId"]),

  // ── Menu categories ───────────────────────────────────────────────────────
  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    // Optional parent category ID for subcategories
    parentId: v.optional(v.id("categories")),
    // Whether the category is visible in the public menu (default: true)
    available: v.optional(v.boolean()),
    // Per-locale overrides: { fr: { name: "...", description: "..." }, ... }
    translations: v.optional(
      v.record(
        v.string(),
        v.object({ name: v.optional(v.string()), description: v.optional(v.string()) }),
      ),
    ),
  }),

  // ── Restaurant branding & settings ───────────────────────────────────────
  branding: defineTable({
    restaurantName: v.string(),
    tagline: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    heroImageStorageId: v.optional(v.id("_storage")),
    heroVideoUrl: v.optional(v.string()),
    heroVideoStorageId: v.optional(v.id("_storage")),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    country: v.optional(v.string()),
    hours: v.optional(v.string()),
    establishedYear: v.optional(v.string()),
    phone: v.optional(v.string()),
    themeColors: v.optional(v.object({
      primary: v.optional(v.string()),
      background: v.optional(v.string()),
      accent: v.optional(v.string()),
      infoTextColor: v.optional(v.string()),
      categoryCardBg: v.optional(v.string()),
      categoryCardText: v.optional(v.string()),
      callButtonBg: v.optional(v.string()),
      callButtonText: v.optional(v.string()),
      scheduleButtonBg: v.optional(v.string()),
      scheduleButtonText: v.optional(v.string()),
      heroTitleColor: v.optional(v.string()),
      heroTaglineColor: v.optional(v.string()),
      heroEstablishedColor: v.optional(v.string()),
      tapDetailsColor: v.optional(v.string()),
    })),
    themeFonts: v.optional(v.object({
      heading: v.optional(v.string()),
      body: v.optional(v.string()),
      headingColor: v.optional(v.string()),
      bodyColor: v.optional(v.string()),
    })),
    cardSettings: v.optional(v.object({
      showImage: v.optional(v.boolean()),
      showDescription: v.optional(v.boolean()),
      showTags: v.optional(v.boolean()),
      showAllergens: v.optional(v.boolean()),
      showPrice: v.optional(v.boolean()),
      showHalfPortion: v.optional(v.boolean()),
      showQuantity: v.optional(v.boolean()),
      layout: v.optional(v.string()), // "grid" | "list" | "compact"
    })),
    schedule: v.optional(
      v.array(
        v.object({
          day: v.string(),
          shift1: v.object({ open: v.boolean(), openTime: v.string(), closeTime: v.string() }),
          shift2: v.object({ open: v.boolean(), openTime: v.string(), closeTime: v.string() }),
        }),
      ),
    ),
  }),

  // ── Menu items (products) ─────────────────────────────────────────────────
  menuItems: defineTable({
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    videoUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    quantity: v.optional(v.string()),
    available: v.boolean(),
    order: v.number(),
    tags: v.optional(v.array(v.string())),
    halfPortionPrice: v.optional(v.number()),
    allergens: v.optional(v.array(v.string())),
    // Per-locale overrides: { fr: { name: "...", description: "..." }, ... }
    translations: v.optional(
      v.record(
        v.string(),
        v.object({ name: v.optional(v.string()), description: v.optional(v.string()) }),
      ),
    ),
  })
    .index("by_category", ["categoryId"])
    .index("by_category_and_available", ["categoryId", "available"]),
});

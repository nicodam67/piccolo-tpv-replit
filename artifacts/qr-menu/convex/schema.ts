import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

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

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./requireAdmin";

// Returns the single branding document (or null if not yet set)
// Also resolves heroImageStorageId -> heroImageUrl if present
export const get = query({
  args: {},
  handler: async (ctx) => {
    const results = await ctx.db.query("branding").collect();
    const doc = results[0];
    if (!doc) return null;
    // Resolve storage URLs
    let resolved = { ...doc };
    if (doc.heroImageStorageId) {
      const url = await ctx.storage.getUrl(doc.heroImageStorageId);
      resolved = { ...resolved, heroImageUrl: url ?? doc.heroImageUrl };
    }
    if (doc.heroVideoStorageId) {
      const url = await ctx.storage.getUrl(doc.heroVideoStorageId);
      resolved = { ...resolved, heroVideoUrl: url ?? doc.heroVideoUrl };
    }
    return resolved;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const upsert = mutation({
  args: {
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
      layout: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("branding").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("branding", args);
    }
  },
});

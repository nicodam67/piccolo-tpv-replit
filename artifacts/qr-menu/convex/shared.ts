/**
 * shared.ts — Public read-only queries for cross-system consumers.
 *
 * These queries are designed to be called by external systems such as
 * Piccolo TPV that need a real-time view of the restaurant menu without
 * requiring admin authentication.
 *
 * All queries here are public (no auth required) and read-only.
 *
 * Usage from Piccolo TPV (or any Convex client):
 *
 *   import { useQuery } from "convex/react";
 *   import { api } from "../convex/_generated/api";
 *
 *   const snapshot = useQuery(api.shared.getMenuSnapshot);
 *
 * The subscription updates automatically whenever menu data changes
 * (categories, items, or branding) — no polling needed.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./requireAdmin";

/**
 * getMenuSnapshot — Returns the complete menu in a single call.
 *
 * Fetches all available categories, their items, and the restaurant branding
 * in one round-trip. Designed for TPV and kiosk systems that need to build
 * a full offline-capable menu cache.
 *
 * Returns:
 *   - categories: sorted by `order`, with resolved imageUrl where available
 *   - items: all available items grouped by categoryId, sorted by `order`
 *   - branding: restaurant settings (name, hero image, theme colors/fonts)
 *   - fetchedAt: server-side timestamp (ms since epoch)
 */
export const getMenuSnapshot = query({
  args: {
    /** If true, include unavailable items too (e.g. for admin displays). */
    includeUnavailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.includeUnavailable) await requireAdmin(ctx);
    const includeUnavailable = args.includeUnavailable ?? false;

    // ── Categories ─────────────────────────────────────────────────────────
    const rawCategories = await ctx.db.query("categories").collect();
    const categories = rawCategories
      .filter((c) => includeUnavailable || c.available !== false)
      .sort((a, b) => a.order - b.order);

    // ── Menu items ─────────────────────────────────────────────────────────
    const rawItems = await ctx.db.query("menuItems").collect();
    const filteredItems = includeUnavailable
      ? rawItems
      : rawItems.filter((i) => i.available);

    // Resolve Convex Storage IDs → served URLs
    const items = await Promise.all(
      filteredItems
        .sort((a, b) => a.order - b.order)
        .map(async (item) => {
          let imageUrl = item.imageUrl;
          let videoUrl = item.videoUrl;

          if (item.imageStorageId) {
            const url = await ctx.storage.getUrl(item.imageStorageId);
            if (url) imageUrl = url;
          }
          if (item.videoStorageId) {
            const url = await ctx.storage.getUrl(item.videoStorageId);
            if (url) videoUrl = url;
          }

          return { ...item, imageUrl, videoUrl };
        }),
    );

    // ── Branding ───────────────────────────────────────────────────────────
    const brandingDocs = await ctx.db.query("branding").collect();
    const brandingRaw = brandingDocs[0] ?? null;

    let branding = brandingRaw;
    if (brandingRaw) {
      let heroImageUrl = brandingRaw.heroImageUrl;
      let heroVideoUrl = brandingRaw.heroVideoUrl;

      if (brandingRaw.heroImageStorageId) {
        const url = await ctx.storage.getUrl(brandingRaw.heroImageStorageId);
        if (url) heroImageUrl = url;
      }
      if (brandingRaw.heroVideoStorageId) {
        const url = await ctx.storage.getUrl(brandingRaw.heroVideoStorageId);
        if (url) heroVideoUrl = url;
      }

      branding = { ...brandingRaw, heroImageUrl, heroVideoUrl };
    }

    return {
      categories,
      items,
      branding,
      fetchedAt: Date.now(),
    };
  },
});

/**
 * getCategoryWithItems — Returns one category and its available items.
 *
 * Useful for TPV screens showing a single section at a time without
 * fetching the full snapshot.
 */
export const getCategoryWithItems = query({
  args: {
    categoryId: v.id("categories"),
    includeUnavailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.includeUnavailable) await requireAdmin(ctx);
    const includeUnavailable = args.includeUnavailable ?? false;

    const category = await ctx.db.get(args.categoryId);
    if (!category) return null;
    if (!includeUnavailable && category.available === false) return null;

    const rawItems = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();

    const filteredItems = includeUnavailable
      ? rawItems
      : rawItems.filter((i) => i.available);

    const items = await Promise.all(
      filteredItems
        .sort((a, b) => a.order - b.order)
        .map(async (item) => {
          let imageUrl = item.imageUrl;
          let videoUrl = item.videoUrl;
          if (item.imageStorageId) {
            const url = await ctx.storage.getUrl(item.imageStorageId);
            if (url) imageUrl = url;
          }
          if (item.videoStorageId) {
            const url = await ctx.storage.getUrl(item.videoStorageId);
            if (url) videoUrl = url;
          }
          return { ...item, imageUrl, videoUrl };
        }),
    );

    return { category, items };
  },
});

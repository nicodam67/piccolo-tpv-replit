import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./requireAdmin";

// ── Public queries ────────────────────────────────────────────────────────────

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("categories").collect();
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Helper to resolve imageStorageId -> imageUrl and videoStorageId -> videoUrl on items.
// Uses try/catch per item so a single bad storage ID never crashes the whole query.
async function resolveItemImages<T extends { imageUrl?: string; imageStorageId?: string; videoUrl?: string; videoStorageId?: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { storage: { getUrl: (id: any) => Promise<string | null> } },
  items: T[]
): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      let resolved: T = item;
      if (item.imageStorageId) {
        try {
          const url = await ctx.storage.getUrl(item.imageStorageId);
          if (url) resolved = { ...resolved, imageUrl: url };
        } catch {
          // Keep the existing imageUrl if storage lookup fails
        }
      }
      if (item.videoStorageId) {
        try {
          const url = await ctx.storage.getUrl(item.videoStorageId);
          if (url) resolved = { ...resolved, videoUrl: url };
        } catch {
          // Keep the existing videoUrl if storage lookup fails
        }
      }
      return resolved;
    })
  );
}

// Legacy alias — kept for backward compat with any cached client subscriptions.
export const listAvailableItems = query({
  args: { categoryId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("menuItems").collect();
    return all.filter((i) => {
      if (!i.available) return false;
      if (args.categoryId && i.categoryId !== args.categoryId) return false;
      return true;
    });
  },
});

// New public query used by the updated CategoriaPage.
// Separate name avoids stale Convex function cache issues.
export const getItemsByCategoryId = query({
  args: { catId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("menuItems").collect();
    return all.filter((i) => i.available === true && i.categoryId === args.catId);
  },
});

// ── Admin mutations ───────────────────────────────────────────────────────────

const translationsValidator = v.optional(
  v.record(
    v.string(),
    v.object({ name: v.optional(v.string()), description: v.optional(v.string()) }),
  ),
);

export const createCategory = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    parentId: v.optional(v.id("categories")),
    available: v.optional(v.boolean()),
    translations: translationsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.insert("categories", { ...args, available: args.available ?? true });
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    parentId: v.optional(v.id("categories")),
    available: v.optional(v.boolean()),
    translations: translationsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const toggleCategoryAvailable = mutation({
  args: { id: v.id("categories"), available: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { available: args.available });
  },
});

export const deleteCategory = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // Delete all items in this category first
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.id))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const createMenuItem = mutation({
  args: {
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
    translations: translationsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.insert("menuItems", args);
  },
});

export const updateMenuItem = mutation({
  args: {
    id: v.id("menuItems"),
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    videoUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    quantity: v.optional(v.union(v.string(), v.null())),
    available: v.boolean(),
    order: v.number(),
    tags: v.optional(v.array(v.string())),
    halfPortionPrice: v.optional(v.number()),
    allergens: v.optional(v.array(v.string())),
    translations: translationsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { id, quantity, ...rest } = args;
    // quantity === null means "clear the field"; quantity === undefined means "not provided"
    if (quantity === null) {
      await ctx.db.patch(id, { ...rest, quantity: undefined });
    } else {
      await ctx.db.patch(id, { ...rest, ...(quantity !== undefined ? { quantity } : {}) });
    }
  },
});

export const toggleItemAvailability = mutation({
  args: { id: v.id("menuItems"), available: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { available: args.available });
  },
});

export const deleteMenuItem = mutation({
  args: { id: v.id("menuItems") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});

export const saveItemTranslations = mutation({
  args: {
    id: v.id("menuItems"),
    translations: v.record(
      v.string(),
      v.object({ name: v.optional(v.string()), description: v.optional(v.string()) }),
    ),
    merge: v.optional(v.boolean()), // if true, merge with existing translations
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.merge) {
      const doc = await ctx.db.get(args.id);
      const existing = (doc?.translations ?? {}) as Record<string, { name?: string; description?: string }>;
      await ctx.db.patch(args.id, { translations: { ...existing, ...args.translations } });
    } else {
      await ctx.db.patch(args.id, { translations: args.translations });
    }
  },
});

export const saveCategoryTranslations = mutation({
  args: {
    id: v.id("categories"),
    translations: v.record(
      v.string(),
      v.object({ name: v.optional(v.string()), description: v.optional(v.string()) }),
    ),
    merge: v.optional(v.boolean()), // if true, merge with existing translations
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.merge) {
      const doc = await ctx.db.get(args.id);
      const existing = (doc?.translations ?? {}) as Record<string, { name?: string; description?: string }>;
      await ctx.db.patch(args.id, { translations: { ...existing, ...args.translations } });
    } else {
      await ctx.db.patch(args.id, { translations: args.translations });
    }
  },
});

// Reorder categories (update order field for a list of ids)
export const reorderCategories = mutation({
  args: { ids: v.array(v.id("categories")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    for (let i = 0; i < args.ids.length; i++) {
      await ctx.db.patch(args.ids[i], { order: i + 1 });
    }
  },
});

// Reorder items within a category
export const reorderItems = mutation({
  args: { ids: v.array(v.id("menuItems")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    for (let i = 0; i < args.ids.length; i++) {
      await ctx.db.patch(args.ids[i], { order: i + 1 });
    }
  },
});

// All items (admin view, includes unavailable)
export const listAllItems = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const items = await ctx.db.query("menuItems").collect();
    return resolveItemImages(ctx, items);
  },
});

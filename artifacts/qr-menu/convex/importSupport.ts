/**
 * Import support functions for the reanudable data migration (Task #274).
 *
 * These mutations/queries are protected by an import secret rather than
 * user session auth so they can be called from CLI scripts.
 *
 * Usage from scripts:
 *   const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL);
 *   await convex.mutation(api.importSupport.markImported, { ... });
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// ── Auth helper for import scripts ────────────────────────────────────────────
// Scripts must pass the CONVEX_IMPORT_SECRET env var to authenticate.
function requireImportSecret(secret: string | undefined) {
  const expected = process.env.CONVEX_IMPORT_SECRET;
  if (!expected || secret !== expected) {
    throw new ConvexError({ message: "Invalid import secret", code: "FORBIDDEN" });
  }
}

// ── Check if a record was already imported ────────────────────────────────────
export const checkImported = query({
  args: {
    table: v.string(),
    externalId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const existing = await ctx.db
      .query("importLog")
      .withIndex("by_table_and_external_id", (q) =>
        q.eq("table", args.table).eq("externalId", args.externalId),
      )
      .first();
    return existing ?? null;
  },
});

// ── Mark a record as imported ─────────────────────────────────────────────────
export const markImported = mutation({
  args: {
    table: v.string(),
    externalId: v.string(),
    convexId: v.string(),
    batch: v.optional(v.string()),
    status: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const { secret, ...rest } = args;
    // Upsert: update if exists, insert if not
    const existing = await ctx.db
      .query("importLog")
      .withIndex("by_table_and_external_id", (q) =>
        q.eq("table", rest.table).eq("externalId", rest.externalId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...rest, importedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("importLog", { ...rest, importedAt: Date.now() });
  },
});

// ── Batch-import records into a table ─────────────────────────────────────────
export const importBatch = mutation({
  args: {
    table: v.union(
      v.literal("categories"),
      v.literal("menuItems"),
      v.literal("branding"),
    ),
    records: v.array(v.any()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const inserted: Array<{ externalId: string; convexId: string }> = [];
    for (const record of args.records) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { _id: externalId, ...data } = record as any;
      const convexId = await ctx.db.insert(args.table as "categories" | "menuItems" | "branding", data);
      inserted.push({ externalId: String(externalId), convexId });
    }
    return inserted;
  },
});

// ── Get full import log (for verification scripts) ────────────────────────────
export const getImportLog = query({
  args: {
    table: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    if (args.table) {
      return await ctx.db
        .query("importLog")
        .withIndex("by_table", (q) => q.eq("table", args.table!))
        .collect();
    }
    return await ctx.db.query("importLog").collect();
  },
});

// ── Clear the import log for a table (use to restart a partial import) ────────
export const clearImportLog = mutation({
  args: {
    table: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const entries = await ctx.db
      .query("importLog")
      .withIndex("by_table", (q) => q.eq("table", args.table))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: entries.length };
  },
});

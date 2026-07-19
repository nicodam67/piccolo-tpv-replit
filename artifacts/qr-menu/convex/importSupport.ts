/**
 * Import support functions for the reanudable data migration (Task #274).
 *
 * These mutations/queries are protected by an import secret rather than
 * user session auth so they can be called from CLI scripts.
 *
 * Usage from scripts:
 *   const convex = new ConvexHttpClient(process.env.CONVEX_URL);
 *   await convex.mutation(api.importSupport.importBatch, { ... });
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// ── Auth helper for import scripts ────────────────────────────────────────────
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
    return await ctx.db
      .query("importLog")
      .withIndex("by_table_and_external_id", (q) =>
        q.eq("table", args.table).eq("externalId", args.externalId),
      )
      .first() ?? null;
  },
});

// ── Mark a record as imported (upsert) ───────────────────────────────────────
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

// ── Batch-import records, returns old→new ID pairs ───────────────────────────
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
      const { _id: externalId, _creationTime, ...rawData } = record as any;
      // Strip any migration-only metadata (fields starting with _old) so they
      // never reach the schema-validated table writer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = Object.fromEntries(
        Object.entries(rawData as Record<string, unknown>).filter(([k]) => !k.startsWith("_old")),
      );
      const convexId = await ctx.db.insert(
        args.table as "categories" | "menuItems" | "branding",
        data,
      );
      inserted.push({ externalId: String(externalId), convexId });
      // Auto-log in importLog
      await ctx.db.insert("importLog", {
        table: args.table,
        externalId: String(externalId),
        convexId,
        importedAt: Date.now(),
        status: "ok",
      });
    }
    return inserted;
  },
});

// ── Patch a document (to update storage IDs after upload) ────────────────────
export const patchDocument = mutation({
  args: {
    table: v.union(
      v.literal("categories"),
      v.literal("menuItems"),
      v.literal("branding"),
    ),
    convexId: v.string(),
    fields: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = args.convexId as any;
    await ctx.db.patch(id, args.fields);
  },
});

// ── Generate a storage upload URL (for importing media files) ─────────────────
export const generateImportUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    return await ctx.storage.generateUploadUrl();
  },
});

// ── Get the import log for all tables or a specific table ─────────────────────
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

// ── Summary counts by table ───────────────────────────────────────────────────
export const getImportSummary = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const all = await ctx.db.query("importLog").collect();
    const byTable: Record<string, { ok: number; error: number; skipped: number }> = {};
    for (const entry of all) {
      if (!byTable[entry.table]) byTable[entry.table] = { ok: 0, error: 0, skipped: 0 };
      const status = (entry.status ?? "ok") as "ok" | "error" | "skipped";
      if (status in byTable[entry.table]) byTable[entry.table][status]++;
    }
    return byTable;
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

// ── List all documents in a table (admin check) ───────────────────────────────
export const countTable = query({
  args: {
    table: v.union(
      v.literal("categories"),
      v.literal("menuItems"),
      v.literal("branding"),
    ),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireImportSecret(args.secret);
    const docs = await ctx.db.query(args.table as "categories" | "menuItems" | "branding").collect();
    return docs.length;
  },
});

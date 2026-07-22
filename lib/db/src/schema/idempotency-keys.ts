import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const idempotencyKeysTable = pgTable("idempotency_keys", {
  cacheKey: text("cache_key").primaryKey(),
  userId: text("user_id").notNull(),
  statusCode: integer("status_code").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

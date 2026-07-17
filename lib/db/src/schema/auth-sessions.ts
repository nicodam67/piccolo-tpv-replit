/**
 * Revoked tokens table — supports real session invalidation on logout.
 *
 * When a user logs out, their JWT's `jti` (JWT ID) is inserted here.
 * `requireAuth` checks this table on every authenticated request.
 * Rows are cheap to clean up: anything with `expiresAt` in the past can be
 * deleted during the periodic cleanup (called from the logout handler).
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const revokedTokensTable = pgTable("revoked_tokens", {
  /** JWT ID — primary key so revocation is an O(1) upsert + lookup. */
  jti: text("jti").primaryKey(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
  /** Copy of the token's `exp` claim so expired rows can be pruned. */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type RevokedToken = typeof revokedTokensTable.$inferSelect;

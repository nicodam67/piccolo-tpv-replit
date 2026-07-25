import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireAdmin(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await ctx.db.get(userId);
  if (!user?.email) {
    throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
  }
  const admin = await ctx.db.query("admins")
    .withIndex("by_email", (query) => query.eq("email", user.email!))
    .first();
  if (!admin || admin.role !== "admin") {
    throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
  }
  return { userId, email: user.email, role: admin.role };
}

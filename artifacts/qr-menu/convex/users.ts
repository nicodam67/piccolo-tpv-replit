/**
 * User helpers — replaced by @convex-dev/auth's built-in user management.
 *
 * The old OIDC-based updateCurrentUser/getCurrentUser mutations are removed.
 * Use adminAuth:getMe for admin profile queries.
 */
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Returns the authenticated user document, or throws UNAUTHENTICATED.
 * Kept for any legacy component that still calls this — prefer adminAuth:getMe.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Not authenticated",
      });
    }
    return await ctx.db.get(userId);
  },
});

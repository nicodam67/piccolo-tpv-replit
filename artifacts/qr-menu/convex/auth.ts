/**
 * Convex Auth — email + password provider.
 *
 * Sign-up is restricted to the address stored in the ADMIN_EMAIL
 * environment variable so that no arbitrary user can create an account.
 *
 * The first account is seeded via adminAuth:seedAdminIfEmpty (called once
 * from the admin panel or a one-shot HTTP endpoint).
 */
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    /**
     * Called when a user is about to be created or updated.
     * • New user  (existingUserId === undefined): only allow ADMIN_EMAIL.
     * • Existing user: allow silently (no field changes needed).
     */
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      if (existingUserId !== null) {
        // Existing user — nothing to patch for our use case.
        return existingUserId;
      }

      // New user — gate on ADMIN_EMAIL.
      const allowedEmail = process.env.ADMIN_EMAIL;
      if (!allowedEmail || profile.email !== allowedEmail) {
        throw new ConvexError({
          message: "El registro no está disponible en este portal.",
          code: "FORBIDDEN",
        });
      }

      // Create the user in the `users` table (provided by authTables).
      return await ctx.db.insert("users", {
        email: profile.email as string | undefined,
      });
    },
  },
});

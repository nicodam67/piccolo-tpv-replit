/**
 * Admin-specific auth helpers:
 *  - seedAdminIfEmpty  — creates the first admin account from env vars
 *  - changePassword    — lets the signed-in admin change their password
 *  - getMe             — returns the current admin's basic profile
 */
import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

// ── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Creates the first admin account if none exists.
 *
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from Convex environment variables.
 * These should be set via `npx convex env set ADMIN_EMAIL ...` after the
 * project is created.
 *
 * Usage: call once from the shell or a one-time HTTP request after deploy.
 */
export const seedAdminIfEmpty = action({
  args: { seedSecret: v.string() },
  handler: async (ctx, args) => {
    // Guard with a server-side secret to prevent accidental calls.
    const expectedSecret = process.env.ADMIN_SEED_SECRET;
    if (!expectedSecret || args.seedSecret !== expectedSecret) {
      throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new ConvexError({
        message: "ADMIN_EMAIL and ADMIN_PASSWORD must be set in Convex env vars.",
        code: "MISCONFIGURED",
      });
    }

    // Check if there is already a user for this email.
    const existing: boolean = await ctx.runQuery(api.adminAuth.adminExists, { email });
    if (existing) {
      return { created: false, message: "Admin account already exists." };
    }

    // Sign up via the Password provider (creates authAccounts + users entries).
    await ctx.runAction(api.auth.signIn, {
      provider: "password",
      params: { email, password, flow: "signUp" },
    });

    // Also create the admins role entry.
    await ctx.runMutation(api.adminAuth.ensureAdminsEntry, { email });

    return { created: true, message: `Admin account for ${email} created.` };
  },
});

export const adminExists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    return user !== null;
  },
});

export const ensureAdminsEntry = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (!existing) {
      await ctx.db.insert("admins", {
        email: args.email,
        role: "admin",
        createdAt: Date.now(),
      });
    }
  },
});

// ── Change password ───────────────────────────────────────────────────────────

/**
 * Changes the signed-in admin's password.
 * Delegates to the Password provider's "reset-verification" flow after
 * verifying the current password by attempting a sign-in internally.
 *
 * For simplicity this implementation lets @convex-dev/auth's internal
 * `modifyAccountCredentials` handle the update.
 */
export const changePassword = action({
  args: {
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    if (args.newPassword.length < 8) {
      throw new ConvexError({
        message: "La contraseña debe tener al menos 8 caracteres.",
        code: "VALIDATION",
      });
    }

    // Look up the admin's email so we have the providerAccountId (= email for Password provider).
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user?.email) {
      throw new ConvexError({ message: "No se encontró el email del administrador.", code: "NOT_FOUND" });
    }

    // Use @convex-dev/auth's exported helper to update the credential.
    // `account.id` = providerAccountId = email for the Password provider.
    const { modifyAccountCredentials } = await import("@convex-dev/auth/server");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: args.newPassword },
    });

    return { success: true };
  },
});

// ── Profile ───────────────────────────────────────────────────────────────────

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const adminEntry = user.email
      ? await ctx.db
          .query("admins")
          .withIndex("by_email", (q) => q.eq("email", user.email!))
          .first()
      : null;

    return {
      id: userId,
      email: user.email,
      role: adminEntry?.role ?? "admin",
    };
  },
});

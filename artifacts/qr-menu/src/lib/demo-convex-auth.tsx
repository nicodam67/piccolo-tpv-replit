/**
 * Demo-mode stub for @convex-dev/auth/react.
 *
 * Vite aliases this file over the real package when VITE_CONVEX_URL is
 * absent so the app renders with seed data without any network calls.
 */
import React from "react";

export function ConvexAuthProvider({
  children,
}: {
  children: React.ReactNode;
  client?: unknown;
  storage?: unknown;
}) {
  return <>{children}</>;
}

export function useAuthActions() {
  return {
    signIn: async () => { /* no-op in demo mode */ },
    signOut: async () => { /* no-op in demo mode */ },
  };
}

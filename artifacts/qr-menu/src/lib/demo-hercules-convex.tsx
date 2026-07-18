/**
 * Mock replacement for `@usehercules/auth/convex-react` in demo mode.
 * Vite aliases this package → this file when VITE_CONVEX_URL is not set.
 */
import React from "react";

export function ConvexProviderWithHerculesAuth({
  children,
}: {
  children: React.ReactNode;
  client?: unknown;
}) {
  return <>{children}</>;
}

/**
 * AuthProvider — identity wrapper.
 *
 * With @convex-dev/auth, authentication state is managed by ConvexAuthProvider
 * (see convex.tsx). This wrapper is kept for the provider tree structure but
 * is now a simple passthrough.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * ConvexProvider — wraps the app with the Convex client and auth.
 *
 * Uses @convex-dev/auth's ConvexAuthProvider which:
 *  - Provides the ConvexReactClient to all hooks (useQuery, useMutation, …)
 *  - Manages JWT / refresh-token lifecycle in localStorage
 *  - Makes Authenticated / Unauthenticated / AuthLoading from convex/react work
 *
 * In demo mode (VITE_CONVEX_URL absent), @convex-dev/auth/react is aliased
 * to src/lib/demo-convex-auth.tsx — a passthrough that never calls the network.
 */
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const isDemoMode = !convexUrl;

// In demo mode the ConvexReactClient stub (src/lib/demo-convex.tsx) is
// aliased over convex/react, so this cast is safe.
const convex = isDemoMode
  ? (null as unknown as ConvexReactClient)
  : new ConvexReactClient(convexUrl!);

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  if (isDemoMode) {
    // ConvexAuthProvider is aliased to a passthrough in demo mode.
    return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
  }
  return (
    <ConvexAuthProvider client={convex}>
      {children}
    </ConvexAuthProvider>
  );
}

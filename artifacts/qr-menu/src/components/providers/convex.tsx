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
declare const __QR_RUNTIME_MODE__: "live" | "demo" | "blocked";
const runtimeMode = __QR_RUNTIME_MODE__;

// In demo mode the ConvexReactClient stub (src/lib/demo-convex.tsx) is
// aliased over convex/react, so this cast is safe.
const convex = runtimeMode !== "live"
  ? (null as unknown as ConvexReactClient)
  : new ConvexReactClient(convexUrl!);

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  if (runtimeMode === "blocked") {
    return (
      <main style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "#f8f7f4", color: "#292524", padding: "2rem", textAlign: "center",
      }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>Carta no disponible</h1>
          <p>La carta todavía no está configurada. Contacta con el establecimiento.</p>
        </div>
      </main>
    );
  }
  if (runtimeMode === "demo") {
    // ConvexAuthProvider is aliased to a passthrough in demo mode.
    return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
  }
  return (
    <ConvexAuthProvider client={convex}>
      {children}
    </ConvexAuthProvider>
  );
}

import { ConvexProviderWithHerculesAuth } from "@usehercules/auth/convex-react";
import { ConvexReactClient } from "convex/react";

const convexUrl  = import.meta.env.VITE_CONVEX_URL;
const isDemoMode = !convexUrl;

// In demo mode both of these imports are aliased to no-op mocks by Vite,
// so ConvexReactClient is a stub and ConvexProviderWithHerculesAuth is a passthrough.
// No crash, no network calls — the mock useQuery hook returns seed data directly.
const convex = isDemoMode ? null : new ConvexReactClient(convexUrl!);

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  if (isDemoMode) {
    // ConvexProviderWithHerculesAuth is already a passthrough mock in this mode.
    return <ConvexProviderWithHerculesAuth>{children}</ConvexProviderWithHerculesAuth>;
  }
  return (
    <ConvexProviderWithHerculesAuth client={convex!}>
      {children}
    </ConvexProviderWithHerculesAuth>
  );
}

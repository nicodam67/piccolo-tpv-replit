import { ConvexProviderWithHerculesAuth } from "@usehercules/auth/convex-react";
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

// When VITE_CONVEX_URL is not set, render a setup screen instead of crashing.
export function ConvexProvider({ children }: { children: React.ReactNode }) {
  if (!convexUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🍕</div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">
            Piccolo la Ràpita
          </h1>
          <p className="text-muted-foreground text-sm">
            <strong>Configuración pendiente.</strong> Para mostrar la carta, el propietario debe configurar las variables de entorno en los Secrets de Replit:
          </p>
          <div className="bg-muted rounded-lg p-4 text-left text-xs font-mono space-y-1">
            <div className="text-destructive">VITE_CONVEX_URL</div>
            <div className="text-destructive">VITE_HERCULES_OIDC_AUTHORITY</div>
            <div className="text-destructive">VITE_HERCULES_OIDC_CLIENT_ID</div>
          </div>
          <p className="text-muted-foreground text-xs">
            Contacta con el propietario del sistema para obtener estos valores del deployment de Convex/Hercules original.
          </p>
        </div>
      </div>
    );
  }

  const convex = new ConvexReactClient(convexUrl);

  return (
    <ConvexProviderWithHerculesAuth client={convex}>
      {children}
    </ConvexProviderWithHerculesAuth>
  );
}

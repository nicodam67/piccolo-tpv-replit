import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AdminDashboard from "../admin/_components/AdminDashboard.tsx";
import InstallAdminButton from "./_components/InstallAdminButton.tsx";
import { ShieldCheck } from "lucide-react";
import { useCallback } from "react";

export default function AdminPortalPage() {
  // Save return URL so after auth callback we come back here
  const handleSignInClick = useCallback(() => {
    sessionStorage.setItem("auth_return_url", "/admin");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-card px-6 py-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1
          className="text-xl font-medium text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Panel de Administración
        </h1>
        <div className="ml-auto">
          <InstallAdminButton />
        </div>
      </header>

      <AuthLoading>
        <div className="max-w-5xl mx-auto px-4 py-12 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </AuthLoading>

      <Unauthenticated>
        <div className="flex flex-col items-center justify-center py-40 gap-6 px-4 text-center">
          <ShieldCheck className="w-14 h-14 text-primary/30" />
          <div>
            <p
              className="text-2xl font-light text-foreground mb-2"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Acceso restringido
            </p>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Esta área es exclusiva para administradores. Inicia sesión para continuar.
            </p>
          </div>
          <SignInButton onClick={handleSignInClick} />
        </div>
      </Unauthenticated>

      <Authenticated>
        <AdminDashboard />
      </Authenticated>
    </div>
  );
}

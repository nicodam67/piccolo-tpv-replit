/**
 * Admin login form — email + password.
 *
 * Displayed in the <Unauthenticated> section of the admin pages.
 * Uses @convex-dev/auth/react's useAuthActions() to sign in / sign out.
 */
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { LogOut, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

// ── Login form ────────────────────────────────────────────────────────────────

export function AdminLoginForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Email o contraseña incorrectos.";
      // Provide a friendlier message for common auth errors
      setError(
        msg.includes("FORBIDDEN") || msg.includes("Invalid")
          ? "Email o contraseña incorrectos."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Heading */}
        <div className="flex flex-col items-center gap-2 text-center">
          <ShieldCheck className="w-10 h-10 text-primary/60" />
          <h2
            className="text-2xl font-light text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Acceso restringido
          </h2>
          <p className="text-sm text-muted-foreground">
            Introduce tus credenciales de administrador.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ejemplo.com"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Contraseña</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Iniciando sesión…
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Sign-out button (used inside the admin dashboard header) ──────────────────

export function SignOutButton({
  className,
}: {
  className?: string;
}) {
  const { signOut } = useAuthActions();
  const { isLoading } = useConvexAuth();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void signOut()}
      disabled={isLoading}
      className={className}
    >
      <LogOut className="w-4 h-4 mr-1.5" />
      Cerrar sesión
    </Button>
  );
}

// ── Legacy export (admin pages reference <SignInButton />) ────────────────────
// Kept to avoid updating every consumer at once; renders the login form.
export const SignInButton = AdminLoginForm;

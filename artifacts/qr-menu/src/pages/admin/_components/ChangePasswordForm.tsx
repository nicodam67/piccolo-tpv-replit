/**
 * Change password form — shown in the admin panel under the "Cuenta" tab.
 * Calls adminAuth:changePassword (Convex action) with the new password.
 */
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";

export default function ChangePasswordForm() {
  const changePassword = useAction(api.adminAuth.changePassword);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ newPassword });
      setSuccess(true);
      setNewPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cambiar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm space-y-6 py-6">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-base font-medium">Cambiar contraseña</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nueva contraseña</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirmar contraseña</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repite la contraseña"
            required
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600 flex items-center gap-1.5" role="status">
            <CheckCircle2 className="w-4 h-4" />
            Contraseña cambiada correctamente.
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando…
            </>
          ) : (
            "Guardar nueva contraseña"
          )}
        </Button>
      </form>
    </div>
  );
}

/**
 * RequirePermission — wraps a route that requires a specific permission.
 *
 * Behaviour:
 *   - Loading          → spinner
 *   - No session       → redirect to /
 *   - Missing permission → 403 screen
 *   - Has permission   → render children
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2, ShieldOff } from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';
import { hasPermission } from '../../lib/permissions';

interface Props {
  permission: string;
  children: React.ReactNode;
}

export function RequirePermission({ permission, children }: Props) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!hasPermission(user?.role, permission)) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 p-6">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldOff size={28} className="text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black mb-1">Acceso denegado</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            No tienes el permiso necesario para acceder a esta sección.
          </p>
          {user && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Permiso requerido: <span className="font-semibold font-mono">{permission}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setLocation('/tables')}
          className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors"
        >
          Ir al plano de mesas
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

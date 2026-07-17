/**
 * ProtectedRoute — wraps any route that requires a valid session.
 *
 * Behaviour:
 *   - Loading  → full-screen spinner
 *   - No session → redirect to BASE_URL (login page)
 *   - Authenticated → render children
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { isLoading, isAuthenticated } = useAuth();
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

  if (!isAuthenticated) {
    return null; // redirect happens in useEffect
  }

  return <>{children}</>;
}

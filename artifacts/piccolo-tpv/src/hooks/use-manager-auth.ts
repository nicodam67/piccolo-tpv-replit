/**
 * useManagerAuth — hook that provides manager PIN authorization for sensitive operations.
 *
 * Returns:
 *   - `requestAuth(operation, label, onAuthorized)` — opens the ManagerPinModal
 *   - `authRequest` — current pending auth request (pass to <ManagerPinModal>)
 *   - `closeAuth()` — dismisses the modal without authorizing
 *
 * Example:
 *   const { requestAuth, authRequest, closeAuth } = useManagerAuth();
 *
 *   <button onClick={() =>
 *     requestAuth('discount.large', 'Descuento > 20%', async (token) => {
 *       await applyDiscount({ ..., managerToken: token });
 *     })
 *   }>
 *     Aplicar descuento
 *   </button>
 *
 *   <ManagerPinModal request={authRequest} onClose={closeAuth} />
 */

import { useState, useCallback } from 'react';
import type { ManagerAuthRequest } from '../components/auth/ManagerPinModal';

export function useManagerAuth() {
  const [authRequest, setAuthRequest] = useState<ManagerAuthRequest | null>(null);

  const requestAuth = useCallback(
    (operation: string, label: string, onAuthorized: (token: string) => void | Promise<void>) => {
      setAuthRequest({ operation, label, onAuthorized });
    },
    []
  );

  const closeAuth = useCallback(() => {
    setAuthRequest(null);
  }, []);

  return { authRequest, requestAuth, closeAuth };
}

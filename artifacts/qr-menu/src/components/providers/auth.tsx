import { HerculesAuthProvider } from "@usehercules/auth/react";

const authority = import.meta.env.VITE_HERCULES_OIDC_AUTHORITY;
const clientId = import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID;

if (!authority || !clientId) {
  console.warn(
    "[QR Menú] Faltan variables de entorno de Hercules OIDC: " +
    "VITE_HERCULES_OIDC_AUTHORITY y VITE_HERCULES_OIDC_CLIENT_ID. " +
    "La autenticación de administrador no estará disponible hasta que se configuren."
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <HerculesAuthProvider
      authority={authority ?? "https://placeholder.hercules.app"}
      client_id={clientId ?? "placeholder"}
      userManagerSettings={{
        prompt: import.meta.env.VITE_HERCULES_OIDC_PROMPT ?? "select_account",
        response_type:
          import.meta.env.VITE_HERCULES_OIDC_RESPONSE_TYPE ?? "code",
        scope:
          import.meta.env.VITE_HERCULES_OIDC_SCOPE ??
          "openid profile email offline_access",
        redirect_uri:
          import.meta.env.VITE_HERCULES_OIDC_REDIRECT_URI ??
          `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}auth/callback`,
      }}
    >
      {children}
    </HerculesAuthProvider>
  );
}

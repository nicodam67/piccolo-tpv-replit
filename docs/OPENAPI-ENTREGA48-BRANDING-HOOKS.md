# Entrega 48 — migración de hooks Branding

## Resultado

Los tres hooks manuales de Branding y los helpers QR fueron sustituidos por el cliente
generado desde OpenAPI.

## Hooks migrados

- `useGetPublicBranding`
- `useGetAdminBranding`
- `usePatchAdminBranding`

## Helpers QR migrados

- `fetchQrBranding` → delega en `getAdminQrBranding`
- `saveQrBranding` → delega en `putAdminQrBranding`

## Consumidores

- `artifacts/piccolo-tpv/src/pages/branding.tsx` — editor admin legacy (sin cambios de firma).
- `artifacts/piccolo-tpv/src/pages/qr-menu/lib.ts` — helpers QR sobre cliente generado.
- `artifacts/piccolo-tpv/src/pages/qr-menu/QrMenuPage.tsx` — consume helpers actualizados.

## Compatibilidad

- El paquete raíz reexporta los símbolos generados mediante `branding-compat.ts`.
- `useGetAdminBranding` devuelve `AdminBranding` (tipo corregido respecto al manual).
- `usePatchAdminBranding` conserva la firma `{ data: BrandingInput }`.
- No se requirieron adaptadores de firma adicionales.

## Duplicación eliminada

`migrate-branding-generated-hooks.mjs` elimina de forma AST e idempotente las
implementaciones HTTP históricas de `generated/api.ts` y los esquemas legacy
`PublicBranding` / `BrandingInput` de `generated/api.schemas.ts`.

## Estado

- Hooks migrados: 3/3.
- Helpers QR migrados: 2/2.
- HTTP manual Branding restante en `generated/api.ts`: 0.
- Dominio Branding consolidado sobre OpenAPI.

No se modificaron contratos OpenAPI, endpoints, reglas de negocio ni base de datos.

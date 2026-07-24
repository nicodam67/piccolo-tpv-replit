# Entrega 47 — contratos Branding

## Resultado

El dominio `branding` queda contratado y validado en sus 5 operaciones. No se migraron hooks.

## Inventario del dominio

### Endpoints

| Método | Ruta | Auth | Rol |
|--------|------|------|-----|
| GET | `/public/branding` | No | Público |
| GET | `/admin/branding` | Sí | admin |
| PATCH | `/admin/branding` | Sí | admin |
| GET | `/admin/qr-branding` | Sí | admin |
| PUT | `/admin/qr-branding` | Sí | admin |

### Hooks manuales (sin migrar en esta entrega)

- `useGetPublicBranding`
- `useGetAdminBranding`
- `usePatchAdminBranding`

### Consumidores directos (fetch/customFetch)

- `artifacts/piccolo-tpv/src/pages/branding.tsx` — hooks manuales
- `artifacts/piccolo-tpv/src/pages/carta.tsx`, `carta-categoria.tsx`, `carta-imprimir.tsx`, `menu.tsx`, `order-status.tsx` — `/api/public/branding`
- `artifacts/piccolo-tpv/src/pages/qr-menu/lib.ts` — `/api/admin/qr-branding` (GET/PUT)
- `artifacts/piccolo-tpv/e2e/certification-modules.spec.ts` — smoke público

## Contratos completados

- Branding público con respuesta 200 y fail-closed 503 (`QR_NOT_CONFIGURED`) en producción.
- Branding admin legacy (`GET`/`PATCH /admin/branding`).
- Branding QR completo (`GET`/`PUT /admin/qr-branding`).

Todas las operaciones autenticadas documentan `bearerAuth` + `cookieAuth`, rol `admin` y respuestas reales `401`, `403` y `503`.

## Esquemas alineados

- `PublicBrandingResponse`, `AdminBranding`, `BrandingInput`
- `QrBranding`, `UpdateQrBrandingInput`, `QrBrandingOkResponse`
- `OpeningHours`, `BrandingThemeColors`, `BrandingThemeFonts`, `BrandingCardSettings`, `QrDaySchedule`, `QrShift`
- `QrNotConfiguredError`

## Evidencia

- `branding-openapi-contract.test.ts` recorre 5/5 operaciones.
- Cliente aislado en `branding-generated` con codegen doble determinista.
- Auditoría OpenAPI sin rutas Branding pendientes.

## Preparación Entrega 48

El dominio está listo para migrar sus 3 hooks manuales y los helpers QR (`fetchQrBranding` / `saveQrBranding`) en la siguiente entrega.

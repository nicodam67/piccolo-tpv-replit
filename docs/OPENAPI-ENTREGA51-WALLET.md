# Entrega 51 — contratos Wallet / Gift Cards

## Resultado

El dominio Wallet / Gift Cards queda contratado y aislado en 11 operaciones con tag
`phase51-wallet`. No se migraron hooks.

## Inventario

### Alcance del dominio

Rutas bajo CRM sin duplicar paths:

- **Tarjetas regalo (7):** `crm.ts`
- **Monedero (4):** `loyalty-extended.ts`

### Hooks (11 en `crm-generated`, 0 manuales en `generated/api.ts`)

**Ya en `crm-compat` (Entrega 50):**
- `useGetCrmGiftCards`, `useCreateCrmGiftCard`, `useRechargeCrmGiftCard`, `usePayWithCrmGiftCard`

**Pendientes de migrar (Entrega 52):**
- `useLookupCrmGiftCard`, `useGetCrmGiftCard`, `useBlockCrmGiftCard`
- `useGetCrmClientWallet`, `useAddCrmWalletBalance`, `usePayWithCrmWallet`, `useAdjustCrmWallet`

### Consumidores

- `artifacts/piccolo-tpv/src/pages/crm.tsx` — HTTP manual (`api.get`/`api.post`) en pestaña Tarjetas
- Sin consumidores de monedero en UI (solo tests backend)

## Contratos

- Tag `phase51-wallet` añadido a las 11 operaciones (convive con `phase49-crm`)
- Cliente Orval aislado: `wallet-generated`
- Autenticación `bearerAuth` + `cookieAuth`, RBAC documentado, códigos HTTP alineados al runtime

## Preparación Entrega 52

Listo para migrar los 7 hooks pendientes y sustituir HTTP manual en `crm.tsx`.

# Entrega 52 — migración de hooks Wallet / Gift Cards

## Resultado

Los 7 hooks pendientes y el HTTP manual de tarjetas regalo quedan consolidados sobre
`wallet-generated` vía `wallet-compat.ts`.

## Hooks migrados (7/7)

- `useLookupCrmGiftCard`
- `useGetCrmGiftCard`
- `useBlockCrmGiftCard`
- `useGetCrmClientWallet`
- `useAddCrmWalletBalance`
- `usePayWithCrmWallet`
- `useAdjustCrmWallet`

## Consumidores actualizados

- `artifacts/piccolo-tpv/src/pages/crm.tsx` — pestaña Tarjetas Regalo usa funciones
  `getCrmGiftCards`, `getCrmGiftCard`, `createCrmGiftCard`, `rechargeCrmGiftCard`,
  `blockCrmGiftCard` desde `@workspace/api-client-react/wallet`

## Compatibilidad

- `wallet-compat.ts` reexporta 76 símbolos desde `wallet-generated` (11 operaciones)
- Gift cards retirados de `crm-compat.ts` (ahora solo en `wallet-compat`)
- Sin adaptadores de firma adicionales

## Estado

- Hooks pendientes migrados: 7/7
- HTTP manual gift-cards en `crm.tsx`: 0
- Dominio Wallet / Gift Cards consolidado sobre OpenAPI

No se modificaron contratos OpenAPI, endpoints, reglas de negocio ni base de datos.

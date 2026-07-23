# Entrega 42 — consolidación de hooks del dominio floor

## Inventario

El bloque histórico contenía 19 hooks manuales para operaciones ya documentadas en
Orders, Tables y KDS. Los seis consumidores del repositorio ya usan
`@workspace/api-client-react/phase1`.

### Migración inmediata

- `useUpdateOrder`
- `useUpdateOrderItem`
- `useDuplicateOrderItem`
- `useGetOrderAudit`
- `useCreatePrefacturaPrint`
- `useGetPrefacturaStatus`
- `useGetTableHistory`
- `useGetOccupationSummary`
- `useGetAlertConfig`
- `usePatchAlertConfig`
- `useCleanTable`
- `useTransferTable`
- `useMergeTables`
- `useSeparateTable`
- `useMoveItems`
- `useTransferWaiter`
- `useResendKitchenTask`
- `useGetKdsHistory`

### Pequeña adaptación

- `useBlockTable`: el cliente generado coloca `reason` dentro de `data`. El consumidor actual
  todavía no invoca la mutación. El export raíz conserva la firma histórica
  `{ tableId, reason? }` mediante un adaptador tipado que delega en el cliente generado.

### Bloqueados

Ninguno dentro del dominio de Entrega 41. Los 120 hooks sin contrato pertenecen a dominios
posteriores y permanecen intactos.

## Eliminación de duplicación

`migrate-floor-generated-hooks.mjs` elimina de forma AST y determinista las declaraciones
duplicadas del cliente histórico. `phase1-compat.ts` vuelve a exportar los mismos símbolos desde
el cliente Orval para conservar compatibilidad con imports existentes o externos.

Resultado:

- Hooks manuales iniciales: 160.
- Hooks manuales eliminados en esta fase: 19.
- Hooks manuales restantes: 141.
- Hooks manuales sin contrato fuera de alcance: 120.
- Hooks usados desde el cliente parcial: 24 en 6 archivos.

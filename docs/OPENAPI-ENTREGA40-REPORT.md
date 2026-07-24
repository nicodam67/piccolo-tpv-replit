# Entrega 40 — informe final OpenAPI y clientes

## 1. Resumen

Se creó un inventario determinista y versionado de endpoints y consumidores, se reforzó la
auditoría de cobertura y se documentaron exclusiones y licencias. La entrega no puede cerrarse:
el contrato sigue cubriendo 69 de 622 registros de ruta y el codegen elimina clientes históricos.

## 2. Rama

`cursor/complete-openapi-clients-a8c8`

## 3. Commit final

Se completa al cerrar la rama.

## 4. Inventario total

- 622 registros de ruta, incluidos dos `router.all`.
- 608 activos.
- 14 obsoletos explícitos o sentinelas de compatibilidad.
- 0 duplicados detectados.

Fuente: `artifacts/api-endpoint-inventory.json`.

## 5. Total documentado

- 69 operaciones OpenAPI.
- 553 registros sin operación OpenAPI.
- Cobertura bruta: 11,1%.

## 6. Exclusiones

Dos sentinelas `ALL /tablet/device/:token*` que responden 410. La justificación, propietario y
condición de revisión están en `lib/api-spec/endpoint-exclusions.json`. No se excluyeron endpoints
activos para aumentar artificialmente la cobertura.

## 7. Duplicados u obsoletos

- Duplicados: 0.
- Obsoletos/sentinelas detectados: 14.
- No se eliminó ninguno: el análisis estático no demuestra ausencia de consumidores externos.

## 8. Clientes manuales iniciales

- 202 hooks exportados.
- 160 hooks añadidos en el bloque histórico manual.
- 135 hooks manuales sin operación OpenAPI equivalente.
- 84 llamadas `fetch`, 84 `customFetch`, 210 mediante wrapper `api` y 95 Convex.

## 9. Hooks migrados

0. Migrarlos sin contrato respaldado inventaría URLs o tipos y rompería la regla de fuente única.

## 10. Adaptadores conservados

9 archivos clasificados como transporte, offline, tablet o integración Convex. Detalle en
`docs/API-CLIENT-MIGRATION.md`.

## 11. Pendientes

- Documentar 553 registros de ruta.
- Validar bodies/responses de 551 endpoints históricos.
- Migrar 135 hooks sin contrato y 96 archivos con HTTP manual.
- Resolver 159 bodies tipados inline, joins, informes y respuestas dependientes de rol.

## 12. Archivos creados

- `artifacts/api-server/scripts/generate-api-inventory.ts`
- `artifacts/api-server/scripts/generate-api-client-inventory.ts`
- `artifacts/api-endpoint-inventory.json`
- `artifacts/api-client-inventory.json`
- `docs/API-ENDPOINT-INVENTORY.md`
- `docs/API-CLIENT-MIGRATION.md`
- `docs/API-LICENSE-REVIEW.md`
- `lib/api-spec/endpoint-exclusions.json`
- `docs/OPENAPI-ENTREGA40-REPORT.md`

## 13. Archivos modificados

- `artifacts/api-server/package.json`
- `artifacts/api-server/scripts/audit-openapi-coverage.ts`

## 14. Pruebas ejecutadas

- Generación doble de inventarios.
- Auditoría OpenAPI/Express.
- Codegen Orval en worktree aislado.
- TypeScript y build después del codegen aislado.
- API con PostgreSQL real, E2E, concurrencia, idempotencia y carga.
- Restore completo en PostgreSQL staging.
- TypeScript, ESLint, builds, rutas y dependencias.

## 15. Resultados exactos

- Inventarios: hashes idénticos en dos generaciones.
- OpenAPI: 69/622.
- Duplicados Express: 0.
- Codegen: 71 archivos modificados y 34 nuevos.
- TypeScript tras codegen: fallo por exports eliminados.
- Build tras codegen: fallo por hooks y tipos inexistentes.
- API PostgreSQL: 43 suites y 660 pruebas correctas.
- Playwright: 26 pruebas correctas.
- Restore: 164 tablas, 3 secuencias, checksum, repetición y rollback correctos.
- Dependencias de producción: sin vulnerabilidades conocidas.
- TypeScript, ESLint y builds del árbol conservado: correctos.

## 16. Generación determinista

Los inventarios son deterministas. La generación del cliente no está certificada: la primera
regeneración no compila, por lo que no procede validar una segunda como si fuera correcta.

## 17. CI

La auditoría detecta rutas ausentes, rutas inexistentes, métodos, `operationId` duplicados,
paths YAML duplicados y exclusiones inválidas. No se activó el modo estricto como gate principal
porque dejaría toda la rama permanentemente roja con 553 omisiones; el bloqueo queda explícito.

## 18. Licencias

`@replit/connectors-sdk` y `buffers` no declaran licencia verificable en el paquete inspeccionado.
`lightningcss`, `caniuse-lite` y `jszip` requieren conservar avisos/elección aplicable. No se afirma
compatibilidad legal definitiva. Ver `docs/API-LICENSE-REVIEW.md`.

## 19. Riesgos restantes

- OpenAPI no es fuente única.
- Regenerar borra 135 hooks sin contrato.
- 96 archivos conservan HTTP manual no justificado por operación OpenAPI.
- La mayor parte de endpoints no tiene validación runtime derivada del contrato.
- No existe evidencia suficiente para inventar de forma segura 553 contratos.

## 20. Decisión final

**NO-GO**

## 21. Confirmación de alcance

No hubo migraciones, merge, funcionalidades nuevas ni inicio de Entrega 41.

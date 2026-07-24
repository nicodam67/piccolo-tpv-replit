# PROJECT_STATE

Fuente resumida para agentes y desarrolladores. Leer este archivo antes de explorar el repositorio.
La fuente editable es `project-state.json`; regenerar con `pnpm state:update`.

## Estado actual

- Última entrega: 45
- Resumen: Reservations core contratado y preparado para migrar hooks.
- Endpoints detectados: 622
- Operaciones OpenAPI: 98
- Endpoints marcados como documentados: 98
- Hooks manuales migrados: 37
- Hooks históricos restantes: 123
- Hooks sin contrato: 115

## Dominios consolidados o contratados

| Dominio | Estado | Contratos | Hooks manuales migrados | Notas |
|---|---|---:|---:|---|
| Orders / Tables / Rooms / KDS | consolidated | 49/49 | 19 | Generado mediante phase1-floor; seis archivos consumen 24 hooks generados. |
| Documents | consolidated | 18/18 | 18 | Plantillas, impresoras documentales, facturas, clientes fiscales, reimpresiones y auditoría. |
| Reservations core | contracted | 8/8 | 0 | Cinco hooks históricos están preparados para migrarse. Lista de espera, turnos y depósitos son dominios separados. |

## Hooks migrados

- Orders / Tables / Rooms / KDS: 19 hooks manuales migrados.
- Documents: 18 hooks manuales migrados.
- Reservations core: 0 hooks manuales migrados.

## Decisiones arquitectónicas

- Los contratos OpenAPI se completan y prueban por dominio antes de migrar hooks.
- Orval genera clientes aislados por dominio consolidado; la regeneración global destructiva permanece deshabilitada.
- La poda AST elimina duplicados históricos solo después de migrar todos sus consumidores.
- Los barrels de compatibilidad tipados preservan la API pública del paquete raíz.
- Se documenta el comportamiento runtime existente sin cambiar silenciosamente reglas de negocio.
- Solo se reaudita el dominio afectado salvo dependencia compartida demostrada.

## Política de exploración

1. Revisar únicamente los archivos del dominio afectado.
2. No reauditar dominios `consolidated` salvo dependencia demostrable en código o fallo.
3. Consultar inventarios JSON antes de búsquedas amplias.
4. No ejecutar suites globales durante iteraciones locales.

## Perfiles de validación

| Perfil | Uso |
|---|---|
| `docs` | Solo whitespace, consistencia y determinismo. |
| `domain` | Typecheck de paquetes afectados, pruebas y codegen del dominio. |
| `shared` | Typecheck/lint global y build de paquetes afectados, más regresiones focalizadas. |
| `phase` | Build global, API PostgreSQL completa, E2E, restore y auditorías. |

Seleccionar el perfil con `pnpm validate:change -- --profile <perfil>`.
Las validaciones completas quedan reservadas para cierres de fase, cambios compartidos o riesgo real.

## Pendientes

- Migrar los cinco hooks de Reservations al cliente generado.
- Contratar y migrar por dominios los 115 hooks todavía sin contrato.
- Contratar por separado lista de espera, turnos, depósitos y agregados Director de reservas.
- Completar la certificación física de impresoras, KDS, TPV, NFC, NAS y S3.

## Entregas recientes

- Entrega 45: Reservations core seleccionado y contratado.
- Entrega 44: Hooks manuales Documents sustituidos por clientes generados.
- Entrega 43.1: Contratos Documents completados y certificados.
- Entrega 43: Migración Documents detenida hasta completar contratos.
- Entrega 42: Hooks manuales del dominio floor sustituidos por clientes generados.
- Entrega 41: Contratos OpenAPI de sala, mesas, pedidos y KDS completados.

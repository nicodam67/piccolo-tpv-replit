# Entrega 39 — certificación final de producción

Fecha: 2026-07-23. Rama: `cursor/production-certification-a8c8`.

## Evidencia automatizada

- API con PostgreSQL real: 43 suites, 660 pruebas, 0 fallos.
- Playwright E2E: 26 pruebas, 0 fallos.
- Restore real: 164 tablas, 3 secuencias, restore repetido, rollback y conexión limpia.
- TypeScript, ESLint, builds y auditoría de rutas: correctos.
- Dependencias de producción: 0 vulnerabilidades conocidas.
- Carga local, 50 peticiones por módulo, concurrencia 10, 0 errores:
  - TPV/pedidos p95 22,1 ms.
  - QR p95 13,0 ms.
  - Reservas p95 12,0 ms.
  - Impresión p95 8,5 ms.
  - Stock p95 13,0 ms.

## Auditoría funcional

| Módulo | Estado | Cobertura | Dependencia/riesgo |
|---|---|---|---|
| TPV | Aprobado automatizado | API + E2E | PostgreSQL/Socket.IO |
| Sala | Aprobado automatizado | zonas, layouts, concurrencia | pantallas físicas pendientes |
| Mesas | Aprobado automatizado | estados, apertura y cobro | dispositivos reales pendientes |
| Cocina | Aprobado automatizado | KDS y transiciones | estación física pendiente |
| Pizza | Aprobado automatizado | estado `in_oven` | estación física pendiente |
| Ensaladas | Aprobado automatizado | KDS | estación física pendiente |
| Barra | Aprobado automatizado | KDS | estación/impresora pendiente |
| KDS | Aprobado automatizado | API, sockets y E2E | cinco estaciones sin validar |
| Delivery | Aprobado automatizado | 12 pruebas PG + smoke E2E | courier real pendiente |
| Pedidos online | Aprobado automatizado | atomicidad/idempotencia PG | pago live no validado |
| QR Menu | Aprobado automatizado | firma, expiración, invalidación | escaneo móvil físico pendiente |
| Reservas | Aprobado automatizado | creación, conflicto, E2E | sin dependencia externa |
| CRM | Aprobado automatizado | API + E2E | sin dependencia externa |
| Fidelización | Aprobado automatizado | 31 pruebas + E2E RBAC | códigos gift-card: vigilar colisión |
| Caja | Aprobado automatizado | apertura, cobro, cierre | hardware físico pendiente |
| Fichaje | Parcial | seguridad, registros y settings | NFC/tablet/offline físico pendiente |
| Impresión | Aprobado en simulación | cola, routing y carga | ESC/POS real pendiente |
| Administración | Aprobado automatizado | rutas/RBAC | revisión operativa de paneles |
| Backups | Aprobado local/mocks | local, NAS local, S3 mock | NAS/S3 reales pendientes |
| Restauración | Aprobado staging | restore completo/rollback | parcial solo vía staging |
| Configuración | Aprobado automatizado | env/fail-closed | secretos finales pendientes |
| RBAC | Aprobado automatizado | roles y denegaciones E2E | revisión de usuarios reales |
| API pública/interna | Funcional, contrato no certificado | 620 endpoints auditados | OpenAPI incompleto |

## Incidencias encontradas y corregidas

1. La cabecera `X-Simulator-Scenario` podía causar 503 en caja real: ahora se ignora en producción.
2. Una sesión QR abierta sobrevivía a cambios de mesa/restaurante: ahora queda vinculada a ambas versiones.
3. Dos polls podían reiniciar simultáneamente un pago físico: recuperación serializada y con ownership temporal.
4. Stripe estaba importado sin dependencia declarada: dependencia runtime añadida.
5. Vulnerabilidad transitiva `uuid`: resolución forzada a versión corregida.
6. `@types/bcryptjs` obsoleto: eliminado.

## Seguridad

- Sin hallazgos críticos o altos tras las correcciones.
- Producción mantiene simuladores fail-closed.
- SQL dinámico, path traversal de backup, secretos, logs, RBAC e idempotencia revisados.
- Riesgo pendiente: pruebas CSRF/XSS completas en navegador y hardware quedan operativas, no automatizadas.

## OpenAPI

- Express: 620 endpoints detectados.
- OpenAPI: 69 endpoints.
- Cobertura: 11,1%.
- Rutas OpenAPI inexistentes en Express: ninguna relevante detectada.
- 551 endpoints no están documentados; 135 hooks del cliente son extensiones históricas.
- `codegen` no puede considerarse fuente de verdad completa sin perder esos clientes.

Este punto incumple el criterio de “sin inconsistencias” y bloquea la certificación.

## Hardware

No disponibles en cloud: impresoras ESC/POS, estaciones KDS, NAS, S3 real, caja automática,
lectores NFC, tablets ni TPV físicos. El procedimiento futuro está en
`docs/HARDWARE-CERTIFICATION.md`. El impacto es que no se certifican latencia LAN,
drivers, cortes, reinicios ni recuperación física.

## Dependencias y licencias

- Auditoría de producción: sin vulnerabilidades conocidas.
- Auditoría completa: solo avisos de desarrollo bajos/moderados.
- No se detectaron licencias GPL/AGPL-only.
- Revisión legal pendiente para paquetes con licencia `Unknown`, especialmente
  `@replit/connectors-sdk` y `buffers`.

## Backups

- Cifrado GCM, checksum, manifest, secuencias y rollback: aprobados.
- Restore staging repetido: aprobado.
- Local/NAS: round-trip automatizado.
- S3: cliente y mock automatizado aprobados.
- NAS y S3 reales: pendientes por ausencia de infraestructura/credenciales.
- Restauración parcial se realiza únicamente restaurando en staging y exportando selectivamente.

## Riesgos restantes

1. OpenAPI cubre únicamente 11,1% del backend.
2. Certificación física no ejecutada.
3. S3/NAS reales, Stripe live, VeriFactu y caja automática no validados.
4. Fichaje offline/NFC requiere pruebas de campo.
5. Licencias desconocidas requieren aprobación legal.

## Decisión

**NO-GO**

El runtime automatizado es estable, pero OpenAPI, hardware y destinos externos incumplen
requisitos explícitos de certificación. No se autoriza producción hasta cerrar esas evidencias.

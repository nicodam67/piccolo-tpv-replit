# Entrega 64 — Certificación de Producción

## Decisión

**NO APTO PARA PRODUCCIÓN.**

El núcleo operativo supera la simulación integral local, pero faltan condiciones externas imprescindibles para un restaurante real: impresión/hardware certificado, conexión fiscal productiva y un pipeline global OpenAPI/codegen coherente. Además, `pnpm audit --prod` detecta dos vulnerabilidades altas.

## Evidencia ejecutada

| Validación | Resultado |
|---|---|
| PostgreSQL efímero + 27 migraciones | OK |
| Tests API con integración DB | 61 archivos, 752 tests aprobados |
| Playwright API E2E | 26/26 aprobados |
| Rendimiento | 250 requests, 0 errores; peor p95 18,9 ms |
| Restore staging aislado | OK; 164 tablas, restore repetido y rollback |
| Seguridad focalizada | 81/81 tests |
| Auditoría de rutas | 63 routers, 0 endpoints sensibles sin guard |
| Migraciones en DB local | ledger válido |
| TypeScript | OK |
| ESLint global | OK |
| Builds API/TPV/QR | OK con observaciones de bundles/fonts |
| Auditoría OpenAPI | 279/622 endpoints, 46,5%; 0 IDs/paths duplicados |
| Stamp codegen global | **FALLA** |
| Dependencias producción | **2 high** |

La simulación `run-e2e-staging-local.sh` cubrió login admin/waiter, PIN inválido, apertura/cierre de caja, mesa, pedido, producto, envío, KDS accesible, pago, liberación de mesa, ticket/factura, QR, reserva, CRM/loyalty, fichaje, configuración, impresión/backup administrativos y limpieza demo.

## Estado por módulo

| Módulo | Estado | Evidencia / observación |
|---|---|---|
| TPV | Listo con observaciones | Flujo mesa→pedido→KDS→pago aprobado; sin E2E visual de navegador |
| QR Menu | Listo con observaciones | Sesión pública/menu aprobados; producción exige configuración real y assets de fuentes |
| Reservas | Listo para producción | CRUD/conflictos y E2E PostgreSQL aprobados |
| CRM | Listo con observaciones | Contrato e integración aprobados; consumidores aún mezclan cliente generado y manual |
| Fidelización | Listo con observaciones | Configuración y tests pasan; earn/redeem completo no está en E2E |
| Caja | Listo para producción | Locks, arqueo, cierre, replay y PostgreSQL real aprobados |
| Pagos | Listo con observaciones | Pago completo y concurrencia aprobados; parcial/mixto/split cubiertos por suites, no E2E |
| KDS | Listo con observaciones | FSM y tests pasan; hardware y correspondencia `prepZone` pendientes |
| Impresión | **No listo** | Cola/worker probados, pero no existe certificación/conector físico productivo |
| Usuarios | Listo para producción | Login/PIN/HR y escalado de privilegios probados |
| Roles | Listo con observaciones | RBAC y overrides probados; auditoría global de 403 incompleta |
| Fichaje | Listo con observaciones | API/ownership pasan; NFC/tablet reales y fichaje móvil no certificados |
| Configuración | Listo con observaciones | Migraciones/config funcionan; go-live requiere completar `business_config` y secretos |
| Idiomas | Listo con observaciones | Soporte distribuido, sin módulo central |
| Branding | Listo para producción | Contrato corregido para nullables y tests DB aprobados |
| Mesas | Listo para producción | Estados, apertura, pago y liberación aprobados |
| Salas | Listo para producción | CRUD/layouts y tests aprobados |
| Productos | Listo con observaciones | CRUD/contrato; traducciones se administran principalmente desde QR |
| Categorías | Listo con observaciones | CRUD/jerarquía; UI legacy sin edición multidioma |
| Modificadores | Listo con observaciones | CRUD y consumo TPV; cobertura E2E limitada |
| Traducciones | Listo con observaciones | JSONB/adaptadores/QR disponibles; no uniforme en todas las pantallas |

## Flujos críticos

| Flujo | Resultado |
|---|---|
| Apertura/cierre/arqueo de caja | E2E + PostgreSQL |
| Abrir mesa, añadir producto, enviar | E2E |
| Modificadores | Tests focalizados; no E2E |
| KDS | Estados en tests; listado E2E |
| Impresión | Worker/simulador; **hardware no validado** |
| Cobro completo | E2E |
| Pago parcial/mixto/split | Tests focalizados; no E2E |
| Cierre/liberación de mesa | E2E |
| QR Menu | E2E |
| Reserva | E2E |
| Reserva→mesa | Test transaccional; no E2E |
| CRM/fidelización | API E2E parcial + suites |
| Fichaje | API E2E parcial + seguridad |
| Login y recuperación | E2E + auth/idempotencia/socket/backup tests |

## Incidencias críticas

### C1 — Hardware y conectores físicos no certificados

- **Evidencia:** caja automática solo tiene `SimulatorAdapter`; print simulator falla cerrado en producción; no prueba ESC/POS, KDS físico, NFC/tablet o NAS.
- **Impacto:** el restaurante puede quedar sin impresión o cobro físico.
- **Solución:** certificar dispositivos reales y conectores en staging físico.
- **Prioridad:** bloqueante antes de go-live.

### C2 — VeriFactu productivo incompleto

- **Evidencia:** producción rechaza simulador/sin certificado; tickets quedan `pending` y no existe puente demostrado hacia `verifactu_records`.
- **Impacto:** riesgo fiscal y de envío AEAT.
- **Solución:** configurar certificado real, implementar/certificar puente ticket→registro y ejecutar sandbox/producción controlada.
- **Prioridad:** bloqueante para despliegues sujetos a VeriFactu.

### C3 — Gate global OpenAPI/codegen rojo

- **Evidencia:** `check-codegen.sh` falla; hash almacenado `37b2ecda…`, actual `ab8f1ce7…`. Cobertura 46,5%.
- **Impacto:** riesgo de publicar frontend y backend con contratos globales diferentes.
- **Solución:** completar consolidación de dominios, hacer viable el codegen monolítico o sustituir el stamp por gates deterministas por dominio.
- **Prioridad:** bloqueante del pipeline de release.

## Incidencias altas

### H1 — Dos vulnerabilidades de dependencias

- **Evidencia:** `brace-expansion` vulnerable vía `exceljs/archiver`; `pnpm audit --prod` devuelve 2 high.
- **Impacto:** expansión maliciosa puede agotar memoria.
- **Solución:** actualizar cadena `exceljs/archiver/minimatch` o aplicar override compatible validado.

### H2 — Offline cash payment es un stub

- **Evidencia:** sync reconoce `cash_payment` sin crear pago.
- **Impacto:** no existe reconciliación fiable de cobros offline.
- **Solución:** mantener deshabilitado en producción o implementar ledger idempotente antes de ofrecerlo.

### H3 — Sin certificación de destinos backup externos ni rollback SQL

- **Evidencia:** restore local pasa, pero NAS/S3 real no fue probado; migraciones son forward-only.
- **Impacto:** recuperación real no demostrada ante pérdida de infraestructura.
- **Solución:** drill S3/NAS real y procedimiento de rollback/forward-fix aprobado.

## Incidencias medias

- `prepZone` de catálogo puede terminar en `sin_partida`; validar catálogo real contra estaciones KDS.
- Setup usa IDs `efectivo/tarjeta`, mientras runtime usa `cash/card`.
- UI de pago exige caja abierta para todos los métodos; backend solo la exige para efectivo.
- Notificaciones de clientes/online no tienen proveedor productivo.
- Índices no demostrados en `print_queue.status`, KDS y joins calientes; ejecutar `EXPLAIN` con volumen real.
- Online orders y splits contienen patrones N+1.
- KDS usa timers por tarea y varias pantallas crean sockets independientes.
- Falta CSP y auditoría centralizada de denegaciones 403.
- QR build deja cinco fuentes custom sin resolver hasta runtime.
- No hay tests Playwright visuales; los 26 E2E son API-level.

## Incidencias bajas

- Documentación/audit catalog contienen findings ya cerrados.
- Rutas legacy 410 siguen registradas intencionadamente.
- Bundles TPV/QR superan límites recomendados.
- No existe monitor externo de `/healthz` versionado en infraestructura.

## Correcciones aplicadas durante la certificación

Sin cambiar lógica de negocio:

- nullabilidad real en contratos Branding y Delivery;
- regeneración determinista de clientes de dominio;
- aislamiento/cleanup de fixtures CRM, Wallet, Branding y concurrencia Cash;
- fixture Cash autosuficiente para PostgreSQL recién migrado.

## Riesgos de configuración para go-live

Antes de producción deben estar presentes `DATABASE_URL`, secretos de sesión/QR ≥32 caracteres, `RESTAURANT_ID`, origins y destinos backup. Deben estar ausentes flags demo/simulador. `BOOTSTRAP_SECRET` debe retirarse tras crear el primer admin. El menú QR falla cerrado si negocio/catálogo no están configurados.

## Recomendación

No desplegar todavía en un restaurante real. El software core supera la simulación funcional, de concurrencia, seguridad, rendimiento y restore, pero los bloqueos C1–C3 y H1 impiden certificar una operación productiva completa.

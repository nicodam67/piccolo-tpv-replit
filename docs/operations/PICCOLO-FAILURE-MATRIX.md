# Piccolo — Matriz de fallos operativos

`PENDING_PHYSICAL_CERTIFICATION` significa que la evidencia software no certifica el dispositivo o servicio externo.

| Incidente | Detección | Impacto | Comportamiento actual | Fail | Auto | Recuperación manual | Duplicidad | Financiero | Fiscal | Evidencia | Prueba física | Propietario |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Impresora | Cola `retrying/error` | Cocina/ticket sin papel | 3 intentos, fallback y error | closed en prod sin conector | Parcial | Retry/reprint controlado | Medio | Bajo | Bajo | `print-worker.ts` | PENDING: apagada, papel, timeout, fallback | Encargado/IT |
| KDS | Banner/socket + lista vacía | Partida no recibe | Socket reconnect + polling | closed si API cae | Parcial | Refresco/reenvío de tarea | Medio | Bajo | Bajo | `kds.tsx`, tests KDS | PENDING: pantalla/red real | Encargado |
| Socket | Estado desconectado | Actualización tardía | Reconecta y refetch | degraded | Sí | Refresco único | Bajo | Bajo | Bajo | socket tests | PENDING: pérdida LAN | IT |
| Wi‑Fi | Banner offline/health | Tablets aisladas | Shell PWA parcial; operaciones offline no cableadas | mixed | Parcial | Cambio AP/operación manual | Alto | Alto | Medio | SW/offline audit | PENDING: 7 dispositivos | IT |
| Internet | Servicios externos | Fiscal/cloud/monitor | Flujos LAN pueden seguir | mixed | No | Contingencia aprobada | Medio | Medio | Alto | connector gates | PENDING: corte WAN | Propietario/IT |
| PostgreSQL | 503 general | TPV no operativo | Auth/permisos fallan cerrado | closed | No | Operación manual + soporte | Alto | Alto | Alto | fail-closed tests | Staging failure drill | IT |
| Servidor | `/healthz` caído | Sistema completo | Reinicio recupera DB queues; `sending` puede quedar | mixed | Supervisor externo | Revisar cola/estado | Alto | Alto | Alto | worker audit | PENDING: reinicio real | IT |
| NAS | Backup failure | Sin copia local externa | Destino mount falla; DB sigue | closed para backup prod | No | Restaurar montaje/reintentar | Ninguno | Medio | Medio | destination code | PENDING: NAS real | IT |
| S3 | SDK/checksum error | Sin copia cloud | Operación falla; mock únicamente probado | closed | No | Credencial/red + retry | Ninguno | Medio | Medio | backup tests mocked | PENDING: bucket real | IT |
| Terminal tarjeta | Sin confirmación externa | Cobro ambiguo manual | Solo método contable manual | manual | No | Conciliación externa | Alto | Alto | Medio | sin adapter | PENDING: TPE elegido | Encargado |
| Caja automática | 503/status incierto | Dinero físico incierto | Simulador; producción bloqueada; reconcile API | closed | Poll parcial | Reanudar/conciliar | Alto | Crítico | Medio | cash-machine tests | PENDING: dispositivo real | Encargado/IT |
| Cajón | No abre | Operación efectivo lenta | No comando ESC/POS real | unsupported | No | Apertura manual autorizada | Bajo | Medio | Bajo | print audit | PENDING: cajón real | Encargado |
| Tablet | Device revoked/offline | Camarero sin terminal | Sesión/token/reconnect; PWA sin cert | mixed | Parcial | Cambiar/revocar/re-pair | Medio | Medio | Bajo | auth/tablet tests | PENDING: D1–D7 | Admin |
| Token | 401/revoked | Sesión/dispositivo bloqueado | JWT/device token fail-closed | closed | No | Login/re-pair autorizado | Bajo | Bajo | Bajo | auth tests | PENDING: pérdida dispositivo | Admin |
| Pago normal | 409/timeout | Pedido no liquidado | Locks/idempotencia; estado backend autoritativo | closed | Replay parcial | Consultar antes de reintentar | Alto | Crítico | Medio | payment/concurrency tests | Servicio completo | Encargado |
| Fiscalidad | pendiente/rechazado | Sin envío legal | Ticket no puenteado; prod connector bloqueado | closed | Worker incompleto | Contingencia fiscal externa | Medio | Alto | Crítico | VeriFactu audit | PENDING: certificado/AEAT | Propietario/fiscal |
| Backup | failed/corrupted | RPO incumplido | Cifrado/checksum/manifest | closed | Alertas parciales | Nueva copia + dry-run | Ninguno | Alto | Alto | restore drill | PENDING: destino real | Admin/IT |
| Restore | checksum/rollback | Servicio no recupera | Transacción y rollback software validados | closed | No | Restore staging autorizado | Bajo | Crítico | Alto | 164-table drill | PENDING: NAS/S3 source | IT |
| Offline cash | `offline_cash_payment_unsupported` | No cobro offline | Se conserva como failed, sin ledger | closed | No | Cobro online/manual autorizado | Bajo | Crítico | Medio | E65 PG integration | No certificar | Propietario |

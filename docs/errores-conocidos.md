# Errores Conocidos y Hallazgos de Auditoría

> Generado automáticamente desde la tabla `audit_findings`.  
> Última actualización: 2026-07-17  
> Estado: los registros marcados como **resueltos** tienen fecha de resolución. Los demás están **abiertos**.

---

## Resumen

| Severidad | Total | Abiertos |
|-----------|-------|----------|
| 🔴 Critical | 0 | 0 |
| 🟠 High | 0 | 0 |
| 🟡 Warning | 16 | 16 |
| 🟢 OK | — | — |

---

## Hallazgos abiertos

### 🟡 Warning

| Módulo | Título | Descripción | Detectado | Acción recomendada |
|--------|--------|-------------|-----------|-------------------|
| `devices` | Offline devices sin metadatos de red | La tabla `offline_devices` solo almacena nombre, fingerprint y estado de sincronización — sin IP, MAC, zona asignada, impresora por defecto ni permiso de cobro por dispositivo. | 2026-07-17 | Añadir columnas IP, MAC, zona y permisos a `offline_devices`. Tarea pendiente en backlog. |
| `gift_cards` | Sin constraint único en códigos de tarjeta regalo | Sin generación de código único garantizada por constraint de BD — dos emisiones simultáneas pueden producir el mismo código si la colisión ocurre antes del INSERT. | 2026-07-17 | Añadir `UNIQUE` constraint a `gift_cards.code`. Task #173 en backlog. |
| `iva` | Productos sin tipo de IVA asignado usan 10% silenciosamente | El IVA se hereda del producto en el momento de añadir el ítem, pero no existe validación de que todos los productos tengan un tipo asignado — productos sin `taxRate` usan el defecto 10% silenciosamente. | 2026-07-17 | Añadir validación en el formulario de producto y alertar en el sistema si hay productos sin `taxRate`. |
| `kds` | KDS sin reconexión automática del WebSocket | Sin reconexión automática del servidor WebSocket — KDS debe recargarse manualmente tras desconexión. | 2026-07-17 | Implementar lógica de reconexión exponencial en el cliente KDS. Task #93 en backlog. |
| `kds` | Valores de `prepZone` en productos no coinciden con constantes KDS | `prepZone` en productos usa valores que no coinciden con constantes KDS (`frío`, `postres`, `sala` → sin ruta KDS válida). | 2026-07-17 | Normalizar los valores de `prepZone` a las constantes `cocina`, `barra`, `pastelería` y validar en el formulario de producto. Task #186 en backlog. |
| `kds` | Máquina de estados única para todas las partidas | Máquina de estados única para todas las partidas — Pizza no tiene estado "En horno", Barra no diferencia "Preparando"/"Listo". | 2026-07-17 | Diseñar estados por tipo de partida. Task #213 en backlog. |
| `offline` | Orden de sincronización no garantizado en cola larga | El modo offline sincroniza operaciones pero no hay garantía de orden estricto si la cola se acumula durante una desconexión larga. | 2026-07-17 | Añadir timestamp de creación y ordenar la cola por timestamp en la sincronización. |
| `online_orders` | Coexistencia de v1 y v2 registradas simultáneamente | El router principal registra tanto `online-orders.ts` (v1: POST /public/orders/online) como `online-orders-v2.ts` (v2: POST /public/orders/online-v2). Ambos usan la misma tabla `orders`. La v1 debería retirarse o marcarse como legacy. | 2026-07-17 | `POST /public/orders/online` ya devuelve `410 Gone`. Considerar eliminar la ruta v1 del registro en index.ts cuando todos los clientes migren. |
| `online_orders` | Duplicación de routers v1 y v2 | Coexistencia detectada. Comparten las mismas tablas DB pero tienen rutas públicas distintas. | 2026-07-17 | Ver entrada anterior. |
| `payments` | Riesgo de cobro doble por concurrencia | No hay bloqueo de concurrencia al cobrar — dos cajas pueden procesar el mismo pedido simultáneamente. | 2026-07-17 | Añadir bloqueo a nivel de fila (`SELECT ... FOR UPDATE`) en el flujo de cobro. Task pendiente. |
| `payments` | Sin clave de idempotencia en cobro | `POST /orders/:id/payments` no tiene clave de idempotencia — doble clic o reintento puede crear dos registros de pago. | 2026-07-17 | Añadir `idempotencyKey` único por intento de cobro. Task pendiente. |
| `printers` | Sin impresoras activas configuradas | No hay ninguna impresora activa en el sistema. Los tickets, facturas y comandas no se imprimirán hasta que se configure al menos una impresora. | 2026-07-17 | Configurar al menos una impresora activa en Admin → Impresoras antes del go-live. |
| `roles` | Sin auditoría de accesos denegados | No hay permisos granulares por acción — un rol tiene acceso total a su nivel. Sin auditoría de accesos denegados. | 2026-07-17 | Implementar log de accesos denegados (403) en middleware. Permisos granulares son de largo plazo. |
| `splits` | Split de cuenta sin cobertura de pruebas | El flujo de split no tiene cobertura de pruebas automatizadas. Verificar manualmente antes del go-live. | 2026-07-17 | Añadir tests de integración para el flujo de split. Task #220 (IVA tests) cubre parte del scope. |
| `stock_deduction` | Descuento de stock fire-and-forget sin alerta | El descuento de stock en `POST /orders/:id/send` es fire-and-forget: si la transacción de stock falla, el pedido continúa y el fallo se registra solo en logs. No hay alerta al usuario ni reintento. | 2026-07-17 | Añadir notificación push al encargado cuando falle el descuento de stock. |
| `verifactu` | Registros VeriFactu sin worker de envío automático | Los registros `verifactu_records` se crean con estado `pendiente_envio` en el momento del cobro, pero el worker de fondo solo está implementado como stub — los registros deben enviarse manualmente desde el panel. | 2026-07-17 | Implementar el worker completo con mTLS cuando se configure el certificado de producción. |
| `verifactu` | Certificado mTLS para AEAT no configurado | El envío al entorno de pruebas AEAT requiere certificado electrónico mTLS aún no configurado. | 2026-07-17 | Obtener certificado digital de la AEAT, configurar ruta en VeriFactu Config. Solo necesario para pruebas/producción. |

---

## Cómo actualizar este documento

Este documento se puede regenerar desde la base de datos con:

```bash
# Consultar hallazgos abiertos directamente
psql $DATABASE_URL -c "
  SELECT module, severity, title, detected_at::date
  FROM audit_findings
  WHERE resolved_at IS NULL
  ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, module;
"
```

Los hallazgos se generan automáticamente por `GET /api/admin/audit/run` (requiere rol admin).

---

## Proceso de resolución

1. Identifica el hallazgo en la tabla de arriba.
2. Implementa la corrección.
3. Ejecuta `GET /api/admin/audit/run` para que el sistema revalide el hallazgo.
4. Si el módulo pasa el check automático, el hallazgo se marca como resuelto.
5. Regenera este documento.

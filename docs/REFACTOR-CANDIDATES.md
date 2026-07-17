# Candidatos a Refactorización — Piccolo TPV

> Generado por auditoría técnica — 2026-07-17
> **Alcance de esta tarea:** Solo documentar. No se ejecuta ningún refactor.

## Archivos grandes — Frontend (>800 líneas)

| Archivo | Líneas | Responsabilidades mezcladas |
|---|---|---|
| `admin-instalacion.tsx` | 2.004 | UI wizard, llamadas API directas, validaciones de formulario, lógica de estados multi-paso |
| `crm.tsx` | 1.843 | Gestión de clientes, fidelización, gift cards, campañas, wallet — 7 pestañas en un solo archivo |
| `payment.tsx` | 1.666 | Cobro, splits, propinas, descuentos, impresión de ticket, métodos de pago múltiples |
| `tables.tsx` | 1.335 | Floor plan, drag&drop, zonas, estados de mesa, Socket.io, menú contextual |
| `order.tsx` | 1.256 | Menú de selección, carrito, modificadores, alérgenos, comandas, acciones de pedido |
| `menu.tsx` | 1.223 | Menú público QR, carrito, checkout, gestión de sesión de mesa |
| `productos.tsx` | 1.210 | CRUD de productos, formatos, imágenes, precios, alérgenos |
| `documentos.tsx` | 1.185 | Facturas, tickets, prefacturas, VERI*FACTU, listados, filtros |
| `zone-editor.tsx` | 1.184 | Editor canvas, drag de mesas, redimensionado, elementos decorativos |
| `admin-dashboard.tsx` | 1.166 | Dashboard con navegación a 40+ módulos, tarjetas, estadísticas |
| `reservations.tsx` | 1.041 | Lista, formulario, estados, depósitos, historial, lista de espera |
| `configuracion.tsx` | 1.003 | Config negocio, fiscalidad, horarios, integraciones, branding |
| `carta.tsx` | 989 | Carta QR pública, filtros, búsqueda, presentación |
| `cash-session.tsx` | 939 | Apertura/cierre de caja, X/Z report, movimientos, arqueo |
| `verifactu.tsx` | 904 | Dashboard VeriFactu, envíos, auditoría, config AEAT |
| `backup/DevicesPage.tsx` | 877 | Lista dispositivos, audit log, offline queue, hardware info |
| `kds.tsx` | 863 | Display cocina, ítems por estación, estados, temporizadores |

## Archivos grandes — Backend (>800 líneas)

| Archivo | Líneas | Responsabilidades mezcladas |
|---|---|---|
| `director.ts` | 1.156 | KPIs, métricas, simulaciones, alertas, comparativas — todo en un archivo |
| `verifactu.ts` | 1.131 | Firma digital, envío AEAT, simulator, auditoría, configuración |
| `hr.ts` | 1.036 | Posiciones, departamentos, empleados, contratos, permisos, solicitudes |
| `online-orders.ts` | 1.013 | Plataformas externas, estados, webhooks, worker, configuración |
| `orders.ts` | 1.012 | CRUD pedidos, estados, impresión, KDS, pagos parciales |
| `audit.ts` | 970 | 56 módulos de auditoría, findings, runs, scoring |
| `crm.ts` | 941 | Clientes, puntos, gift cards, wallet, campañas, consentimientos |
| `invoice-scanner.ts` | 921 | OCR, parsing, reconciliación, validación fiscal |
| `loyalty-extended.ts` | 840 | Niveles, promociones, cupones, campañas, segmentación |
| `cash.ts` | 829 | Caja, movimientos, arqueo, informes X/Z |
| `fichaje.ts` | 828 | Reloj, panel diario, turnos, ausencias, informes |

---

## Propuestas de extracción

### `crm.tsx` (1.843 líneas)

```
Extraer:
├── CrmClientes.tsx          — lista + formulario de clientes
├── CrmFidelizacion.tsx      — niveles, puntos, configuración
├── CrmGiftCards.tsx         — tarjetas regalo + transacciones
├── CrmCampanias.tsx         — campañas + envíos
├── CrmWallet.tsx            — monedero digital
└── hooks/useCrm.ts          — estado compartido, llamadas API
```
**Riesgo:** Medio. Estado compartido entre pestañas requiere Context o prop drilling.

### `payment.tsx` (1.666 líneas)

```
Extraer:
├── PaymentMethods.tsx        — selector de método de pago
├── PaymentSplits.tsx         — división de cuenta
├── PaymentTips.tsx           — gestión de propinas
├── PaymentDiscounts.tsx      — descuentos y promociones
└── hooks/usePayment.ts       — lógica de cobro y estado
```
**Riesgo:** Alto. El estado del cobro es transaccional — una extracción incorrecta puede causar inconsistencias.

### `tables.tsx` (1.335 líneas)

```
Extraer:
├── FloorPlan.tsx             — canvas de mesas y zonas
├── TableCard.tsx             — tarjeta individual de mesa
├── ZoneTabBar.tsx            — barra de pestañas de zonas
└── hooks/useTableSocket.ts   — suscripción Socket.io
```
**Riesgo:** Medio. La lógica de drag&drop y Socket.io está entrelazada.

### `order.tsx` (1.256 líneas)

```
Extraer:
├── OrderMenu.tsx             — explorador de categorías/productos
├── OrderCart.tsx             — carrito y resumen
├── OrderModifiers.tsx        — modal de modificadores
├── OrderAllergens.tsx        — panel de alérgenos
└── hooks/useOrder.ts         — estado del pedido
```
**Riesgo:** Alto. El flujo de pedido es complejo y con muchas interdependencias.

### `admin-instalacion.tsx` (2.004 líneas)

```
Extraer:
├── InstalacionWizardStep.tsx — componente de paso individual
├── InstalacionModulos.tsx    — activación de módulos
├── InstalacionImpresoras.tsx — configuración de impresoras
├── InstalacionRed.tsx        — configuración de red
└── hooks/useInstallation.ts  — estado del wizard
```
**Riesgo:** Bajo. Los pasos del wizard son relativamente independientes.

---

## Hooks y servicios extraíbles

| Hook/Servicio | Dónde duplicado | Extracción propuesta |
|---|---|---|
| Lectura de token JWT | ~50 archivos | `hooks/useAuth.ts` |
| Petición fetch autenticada | ~70 archivos (fetch directo) | `lib/apiFetch.ts` (ya parcialmente existe) |
| WebSocket connection | `tables.tsx`, `kds.tsx` | `hooks/useSocket.ts` |
| Paginación de listas | ~20 archivos | `hooks/usePagination.ts` |
| Gestión de formularios con API | ~30 archivos | `hooks/useApiForm.ts` |

---

## Tipos centralizables

Los tipos de respuesta de API están definidos en múltiples lugares:
- `lib/api-zod/src/index.ts` — tipos Zod (fuente de verdad)
- `lib/api-client-react/src/index.ts` — tipos TypeScript inferidos
- Tipos inline en cada página (`type Employee = { id: string; name: string }`)

**Propuesta:** Centralizar todos los tipos en `lib/api-zod` y eliminar las definiciones inline duplicadas.

---

## Tabla de riesgo de refactorización

| Módulo | Riesgo | Motivo |
|---|---|---|
| `admin-instalacion.tsx` | 🟡 Bajo | Pasos independientes |
| `configuracion.tsx` | 🟡 Bajo | Tabs relativamente independientes |
| `admin-dashboard.tsx` | 🟡 Bajo | Solo navegación |
| `crm.tsx` | 🟠 Medio | Estado compartido entre tabs |
| `tables.tsx` | 🟠 Medio | Socket.io entrelazado |
| `reservations.tsx` | 🟠 Medio | Estado de modal complejo |
| `documentos.tsx` | 🟠 Medio | Múltiples tipos de documento |
| `payment.tsx` | 🔴 Alto | Lógica transaccional crítica |
| `order.tsx` | 🔴 Alto | Flujo de pedido con muchas interdependencias |
| `zone-editor.tsx` | 🔴 Alto | Canvas con drag&drop complejo |

---

## Recomendación de orden de refactorización

1. Primero: extraer hooks de autenticación y fetch (sin UI, bajo riesgo, alto impacto)
2. Segundo: `admin-instalacion.tsx` y `admin-dashboard.tsx` (pasos independientes)
3. Tercero: `crm.tsx` (una pestaña a la vez, añadiendo tests)
4. Último: `payment.tsx` y `order.tsx` (requieren cobertura de tests antes de tocar)

**Prerrequisito para cualquier refactor:** Aumentar cobertura de tests E2E en los módulos afectados.

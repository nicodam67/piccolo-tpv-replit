# Reorganización de Módulos — Piccolo TPV Admin

**Fecha:** Julio 2026  
**Objetivo:** Consolidar 30 botones planos en 8 módulos principales con navegación interna jerárquica.

---

## Botones eliminados del panel principal

Los siguientes 22 botones ya NO aparecen como tarjetas independientes en el panel admin.
Sus funciones siguen accesibles a través del módulo correspondiente.

| Botón eliminado | Ahora en | Ruta directa conservada |
|---|---|---|
| TPV | Operaciones › Servicio | `/tables` |
| Editar Salas | Operaciones › Servicio | `/configuracion` |
| KDS | Operaciones › Cocina | `/kds/cocina` |
| Caja | Operaciones › Cobro | `/caja` |
| Caja automática | Operaciones › Cobro / Hardware | `/admin/caja-automatica` |
| Reservas | Operaciones › Servicio | `/reservas` |
| Branding & Carta QR | Carta y Cocina › QR Menú | `/admin/qr-menu` |
| Food Cost | Carta y Cocina › Food Cost | `/admin/food-cost` |
| Informes | Administración › Informes | `/admin/informes` |
| VERI*FACTU | Administración › Fiscalidad | `/admin/verifactu` |
| Panel de Dirección | Administración › Dirección | `/admin/director` |
| CRM & Fidelización | Clientes y Pedidos › Clientes | `/admin/crm` |
| Pedidos Online | Clientes y Pedidos › Pedidos Online | `/admin/online-orders-config` |
| Bandeja de pedidos online | Clientes y Pedidos › Pedidos Online | `/online-orders` |
| Informes online | Clientes y Pedidos › Informes | `/admin/online-reports` |
| Impresoras | Hardware e Instalación › Impresión | `/admin/impresoras` |
| Estaciones KDS | Hardware e Instalación › Pantallas KDS | `/admin/kds-stations` |
| Prueba de Impresión | Hardware e Instalación › Impresión | `/admin/prueba-impresion` |
| Cola de Impresión | Hardware e Instalación › Impresión | `/admin/cola-impresion` |
| Dispositivos | Hardware e Instalación › Dispositivos | `/admin/devices` |
| Instalación | Hardware e Instalación › Dispositivos | `/admin/instalacion` |
| Asistente setup | Hardware e Instalación / Sistema | `/setup` |
| Permisos por rol (x2 — era duplicado) | Sistema › Seguridad + Administración › Auditoría | `/admin/permisos` |
| Datos de demostración | Sistema › Datos | `/admin/datos-demo` |
| Salud del sistema | Sistema › Seguridad | `/admin/salud` |
| Estado del sistema | Sistema › Diagnóstico | `/admin/sistema` |
| Copias de seguridad | Sistema › Datos | `/admin/backup` |
| Diagnóstico técnico | Sistema › Diagnóstico | `/admin/diagnostics` |

---

## 8 botones nuevos del panel principal

| # | Módulo | Descripción | Ruta hub |
|---|---|---|---|
| 1 | **Operaciones** | TPV · caja · salas · reservas · KDS | `/operaciones` |
| 2 | **Carta y Cocina** | QR Menú · productos · escandallos · costes | `/carta-cocina` |
| 3 | **Clientes y Pedidos** | CRM · fidelización · pedidos online · reparto | `/clientes-pedidos` |
| 4 | **Personal y Fichaje** | Empleados · turnos · fichajes · NFC | `/personal` |
| 5 | **Administración** | Informes · dirección · fiscalidad · control | `/administracion` |
| 6 | **Hardware e Instalación** | Impresoras · KDS · dispositivos · red | `/hardware` |
| 7 | **Sistema** | Diagnóstico · seguridad · copias · mantenimiento | `/sistema` |
| 8 | **Configuración** | Preferencias generales del sistema | `/configuracion` |

---

## Rutas nuevas creadas

| Ruta | Componente | Descripción |
|---|---|---|
| `/operaciones` | `OperacionesHub` | Hub de operaciones diarias |
| `/carta-cocina` | `CartaCocinaHub` | Hub de carta digital y food cost |
| `/clientes-pedidos` | `ClientesPedidosHub` | Hub de CRM y pedidos online |
| `/administracion` | `AdministracionHub` | Hub de informes y fiscalidad |
| `/hardware` | `HardwareHub` | Hub de hardware e instalación |
| `/sistema` | `SistemaHub` | Hub de sistema y mantenimiento |

---

## Rutas antiguas conservadas (sin cambios)

Todas las rutas de módulos internos se mantienen intactas. Los hubs son únicamente "launchers" que enlazan a las rutas existentes.

**Ninguna ruta antigua ha sido eliminada ni redirigida.**

Las rutas que existían antes (`/admin/impresoras`, `/admin/crm`, `/admin/verifactu`, etc.) siguen funcionando y sus componentes no han sido modificados.

---

## Duplicados eliminados

El panel original tenía dos entradas con `id: 'permisos'` (líneas 341-353 y 381-392 del dashboard original). Se ha consolidado en una sola entrada visible en **Sistema › Seguridad** y mencionada también en **Administración › Auditoría**.

---

## Buscador mejorado

El buscador ahora indexa tanto los 8 módulos principales como todos los elementos internos de cada hub. Ejemplos:

- Buscar "impresora" → **Hardware e Instalación › Impresoras** `/admin/impresoras`
- Buscar "NFC" → **Personal y Fichaje › Empleados · NFC** `/personal/empleados`
- Buscar "IVA" → **Administración › Informes · IVA** `/admin/informes`
- Buscar "backup" → **Sistema › Copias de seguridad** `/admin/backup`

---

## Quick-access (accesos directos)

La franja de accesos directos al inicio muestra:

1. Abrir TPV → `/tables`
2. Abrir Caja → `/caja`
3. KDS Cocina → `/kds/cocina`
4. Administración → `/administracion`
5. Diagnóstico → `/admin/diagnostics`
6. Copia de seguridad → `/admin/backup`
7. QR Mesas → `/admin/instalacion/qr`

---

## Funciones conservadas (checklist)

- [x] TPV accesible
- [x] Caja accesible
- [x] KDS accesible
- [x] Reservas accesibles
- [x] Caja automática accesible
- [x] Editar salas accesible
- [x] QR Menú accesible (Branding, Categorías, Productos, Modificadores)
- [x] Food Cost accesible (Ingredientes, Escandallos, Proveedores, Stock, etc.)
- [x] CRM accesible
- [x] Pedidos Online accesible
- [x] Bandeja de pedidos accesible
- [x] Repartidores accesibles
- [x] Informes online accesibles
- [x] Informes de ventas accesibles
- [x] Panel de Dirección accesible
- [x] VERI*FACTU accesible
- [x] Personal y Fichaje accesible
- [x] Impresoras accesibles
- [x] Estaciones KDS accesibles
- [x] Cola de impresión accesible
- [x] Prueba de impresión accesible
- [x] Dispositivos accesibles
- [x] Instalación accesible
- [x] Permisos por rol accesibles
- [x] Salud del sistema accesible
- [x] Estado del sistema accesible
- [x] Copias de seguridad accesibles
- [x] Diagnóstico técnico accesible
- [x] Datos demo accesibles
- [x] Asistente de configuración accesible
- [x] Configuración del sistema accesible

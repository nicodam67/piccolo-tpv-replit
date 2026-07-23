# Migración de clientes API

Inventario automático acumulado de clientes API.

## Totales iniciales

- Hooks exportados por el cliente actual: 202
- Hooks históricos añadidos manualmente: 160
- Hooks manuales sin operación equivalente en OpenAPI: 120
- Llamadas `fetch`: 84
- Llamadas `customFetch` directas: 84
- Llamadas mediante wrapper `api`: 205
- Llamadas Convex: 95
- Archivos manuales pendientes: 95

## Estado de migración

- Hooks migrados al cliente parcial de Entrega 41: 24
- Archivos consumidores migrados: 6
- Eliminados por evidencia de obsolescencia: 0
- Adaptadores conservados: 9
- Pendientes: 95

No se migran llamadas hasta que su operación y tipos estén respaldados por OpenAPI; hacerlo antes
solo trasladaría URLs sin crear un contrato fiable.

## Adaptadores conservados

- `artifacts/piccolo-tpv/src/hooks/useNetworkStatus.ts`: transporte, offline, tablet o integración Convex.
- `artifacts/piccolo-tpv/src/lib/api-client.ts`: transporte, offline, tablet o integración Convex.
- `artifacts/piccolo-tpv/src/lib/offline-queue.ts`: transporte, offline, tablet o integración Convex.
- `artifacts/piccolo-tpv/src/pages/fichaje/tablet/TabletApp.tsx`: transporte, offline, tablet o integración Convex.
- `artifacts/piccolo-tpv/src/pages/fichaje/tablet/TabletHome.tsx`: transporte, offline, tablet o integración Convex.
- `artifacts/piccolo-tpv/src/pages/fichaje/tablet/useTabletClock.ts`: transporte, offline, tablet o integración Convex.
- `artifacts/qr-menu/src/pages/admin/_components/BrandingManager.tsx`: transporte, offline, tablet o integración Convex.
- `artifacts/qr-menu/src/pages/admin/_components/ItemManager.tsx`: transporte, offline, tablet o integración Convex.
- `artifacts/qr-menu/src/pages/admin/_components/MenuTree.tsx`: transporte, offline, tablet o integración Convex.

## Accesos manuales pendientes

| Archivo | fetch | customFetch | api wrapper |
|---|---:|---:|---:|
| `artifacts/piccolo-tpv/src/components/auth/ManagerPinModal.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/CartCheckout.tsx` | 3 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-almacenes.tsx` | 4 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-categorias-ingredientes.tsx` | 4 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-cola-impresion.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-dashboard.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-impresoras.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-instalacion-qr.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/admin-instalacion.tsx` | 0 | 5 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-mermas.tsx` | 4 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-permisos.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-print-test.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/admin-repartidores.tsx` | 0 | 0 | 6 |
| `artifacts/piccolo-tpv/src/pages/admin-sistema.tsx` | 0 | 3 | 0 |
| `artifacts/piccolo-tpv/src/pages/admin-turnos-reservas.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/backup/BackupPage.tsx` | 3 | 0 | 10 |
| `artifacts/piccolo-tpv/src/pages/backup/DevicesPage.tsx` | 0 | 0 | 10 |
| `artifacts/piccolo-tpv/src/pages/backup/DiagnosticsPage.tsx` | 1 | 0 | 5 |
| `artifacts/piccolo-tpv/src/pages/carta-categoria.tsx` | 2 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/carta-imprimir.tsx` | 2 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/carta.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/comparacion-precios.tsx` | 0 | 2 | 0 |
| `artifacts/piccolo-tpv/src/pages/conciliacion-documental.tsx` | 0 | 2 | 0 |
| `artifacts/piccolo-tpv/src/pages/conciliacion-factura.tsx` | 0 | 4 | 0 |
| `artifacts/piccolo-tpv/src/pages/crm.tsx` | 0 | 0 | 29 |
| `artifacts/piccolo-tpv/src/pages/delivery.tsx` | 0 | 0 | 11 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorAlertas.tsx` | 3 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorCRM.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorCaja.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorCocina.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorCostos.tsx` | 3 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorHoy.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorInformes.tsx` | 4 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorObjetivos.tsx` | 4 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorPage.tsx` | 2 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorPersonal.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorPrevision.tsx` | 2 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorRentabilidad.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorReparto.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorReservas.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorStock.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/director/DirectorVentas.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/driver-view.tsx` | 0 | 2 | 0 |
| `artifacts/piccolo-tpv/src/pages/escaner-facturas.tsx` | 0 | 2 | 0 |
| `artifacts/piccolo-tpv/src/pages/facturas-proveedor.tsx` | 0 | 6 | 0 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeAuditoria.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeAusencias.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeConfiguracion.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeCorrecciones.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeCostesLaborales.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeDispositivos.tsx` | 0 | 0 | 5 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeEmpleados.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeImportar.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeImportarAnviz.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeIncidencias.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeInformes.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajePanelDiario.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajePausas.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajePlanificacion.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajePortalEmpleado.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeRegistros.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeReloj.tsx` | 0 | 0 | 5 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeTurnos.tsx` | 0 | 0 | 5 |
| `artifacts/piccolo-tpv/src/pages/fichaje/FichajeVacaciones.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/hr/HRCatalogos.tsx` | 0 | 0 | 8 |
| `artifacts/piccolo-tpv/src/pages/hr/HREmpleados.tsx` | 0 | 0 | 7 |
| `artifacts/piccolo-tpv/src/pages/hr/HRImport.tsx` | 0 | 0 | 6 |
| `artifacts/piccolo-tpv/src/pages/hr/HRInformes.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/hr/HRPeriodos.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/hr/HRSolicitudes.tsx` | 0 | 0 | 4 |
| `artifacts/piccolo-tpv/src/pages/informes-stock.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/informes.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/ingredientes.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/inventario-fisico.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/kds.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/lotes-caducidades.tsx` | 0 | 0 | 1 |
| `artifacts/piccolo-tpv/src/pages/menu.tsx` | 10 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/online-config.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/online-orders-inbox.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/online-reports.tsx` | 0 | 1 | 0 |
| `artifacts/piccolo-tpv/src/pages/order-status.tsx` | 2 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/payment.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/pedidos-compra.tsx` | 0 | 10 | 0 |
| `artifacts/piccolo-tpv/src/pages/productos.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/proveedores.tsx` | 0 | 10 | 0 |
| `artifacts/piccolo-tpv/src/pages/qr-menu/TabPrint.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/qr-menu/lib.ts` | 1 | 6 | 0 |
| `artifacts/piccolo-tpv/src/pages/recepcion-mercancia.tsx` | 0 | 7 | 0 |
| `artifacts/piccolo-tpv/src/pages/reservations.tsx` | 0 | 0 | 15 |
| `artifacts/piccolo-tpv/src/pages/retirada-lote.tsx` | 0 | 0 | 2 |
| `artifacts/piccolo-tpv/src/pages/revision-factura.tsx` | 0 | 6 | 0 |
| `artifacts/piccolo-tpv/src/pages/setup/steps/SetupProduccion.tsx` | 1 | 0 | 0 |
| `artifacts/piccolo-tpv/src/pages/trazabilidad-lotes.tsx` | 0 | 0 | 3 |
| `artifacts/piccolo-tpv/src/pages/verifactu.tsx` | 1 | 11 | 0 |
| `artifacts/piccolo-tpv/src/providers/AuthProvider.tsx` | 0 | 0 | 3 |

# FoodCost: bloqueo multi-centro

## Estado

FoodCost no puede garantizar aislamiento por centro porque el modelo operativo
principal no atribuye a un centro los productos, ingredientes, recetas, pedidos,
stock y compras. Añadir `center_id` únicamente a las tablas analíticas daría una
falsa sensación de aislamiento y permitiría mezclar datos de origen.

Esta certificación no implementa la migración multi-centro.

## Identidad de centro existente

- `hr_work_centers` define centros para RR. HH. y planificación.
- `employees.work_center_id` atribuye el centro actual del empleado.
- `tickets.work_center_id` conserva un snapshot al emitir el ticket.

Esto permite atribución parcial, pero no particiona el catálogo, inventario ni
las operaciones que generan el coste.

## Entidades que necesitan centro o una política explícita de compartición

| Área | Entidades principales | Decisión requerida |
|---|---|---|
| Catálogo | `categories`, `subcategories`, `products`, `product_formats`, modificadores | Catálogo global con asignación por centro, o catálogo aislado |
| Escandallos | `recipe_items`, `subrecipes`, `subrecipe_items` | Receta global/versionada o receta por centro |
| Ingredientes | `ingredients`, categorías de ingrediente, almacenes | Identidad global más inventario/coste por centro, o ingrediente aislado |
| Stock | `stock_movements`, `waste_records`, lotes, recuentos | `work_center_id` obligatorio y almacenes pertenecientes a un centro |
| Ventas | `orders`, `order_items`, descuentos, pagos | Snapshot de centro desde la apertura del pedido, no desde el empleado actual |
| Compras | proveedores, catálogos, pedidos, recepciones, facturas, OCR | Proveedor compartido opcional; documentos, recepción y coste por centro |
| Caja/fiscal | sesiones, tickets, facturas, VeriFactu | Caja y configuración fiscal por centro/entidad legal |
| FoodCost | gastos, comisiones, objetivos, propuestas e historial | Configuración y análisis derivados del mismo centro que sus fuentes |

## Propagación necesaria

1. Resolver el centro al crear el pedido y conservarlo durante todo el flujo.
2. Propagarlo a KDS, stock, pagos, tickets, devoluciones y auditoría.
3. Exigirlo en compras, recepciones, facturas y actualizaciones de coste.
4. Aplicar filtros de centro en repositorios/servicios, no solo en la interfaz.
5. Incorporarlo a índices únicos e idempotencia.
6. Definir si proveedores, productos y recetas son globales o se asignan a
   varios centros mediante tablas de relación.
7. Evitar inferir históricos desde el centro actual del empleado.

## Módulos afectados

TPV, QR/online, delivery, KDS, stock, recetas, compras, OCR, caja, informes,
Director, fiscal/VeriFactu, permisos y FoodCost.

## Condición para certificar aislamiento

Una futura tarea arquitectónica debe incluir migración y backfill explícitos,
política para registros históricos sin centro, autorización por centro, índices,
pruebas de fuga entre centros y regresión de todos los módulos enumerados.

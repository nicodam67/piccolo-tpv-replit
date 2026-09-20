# FoodCost — certificación funcional

Fecha: 2026-09-20  
Alcance: migraciones 0030/0031, fórmulas, dashboard, reversiones económicas,
snapshots COGS, propuestas, simulador y regresión.

## Resultado de ejecución

- Migración 0030: PASS.
- Migración 0031: PASS.
- Casos FoodCost focalizados: 51/51 PASS.
- Suite API completa: 669 PASS, 12 omitidos; 0 fallos.
- Typecheck completo: PASS.
- Lint: PASS.
- Auditor de rutas/RBAC: PASS, 64 ficheros sin endpoints desprotegidos.
- Build web: PASS, 3.089 módulos transformados.
- Prueba visual autenticada: no ejecutable en este entorno por infraestructura.

## Ejecución reproducible

```bash
pnpm --filter @workspace/db certify:foodcost
pnpm --filter @workspace/db certify:foodcost-economic
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm lint
pnpm --filter @workspace/piccolo-tpv build
```

## Migración 0030

La prueba `certify:foodcost` usa PostgreSQL embebido (PGlite) y parte de un
esquema representativo anterior a 0030 con filas existentes. Verifica:

- conservación de productos e historial existentes;
- backfill de `source='manual'` sin alterar las demás columnas;
- defaults y nullabilidad;
- checks de categorías, importes, periodos, porcentajes, ámbitos y precios;
- índices únicos y de consulta;
- foreign keys y `ON DELETE SET NULL`;
- protección del historial de propuestas frente al borrado del producto;
- rollback de tablas/columnas nuevas conservando las tablas y filas previas.

El rollback elimina configuración, gastos, comisiones, objetivos y propuestas
creados después del upgrade. Por tanto, en un entorno con datos reales la
estrategia de recuperación es restaurar un backup/snapshot previo; el `.down.sql`
solo es apropiado antes de empezar a usar las tablas nuevas o aceptando perder
esos datos analíticos.

## Caso económico determinista

Entrada:

- compra: 24 € por paquete;
- conversión: 12 kg por paquete;
- receta: 500 g;
- merma: 10 %;
- PVP: 11 € IVA 10 % incluido;
- comisión: 10 % + 0,50 €;
- indirecto asignado: 0,50 €;
- margen objetivo para recomendación: 50 %.

| Métrica | Esperado |
|---|---:|
| Coste ingrediente | 1,00 € |
| Coste merma | 0,10 € |
| Coste efectivo | 1,10 € |
| Precio neto | 10,00 € |
| FoodCost | 11,00 % |
| Comisión | 1,50 € |
| Margen de contribución | 7,40 € |
| Margen de contribución | 74,00 % |
| Beneficio estimado después de indirecto | 6,90 € |
| Rentabilidad estimada | 69,00 % |
| PVP recomendado | 5,775 € |
| Estado con objetivo 70 % | verde |

La prueba también verifica la jerarquía:
`producto+canal > producto > categoría+canal > categoría > global+canal > global > default`.

## Dashboard y ventas reconocidas

Validado:

- fecha de reconocimiento basada en `tickets.issued_at`;
- exclusión de tickets demo;
- cantidades procedentes de `order_items.quantity`;
- PVP e IVA capturados en la línea vendida;
- invitaciones con ingreso reconocido cero;
- descuentos de línea y pedido descontados del ingreso;
- COGS histórico preferido desde `stock_movements`;
- fallback al escandallo actual identificado y porcentaje de cobertura visible;
- relación `tickets.order_id` única y `order_items.id` primaria, que evita
  duplicar una línea en la consulta.

Caso de control: 2 unidades a 11 € con IVA 10 % y snapshot COGS de 1,50 € por
unidad debe producir 22 € de ventas, 20 € netos, 3 € COGS, 17 € de contribución,
FoodCost ponderado 15 % y margen ponderado 85 %.

### Cierre de los bloqueantes económicos

Las ventas y sus reversiones se proyectan como eventos inmutables:

- ticket: evento positivo en `tickets.issued_at`;
- anulación: evento negativo en `payment_voids.created_at`;
- devolución de caja automática completada: evento negativo en `completed_at`;
- devolución online: evento negativo en `payment_attempts.refunded_at`.

Una devolución posterior no reescribe un periodo cerrado. En su propia fecha
revierte ingreso bruto/neto, unidades y COGS proporcionalmente. Si `split_ref`
identifica un grupo existente, la reversión se asigna exactamente a sus líneas;
si no existe ámbito de artículo, se distribuye por ingreso pendiente. Los
ajustes se limitan al valor reconocido, por lo que un reintento no produce
ventas o unidades negativas.

La captura COGS convierte la unidad de receta a la unidad de consumo con las
conversiones FoodCost existentes, aplica cantidad vendida y merma y guarda
cantidad/coste unitario en `stock_movements`. Las subrecetas se expanden por su
composición y rendimiento. El resolvedor admite composición recursiva y rechaza
ciclos, referencias inexistentes, unidades incompatibles, cantidades inválidas,
rendimiento cero y composiciones vacías en lugar de registrar coste cero.

La prueba de inmutabilidad captura mozzarella a 8 €/kg, cambia después el coste
a 12 €/kg y confirma que el COGS reconocido permanece en 4 €.

## Migración 0031

Añade el índice único `payment_voids_original_payment_unique`. La certificación
PGlite verifica:

- conservación de anulaciones existentes;
- transición condicional `completed → voided` una sola vez;
- rechazo de una segunda anulación del mismo pago;
- detección explícita de duplicados preexistentes sin borrarlos;
- rollback del índice sin eliminar filas.

Si existen duplicados históricos, el upgrade falla deliberadamente y exige
revisión manual; la migración no destruye trazabilidad para poder continuar.

## Propuestas de precio

Las pruebas cubren:

- crear una propuesta sin actualizar `products.price`;
- aplicar una propuesta pendiente;
- rechazar doble aprobación;
- rechazar propuesta obsoleta cuando el precio ya cambió;
- transacción y comparación optimista de precio/estado;
- usuario solicitante/revisor, fechas, precio anterior/nuevo y motivo en la
  propia fila de auditoría;
- endpoints restringidos a `admin`.

TPV y QR consultan `products`, por lo que una propuesta aprobada se refleja por
los mecanismos existentes; no hay escritura antes de la aprobación.

## Simulador

La prueba ejecuta un escenario con un producto y comprueba que la ruta solo
realiza lecturas: no llama a `insert`, `update` ni `delete`. Por tanto no cambia
ingredientes, recetas, historial de costes o precios.

## Prueba visual autenticada

No se ejecuta en este Cloud Agent porque faltan:

- `DATABASE_URL` a PostgreSQL;
- `SESSION_SECRET`;
- `BOOTSTRAP_SECRET` para una base vacía;
- backend migrado y arrancado;
- proxy de mismo origen entre frontend y `/api`.

No se crean datos falsos ni se modifica configuración productiva.

### Reproducción posterior en Windows/servidor de pruebas

1. Instalar Node.js 24, pnpm y PostgreSQL.
2. Clonar la rama de certificación y ejecutar `pnpm install`.
3. Crear una base exclusiva de pruebas y copiar `.env.example` a `.env`.
4. Configurar `DATABASE_URL`, `SESSION_SECRET` (32+ caracteres),
   `BOOTSTRAP_SECRET` (32+), `NODE_ENV=test` y `PORT=3000`.
5. Ejecutar `pnpm --filter @workspace/db migrate`.
6. Arrancar API: `pnpm --filter @workspace/api-server dev`.
7. Si la base está vacía, crear un admin una sola vez:

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri http://localhost:3000/api/setup/seed-employees `
     -ContentType application/json `
     -Body '{"bootstrapSecret":"<secreto>","name":"Admin pruebas","pin":"<pin>"}'
   ```

8. Arrancar frontend en otro puerto:
   `pnpm --filter @workspace/piccolo-tpv dev -- --port 5173`.
9. Publicar ambos bajo un mismo origen. Por ejemplo, con Caddy en `:8088`,
   dirigir `/api/*` a `localhost:3000` y el resto a `localhost:5173`.
10. Abrir `http://localhost:8088`, iniciar sesión y recorrer:
    Rentabilidad → Dashboard → Configuración → Simulador → propuesta → aprobación.
11. Verificar en otra sesión/pestaña TPV y QR que el precio solo cambia después
    de aprobar.
12. Ejecutar los casos de venta, invitación, descuento, anulación y devolución
    sobre esa base desechable y comparar con este documento.

## Recomendación

**GO** para cerrar el desarrollo y fusionar la PR dentro del alcance certificado.
Los dos motivos exclusivos del NO-GO anterior tienen pruebas específicas
reproducibles y pasan. La validación visual con PostgreSQL real y la arquitectura
multi-centro siguen fuera de este cierre, tal como se acordó.

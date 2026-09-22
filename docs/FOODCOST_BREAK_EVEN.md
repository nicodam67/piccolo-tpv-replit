# FoodCost — Punto de equilibrio

## Criterio económico

Todos los cálculos internos usan importes netos de IVA. La equivalencia bruta se
obtiene únicamente del ratio bruto/neto observado en los tickets del periodo; si
no hay ventas, no se inventa un tipo impositivo.

Las fórmulas centralizadas en `break-even-calculator.ts` son:

- `ratio_coste_variable = (COGS + comisiones + gastos_variables) / ventas_netas`
- `margen_contribucion_pct = 1 - ratio_coste_variable`
- `punto_equilibrio_mensual_neto = costes_fijos_mensuales / margen_contribucion_pct`
- `punto_equilibrio_semanal_neto = punto_equilibrio_mensual_neto / (52 / 12)`
- `venta_minima_diaria_neta = punto_equilibrio_mensual_neto / dias_abiertos_mensuales`
- `tickets_diarios = venta_minima_diaria_neta / ticket_medio_neto`
- `facturacion_objetivo = (costes_fijos_mensuales + beneficio_objetivo) / margen_contribucion_pct`
- `margen_seguridad = ventas_netas_periodo - punto_equilibrio_periodo`

Un margen de contribución nulo o negativo, ventas nulas, ticket medio nulo o
ausencia de días abiertos produce un resultado `null` y un código de calidad,
nunca `NaN` o infinito.

## Fuentes

- Ventas, tickets y días de actividad reales: tickets fiscales no demo.
- Descuentos, invitaciones, anulaciones y devoluciones: proyección económica
  compartida con el Dashboard de Rentabilidad.
- COGS: snapshot de movimientos de stock de la venta. Las ventas antiguas sin
  snapshot conservan el fallback existente a coste actual y muestran cobertura.
- Comisiones: configuración por canal de FoodCost.
- Gastos: `operating_expenses`, mensualizados por `periodMonths`.
- Personal: salario mensual y factor empresarial o fichajes, tarifa horaria y
  factor empresarial. Si RR. HH. no dispone de datos, se usa el gasto manual de
  categoría `personal`.
- Días abiertos: `business_config.openingHours`; los días con tickets son un
  fallback estimado cuando no existe horario.

No se suman `director_costs` ni el gasto manual de personal cuando RR. HH. ya
aporta coste para el periodo.

## Calidad y limitaciones

La API etiqueta cada fuente como `REAL`, `CONFIGURED`, `ESTIMATED` o `NO_DATA`.
La pantalla oculta los objetivos prominentes cuando faltan ventas, gastos,
personal o días abiertos. Las comisiones configuradas son contractuales, no una
liquidación externa. No existe calendario de cierres extraordinarios ni
aislamiento multi-centro para los gastos globales.

El simulador sólo aplica variaciones a la lectura actual y no ejecuta escrituras.
La futura función «Objetivo de hoy» queda fuera de este módulo.

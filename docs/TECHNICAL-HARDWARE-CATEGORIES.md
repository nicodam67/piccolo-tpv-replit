# Piccolo — Lista técnica por categorías

No es una compra ni certifica marcas/modelos. Cantidades son hipótesis de diseño que el propietario debe confirmar.

| Categoría | Función | Requisitos mínimos verificables | Protocolo | Compatibilidad a probar | Cantidad estimada | Dependencia | Riesgo si falta |
|---|---|---|---|---|---:|---|---|
| Servidor/ordenador | API, workers y/o PostgreSQL | Node soportado, almacenamiento persistente, backup, supervisión, red estable | Ethernet/HTTPS/PostgreSQL | Build, carga, reboot, restore | 1 activo + estrategia de sustitución | Topología elegida | Parada total |
| Terminal TPV principal | Caja/administración | Navegador moderno, táctil opcional, pantalla suficiente | HTTPS/Wi‑Fi/Ethernet | Login, caja, pago, impresión | 1 | Servidor/LAN | Sin puesto de control |
| Tablets camarero | Sala/pedidos | Navegador PWA actual, Wi‑Fi estable, batería, táctil | HTTPS/Socket.IO | D1–D7, orientación, reconnect | 7 solicitadas | Wi‑Fi/cargadores | Capacidad de servicio reducida |
| Teléfono administrador | Terminal auxiliar | HTTPS, pantalla compatible, autenticación | HTTPS | Login/consulta/incidencias | 1 candidato | Internet/LAN según topología | Sin acceso móvil |
| Dispositivo fichaje | Kiosco PIN/NFC | Android/Chrome compatible si NFC, HTTPS, montaje fijo | HTTPS/Web NFC | Pairing, PIN, NFC, revoke | 1+ | Red/certificado | Fichaje manual |
| Dispositivos KDS | Cocina/barra/pase | Pantalla legible, navegador estable, alimentación continua | HTTPS/Socket.IO | Zona, touch, reconnect, reboot | 1 por departamento decidido | LAN/servidor | Pérdida visual de comandas |
| Puntos de acceso | Cobertura tablets | Capacidad simultánea y roaming medidos in situ | Wi‑Fi | Survey, pérdida/roaming, 7+ clientes | Según estudio RF | Router/switch | Desconexiones |
| Router/firewall | LAN/Internet | Segmentación, DHCP/DNS, reglas y logs | IP | WAN/LAN loss, failover si existe | 1+ según arquitectura | ISP | Aislamiento total |
| Switch | Conectar servidor/KDS/printers/NAS | Puertos suficientes, gestión/PoE si se decide | Ethernet | Saturación, reboot, etiquetado | 1+ según puertos | Cableado/SAI | Zonas desconectadas |
| Cableado | Enlaces críticos | Categoría certificada y tomas etiquetadas | Ethernet | Test por toma | Según plano | Instalación | Fallos intermitentes |
| Impresoras térmicas | Comandas/tickets | Solo candidatas tras probar transporte, charset, ancho, corte y estado | TCP/IP o futuro agente; USB no soportado hoy | Matriz física completa | 1 por salida requerida + reserva opcional | Conector aún inexistente | Sin papel/contingencia |
| Consumibles | Papel/limpieza | Tamaño compatible, stock operativo | Físico | Ticket largo/corte | Retención definida por propietario | Impresoras | Parada por papel |
| Cajón | Custodia efectivo | Interfaz compatible con solución certificada | ESC/POS kick futuro/manual | Apertura única y seguridad | 0/1 por caja, decisión | Impresora/conector | Operación manual |
| Caja automática | Reciclaje efectivo | Solo tras seleccionar proveedor y desarrollar/certificar adapter | Protocolo del proveedor no definido | Pago/cambio/cancel/reconcile | 0/1 por caja, decisión | Adapter/credenciales | No disponible; usar manual |
| Terminal tarjeta | Cobro externo | Proceso de conciliación y proveedor definidos | No integrado actualmente | Pago, cancelación, cierre externo | Según cajas | Proveedor bancario | Registro manual |
| SAI | Continuidad eléctrica | Autonomía y señalización dimensionadas | Físico/USB opcional no integrado | Corte y apagado ordenado | Servidor+red+NAS críticos | Electricidad | Corrupción/parada |
| NAS | Copia local externa | Montaje estable, permisos, capacidad, snapshots externos | SMB/NFS como mount del SO | Backup/restore/loss/space | 1 candidato + discos | LAN/SAI | Sin copia local externa |
| Discos NAS | Capacidad/RAID | Compatibilidad y salud gestionadas fuera de Piccolo | SATA/NVMe según candidato | Fallo/rebuild externo | Según política RAID | NAS | Pérdida de redundancia |
| Backup externo | Copia off-site | Cifrado, retención, acceso restringido | S3-compatible o medio rotado | Round-trip real | 1 destino mínimo si se aprueba | Credenciales/Internet | Riesgo catastrófico local |
| Soportes/cargadores | Disponibilidad dispositivos | Montaje, ventilación, carga segura | Físico | Jornada completa | 1 por dispositivo | Electricidad | Caídas/batería |

## Decisiones del propietario

1. Topología local, cloud o híbrida.
2. Departamentos y salidas físicas reales.
3. KDS, impresora, ambos o ninguno por departamento — actualmente Piccolo solo ofrece modo global.
4. Uso de cajón, caja automática y terminal de tarjeta.
5. Flota final y política de dispositivos de reserva.
6. NAS candidato — TerraMaster F4-424 puede evaluarse, nunca considerarse validado antes del drill.
7. RPO/RTO, retención y responsable de restauración.

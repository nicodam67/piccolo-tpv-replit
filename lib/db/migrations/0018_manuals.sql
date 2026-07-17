-- ═══════════════════════════════════════════════════════════════════════════════
-- 0018_manuals.sql
-- Operational manuals stored in the DB so admins can customise steps.
-- Uses IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS manuals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text        NOT NULL UNIQUE, -- 'apertura' | 'cierre' | 'emergencia'
  title        text        NOT NULL DEFAULT '',
  steps        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  support_phone text       NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults (only if empty)
INSERT INTO manuals (type, title, steps) VALUES
  ('apertura', 'Apertura diaria', '[
    {"id":1,"text":"Encender el router y esperar 2 minutos a que estabilice la red."},
    {"id":2,"text":"Encender el ordenador principal."},
    {"id":3,"text":"Comprobar conectividad a Internet (abrir cualquier web)."},
    {"id":4,"text":"Verificar que todas las impresoras están encendidas y en línea."},
    {"id":5,"text":"Comprobar el estado de los KDS (deben mostrar \u201cSin comandas pendientes\u201d)."},
    {"id":6,"text":"Abrir la caja en la aplicación: Caja → Apertura de caja."},
    {"id":7,"text":"Encender las tablets una por una y comprobar que se conectan a la red."},
    {"id":8,"text":"Verificar que cada tablet muestra el nombre de usuario correcto."},
    {"id":9,"text":"Realizar un pedido de prueba con un artículo sin precio (o cancelarlo)."},
    {"id":10,"text":"Confirmar que el estado del sistema es correcto en Administración → Diagnóstico."}
  ]'::jsonb),
  ('cierre', 'Cierre diario', '[
    {"id":1,"text":"Comprobar que no hay mesas abiertas sin cerrar."},
    {"id":2,"text":"Comprobar que no hay pedidos pendientes de enviar o cobrar."},
    {"id":3,"text":"Verificar que los KDS no tienen comandas pendientes."},
    {"id":4,"text":"Cerrar la gestión de reparto si está activa."},
    {"id":5,"text":"Realizar el arqueo de caja: Caja → Cierre de caja."},
    {"id":6,"text":"Revisar las incidencias del día en Administración → Sistema."},
    {"id":7,"text":"Generar el informe de cierre (Z-report) e imprimirlo si es necesario."},
    {"id":8,"text":"Verificar o crear la copia de seguridad del día."},
    {"id":9,"text":"Cerrar las sesiones de todos los empleados."},
    {"id":10,"text":"Apagar las tablets y el ordenador principal (el router puede quedar encendido)."}
  ]'::jsonb),
  ('emergencia', 'Plan de emergencias', '[
    {"id":1,"situation":"Fallo de Internet","steps":["Las tablets en modo offline siguen operando normalmente.","Los KDS siguen funcionando en red local.","Las impresoras siguen funcionando en red local.","Al recuperar Internet, la sincronización es automática.","Contactar al proveedor de Internet si el corte supera 30 minutos."]},
    {"id":2,"situation":"Fallo de Wi-Fi","steps":["Reiniciar el router (botón trasero, 10 segundos).","Mientras, usar la tablet del encargado conectada por cable si es posible.","Si no hay solución, tomar comandas en papel y registrarlas al recuperar.","Al restaurar la red, sincronizar manualmente desde Administración → Dispositivos."]},
    {"id":3,"situation":"Impresora no responde","steps":["Comprobar que la impresora está encendida y en la red.","En la app: Administración → Impresoras → Probar conexión.","Activar la impresora alternativa configurada para esa zona.","Si falla todo: imprimir el ticket desde el ordenador principal."]},
    {"id":4,"situation":"KDS no muestra comandas","steps":["Comprobar que el navegador del KDS está abierto y conectado.","Recargar la página del KDS (F5 o ⌘R).","Si hay error de conexión, verificar la IP y la red.","Como alternativa, imprimir las comandas en la impresora de cocina."]},
    {"id":5,"situation":"Tablet averiada","steps":["El resto de tablets pueden cubrir la zona temporalmente.","Reasignar el camarero a otra tablet disponible.","Las mesas abiertas en la tablet averiada se pueden ver desde cualquier otra.","Notificar al técnico para reparación o sustitución."]},
    {"id":6,"situation":"Caja bloqueada","steps":["Contactar al encargado: tiene permiso de reapertura.","Desde el ordenador principal: Administración → Caja → Reabrir caja.","Si hay bloqueo total, registrar cobros en papel y cuadrarlos al desbloquear."]},
    {"id":7,"situation":"Corte eléctrico","steps":["Comprobar SAI/batería si existe.","Tomar comandas en papel durante el corte.","Al restaurar la luz, esperar que todos los dispositivos arranquen.","Verificar que el router y las impresoras han reiniciado correctamente.","Sincronizar manualmente las tablets antes de continuar."]},
    {"id":8,"situation":"Copia de seguridad fallida","steps":["Ir a Administración → Copias de seguridad → Estado.","Verificar el destino configurado y el espacio disponible.","Lanzar una copia manual desde el panel.","Si falla repetidamente, contactar al soporte técnico."]},
    {"id":9,"situation":"Error de facturación / VeriFactu","steps":["No procesar más facturas hasta resolver el problema.","Ir a Administración → Facturación → Estado VeriFactu.","Revisar el mensaje de error y reintentar la conexión.","Si persiste, anotar los tickets afectados y contactar soporte."]},
    {"id":10,"situation":"Ordenador principal no arranca","steps":["Intentar reinicio forzado (mantener botón de encendido 5s).","Conectar un monitor externo si no hay imagen.","Las tablets siguen operativas en modo local.","Contactar al técnico de soporte con urgencia."]}
  ]'::jsonb)
ON CONFLICT (type) DO NOTHING;

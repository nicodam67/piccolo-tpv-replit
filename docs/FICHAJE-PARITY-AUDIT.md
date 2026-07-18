# Auditoría de paridad — Módulo Fichaje
**Fecha:** 2026-07-18  
**Referencia:** Piccolo TPV — Control Horario

---

## 1. Resumen ejecutivo

El módulo de fichaje original era una aplicación independiente con sidebar propio, acceso por PIN y varias secciones administrativas. Tras la integración en Piccolo TPV se fragmentó en 7 botones independientes en el panel principal. Este documento audita el estado actual y registra las correcciones aplicadas en esta sesión.

---

## 2. Tabla de paridad por pantalla / función

| Función / Pantalla | Original | Piccolo TPV | Estado | Backend | Datos | Móvil | Notas |
|---|---|---|---|---|---|---|---|
| **Acceso único "Fichaje"** | ✅ | ✅* | Corregido | — | — | ✅ | *Antes: 7 botones separados; ahora: 1 botón |
| **Sidebar / menú interno** | ✅ | ✅ | Idéntico | — | — | ✅ | FichajeLayout con 17 secciones |
| **Vista general (panel diario)** | ✅ | ✅ | Parcial | ✅ | ✅ | ✅ | Falta: alertas, pausas activas en tiempo real |
| **Pantalla Fichar (reloj)** | ✅ | ✅ | Parcial | ✅ | ✅ | ✅ | Antes deshabilitado en móvil; ahora habilitado |
| **Selección de empleado** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | /api/fichaje/public/employees |
| **PIN personal** | ✅ | ⚠️ | Parcial | ✅ | ✅ | ✅ | El reloj no exige PIN; usa selección directa |
| **Entrada** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | clock_in via /api/fichaje/public/clock |
| **Salida** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | clock_out |
| **Inicio de pausa** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | break_start |
| **Fin de pausa** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | break_end |
| **Turno partido** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | No implementado |
| **Fichaje manual autorizado** | ✅ | ⚠️ | Parcial | ✅ | ✅ | ⚠️ | Solo admin via Registros |
| **Corrección de fichaje** | ✅ | ⚠️ | Parcial | ✅ | ✅ | ❌ | Sección Correcciones: placeholder |
| **Solicitud de corrección** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente de desarrollo |
| **Aprobación / Rechazo** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Justificación / Observaciones** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Historial de cambios** | ✅ | ⚠️ | Parcial | ✅ | ✅ | ❌ | Auditoría de cambios en logs pero sin UI |
| **Registros (tabla)** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | Filtros por empleado y fecha |
| **Empleados (gestión)** | ✅ | ✅ | Parcial | ✅ | ✅ | ✅ | Listado ok; edición/PIN pendiente de UI |
| **Turnos fijos** | ✅ | ✅ | Parcial | ✅ | ✅ | ⚠️ | UI básica; sin plantillas semanales |
| **Turnos variables** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Plantillas semanales** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente (Planificación: placeholder) |
| **Copiar semanas** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Planificación** | ✅ | ⚠️ | Placeholder | ❌ | ❌ | ❌ | Sección existe en sidebar |
| **Calendario** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Pausas (sección)** | ✅ | ⚠️ | Placeholder | ✅ | ✅ | ❌ | Datos en backend; sin UI propia |
| **Incidencias** | ✅ | ⚠️ | Placeholder | ⚠️ | ⚠️ | ❌ | Detección básica en backend |
| **Ausencias** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | Gestión de vacaciones, bajas, festivos |
| **Vacaciones (sección propia)** | ✅ | ⚠️ | Placeholder | ✅ | ✅ | ❌ | Datos en ausencias; sin sección dedicada |
| **Importación universal** | ✅ | ✅* | Mejorado | ✅ | ✅ | ✅ | *Reemplaza Anviz; admite CSV/TXT/XLS/XLSX/XML/JSON |
| **Vista previa importación** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | 10 primeras filas |
| **Detección duplicados en import** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | Backend filtra duplicados |
| **Historial importaciones** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | /api/fichaje/import/history |
| **Informes diario/semanal/mensual** | ✅ | ✅ | Parcial | ✅ | ✅ | ⚠️ | Tabla básica; sin gráficos |
| **Horas ordinarias / extraordinarias** | ✅ | ⚠️ | Parcial | ⚠️ | ⚠️ | ❌ | Sin umbral de horas extra configurado |
| **Retrasos** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Costes laborales** | ✅ | ⚠️ | Placeholder | ❌ | ❌ | ❌ | Sección en sidebar |
| **Exportar PDF / XLSX / CSV** | ✅ | ⚠️ | Parcial | ⚠️ | ⚠️ | ❌ | Solo CSV en informes; sin PDF |
| **Portal del empleado** | ✅ | ⚠️ | Placeholder | ❌ | ❌ | ❌ | Sección en sidebar |
| **Auditoría de cambios** | ✅ | ⚠️ | Placeholder | ✅ | ✅ | ❌ | Logs en backend; sin UI dedicada |
| **Configuración** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | Empresa, fichaje móvil, email |
| **Fecha/hora del servidor** | ✅ | ✅ | Idéntico | ✅ | ✅ | ✅ | Timestamps generados en servidor |
| **Registro del dispositivo** | ✅ | ⚠️ | Parcial | ✅ | ✅ | ⚠️ | Campo source guardado; sin device_id |
| **PWA móvil** | ✅ | ✅ | Parcial | ✅ | ✅ | ✅ | /fichaje accesible en móvil; sin service worker offline |
| **Modo sin conexión** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Bloqueo por intentos fallidos** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Login TPV sí; reloj de fichaje no |
| **Cierre mensual** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |
| **Resumen normativo (inspección)** | ✅ | ❌ | Falta | ❌ | ❌ | ❌ | Pendiente |

---

## 3. Cambios aplicados en esta sesión

### ✅ Completados

| Cambio | Descripción |
|---|---|
| **Acceso unificado** | 7 botones separados en el panel → 1 botón "Fichaje" que abre el módulo completo |
| **FichajeLayout** | Sidebar con 17 secciones: Vista general, Fichar, Registros, Empleados, Turnos, Planificación, Pausas, Incidencias, Correcciones, Vacaciones, Ausencias, Importación, Informes, Costes, Portal, Configuración, Auditoría |
| **Fichaje móvil habilitado** | `mobileClockEnabled = true` en DB; `/fichaje` ahora funciona en móvil |
| **Rutas consolidadas** | Todas las rutas `/admin/fichaje/*` usan FichajeLayout con navegación interna |
| **Eliminación de Anviz** | FichajeImportarAnviz → FichajeImportar: universal CSV/TXT/XLS/XLSX/XML/JSON |
| **Pantalla login** | Employee cards visibles en modo oscuro; botón "Acceso administrador" añadido |
| **Nuevas rutas** | /admin/fichaje/empleados, /planificacion, /pausas, /incidencias, /correcciones, /vacaciones, /costes, /portal, /auditoria |
| **Sección Empleados** | Lista completa de personal con búsqueda |

### ⚠️ Pendientes (requieren desarrollo adicional)

| Función | Prioridad | Notas |
|---|---|---|
| PIN en reloj de fichaje | Alta | El reloj actual usa selección directa; añadir verificación de PIN |
| Turno partido | Alta | Registro de segunda entrada/salida en el mismo día |
| Correcciones con flujo de aprobación | Alta | Solicitar → aprobar/rechazar → historial |
| Planificación semanal | Media | Plantillas, copiar semanas, publicar |
| Calendario de presencia | Media | Vista mensual/semanal |
| Costes laborales | Media | Coste por empleado y período |
| Portal del empleado | Media | Acceso personal del empleado |
| Cierre mensual | Media | Congelación de período |
| Horas extraordinarias | Media | Umbral configurable, acumulado |
| Retrasos | Baja | Comparativa turno previsto vs real |
| Modo sin conexión | Baja | Service worker + sync en background |
| Bloqueo por intentos | Baja | Rate limiting en reloj de fichaje |
| Exportar informes a PDF | Baja | Backend con jsPDF o servidor |

---

## 4. Navegación — estado actual

```
Panel de Administración
└── Fichaje  ← único acceso, redirige a /admin/fichaje
    ├── Vista general   (/admin/fichaje)
    ├── Fichar          (/fichaje)         ← reloj público, accesible sin auth
    ├── Registros       (/admin/fichaje/registros)
    ├── Empleados       (/admin/fichaje/empleados)
    ├── Turnos          (/admin/fichaje/turnos)
    ├── Planificación   (/admin/fichaje/planificacion)  [placeholder]
    ├── Pausas          (/admin/fichaje/pausas)          [placeholder]
    ├── Incidencias     (/admin/fichaje/incidencias)     [placeholder]
    ├── Correcciones    (/admin/fichaje/correcciones)    [placeholder]
    ├── Vacaciones      (/admin/fichaje/vacaciones)      [placeholder]
    ├── Ausencias       (/admin/fichaje/ausencias)
    ├── Importación     (/admin/fichaje/importar)
    ├── Informes        (/admin/fichaje/informes)
    ├── Costes          (/admin/fichaje/costes)          [placeholder]
    ├── Portal          (/admin/fichaje/portal)          [placeholder]
    ├── Configuración   (/admin/fichaje/configuracion)
    └── Auditoría       (/admin/fichaje/auditoria)       [placeholder]
```

---

## 5. Backend — rutas disponibles

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| /api/fichaje/public/employees | GET | No | Lista de empleados para reloj |
| /api/fichaje/public/clock-status | GET | No | Estado del fichaje móvil |
| /api/fichaje/public/my-status/:id | GET | No | Estado actual del empleado |
| /api/fichaje/public/clock | POST | No | Registrar entrada/salida/pausa |
| /api/fichaje/records | GET | ✅ | Todos los registros con filtros |
| /api/fichaje/records/today | GET | ✅ | Registros de hoy |
| /api/fichaje/records | POST | ✅ | Crear registro manual |
| /api/fichaje/records/:id | PUT | ✅ | Corregir registro |
| /api/fichaje/shifts | GET/POST | ✅ | Turnos |
| /api/fichaje/shifts/:id | PUT/DELETE | ✅ | Editar/eliminar turno |
| /api/fichaje/absences | GET/POST | ✅ | Ausencias |
| /api/fichaje/import | POST | ✅ | Importar registros |
| /api/fichaje/import/history | GET | ✅ | Historial de importaciones |
| /api/fichaje/settings | GET/PUT | ✅ | Configuración |

---

## 6. Tablas de base de datos

| Tabla | Descripción |
|---|---|
| `employees` | Empleados compartidos con módulo HR |
| `fichaje_records` | Registros de entrada/salida/pausa |
| `fichaje_breaks` | Descansos activos e histórico |
| `fichaje_shifts` | Definición de turnos |
| `fichaje_shift_assignments` | Asignación de turnos a empleados |
| `fichaje_absences` | Ausencias, vacaciones, bajas |
| `fichaje_settings` | Configuración global del módulo |
| `fichaje_import_history` | Historial de importaciones |

---

## 7. Separación Login TPV ↔ Fichaje

Confirmado que ambos sistemas son independientes:

| Aspecto | Login TPV | Reloj Fichaje |
|---|---|---|
| Pantalla | `/` (login.tsx) | `/fichaje` (FichajeReloj.tsx) |
| Propósito | Acceso operativo al TPV | Registro de jornada laboral |
| Autenticación | JWT + PIN → token en localStorage | Selección de empleado (PIN pendiente) |
| Acción en entrada | Establece sesión operativa | Crea registro fichaje_records |
| Datos | employees + jwt | employees + fichaje_records |
| ¿Comparte empleado? | ✅ Sí, misma tabla employees | ✅ Sí |
| ¿Comparte sesión? | No — son flujos independientes | No |

---

## 8. Riesgos pendientes

| Riesgo | Nivel | Acción recomendada |
|---|---|---|
| Reloj sin PIN | Alto | Añadir verificación de PIN antes de registrar fichaje |
| Sin modo offline | Medio | Service worker con cola de fichajes pendientes |
| Sin bloqueo por intentos | Medio | Rate limiting en /api/fichaje/public/clock |
| Cierre mensual sin UI | Medio | Implementar cierre + exportación normativa |
| Costes sin cálculo real | Bajo | Vincular coste/hora desde contrato en HR |
| Exportación PDF | Bajo | Añadir endpoint de generación de PDF |

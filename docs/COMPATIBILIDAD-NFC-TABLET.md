# Compatibilidad NFC — Tablet de Fichaje

> ⚠️ **IMPLEMENTACIÓN PREPARADA — PENDIENTE DE VALIDACIÓN FÍSICA CON HARDWARE REAL**
> El código de Web NFC está integrado y preparado, pero requiere una tablet Android
> real con NFC y Chrome 89+ para verificar el funcionamiento completo.

---

## Requisitos mínimos

| Requisito | Valor mínimo |
|-----------|--------------|
| Navegador | Chrome 89+ para Android |
| Sistema operativo | Android 9 (Pie) o superior |
| Protocolo | **HTTPS obligatorio** (el PIN como alternativa funciona en HTTP) |
| Hardware | Tablet con chip NFC integrado |
| Permisos | NFC habilitado en Ajustes del dispositivo |

---

## Compatibilidad por navegador

| Navegador | NFC | Notas |
|-----------|-----|-------|
| Chrome 89+ Android | ✅ Soportado | Versión principal recomendada |
| Chrome iOS | ❌ No soportado | Apple no permite Web NFC |
| Safari iOS | ❌ No soportado | Limitación de Apple |
| Firefox Android | ❌ No soportado | No implementado |
| Samsung Internet | ⚠️ Parcial | Requiere prueba con hardware |
| Edge Android | ⚠️ Parcial | Basado en Chromium, puede funcionar |

---

## Modelos de tablet probados (pendiente de validación)

> **Ningún modelo ha sido validado físicamente todavía.** La lista siguiente es
> orientativa basada en especificaciones de hardware.

| Modelo | NFC | Android | Estado |
|--------|-----|---------|--------|
| Samsung Galaxy Tab A8 | ✅ Tiene NFC | 11+ | Pendiente validación |
| Samsung Galaxy Tab S7/S8 | ✅ Tiene NFC | 11+ | Pendiente validación |
| Lenovo Tab P11 Pro | ✅ Tiene NFC | 11+ | Pendiente validación |
| iPad (cualquier modelo) | ❌ No Web NFC | iOS | No compatible |
| Amazon Fire HD | ❌ No Chrome | Fire OS | No compatible |

---

## Cómo detecta el sistema la compatibilidad

El hook `useNfc.ts` comprueba en el arranque:

```javascript
const isSupported = 'NDEFReader' in window;
```

- **NFC disponible** → pantalla de espera con animación de tarjeta + botón "Usar PIN"
- **NFC no disponible** → badge "NFC no disponible" + cuadrícula de empleados + PIN directamente

---

## Tipos de tarjeta compatibles

| Tipo | Compatible |
|------|-----------|
| MIFARE Classic (NDEF) | ✅ |
| NTAG213 / 215 / 216 | ✅ |
| FeliCa | ⚠️ Depende del dispositivo |
| ISO 15693 | ❌ No soportado por Web NFC |

Solo se usa el **Serial Number (UID)** de la tarjeta, no se leen ni escriben datos NDEF.

---

## Seguridad

- El UID de la tarjeta **nunca se almacena**. Solo su hash SHA-256 en servidor.
- Si la tarjeta se pierde, el administrador la revoca y la hash queda invalidada.
- El UID no viaja en texto claro por la red — se envía tal cual y el servidor lo hashea.
- Sin clave privada en la tarjeta → el sistema es resistente a duplicación de tarjeta
  (un duplicado físico tendría el mismo UID y funcionaría; por eso se combina con
  auditoría de ubicación/dispositivo).

---

## Limitaciones conocidas

1. **Web NFC no está disponible en escritorio** — Safari, Firefox, Edge escritorio.
2. **El lector se activa una vez** — si el usuario navega fuera y vuelve, hay que reiniciar.
3. **Sin PIN adicional tras NFC por ahora** — se muestra directamente la pantalla de acciones.
4. **Sin soporte multi-tarjeta simultáneo** — solo una tarjeta a la vez.
5. **Sin validación offline** — si no hay red, el fichaje NFC no puede completarse.

---

## Alternativas cuando NFC no está disponible

1. **PIN** — siempre disponible como fallback en la misma pantalla de la tablet.
2. **Fichaje móvil** — los empleados pueden fichar desde su móvil en `/fichaje` si está habilitado.
3. **Fichaje manual** — el administrador puede añadir registros manualmente desde Personal y Fichaje → Correcciones.

---

## Preguntas frecuentes

**¿Funciona con llaveros NFC?**
Sí, cualquier llavero con chip NTAG o MIFARE que tenga un UID único.

**¿Puede usarse la misma tarjeta para dos empleados?**
No — el sistema rechaza asignar un UID ya registrado a otro empleado.

**¿Qué pasa si alguien acerca dos tarjetas a la vez?**
El lector lee la primera y la ignora durante 5 segundos (anti-rebote).

**¿Se puede revocar una tarjeta perdida?**
Sí — desde Personal y Fichaje → Empleados → editar empleado → Tarjetas NFC → Revocar.

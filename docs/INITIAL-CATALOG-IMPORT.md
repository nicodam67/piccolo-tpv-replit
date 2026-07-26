# Importación inicial de la carta

## Flujo

Administración → Hardware → Instalación y certificación → **Carta inicial**.

La etapa es opcional:

1. subir CSV, XLSX o JSON compatible con exportación QR Menú;
2. revisar la vista previa;
3. corregir filas;
4. validar;
5. confirmar.

No se escribe en `categories` ni `products` durante upload, preview o corrección.

## Validaciones

- nombre, categoría y precio;
- IVA 4/10/21;
- departamento activo y asignable;
- 14 alérgenos UE, con aliases de la exportación QR;
- URL de imagen HTTPS;
- código duplicado en archivo/base;
- nombre duplicado dentro de categoría;
- categoría nueva indicada antes de confirmar.

Los duplicados se omiten. Solo un administrador puede activar **Actualizar productos duplicados**.

## Formatos

CSV/XLSX Piccolo:

```text
nombre,codigo,categoria,precio,coste,iva,zona_prep,alergenos,
visible_tpv,visible_qr,activo,descripcion,precio_media,cantidad,
agotado,vegetariano,vegano,sin_gluten,picante,imagen,traducciones
```

JSON QR compatible:

- `{ categories: [{ name, translations, products: [...] }] }`;
- `{ categories: [...], menuItems: [...] }`;
- `{ products: [...] }`;
- array plano de productos.

Se preservan, cuando existen:

- categorías y traducciones;
- productos y traducciones;
- precio y media ración;
- disponibilidad QR y activo;
- agotado;
- etiquetas dietéticas;
- alérgenos;
- URL de imagen HTTPS.

## Catálogo autoritativo

El único catálogo operativo es PostgreSQL:

- TPV y pedidos leen `categories/products`;
- QR Menú integrado (`/carta`) lee `/api/public/menu`;
- el importador escribe esas mismas tablas;
- la carta pública reconsulta cada 30 segundos y al recuperar visibilidad;
- productos agotados permanecen visibles con marca `AGOTADO`.

El artefacto Convex antiguo no se incluye en el instalador RC y no recibe escrituras. Para un restaurante que aún lo use, se realiza una importación única hacia TPV y después se desactiva su edición. No se crea una sincronización bidireccional ni un segundo catálogo.

## Auditoría e informe

Cada sesión registra:

- usuario;
- fecha;
- nombre/hash del archivo;
- upload, validación, confirmación o descarte;
- filas importadas, actualizadas, omitidas y fallidas;
- categorías creadas.

El informe se obtiene desde `/api/admin/catalog-import/sessions/:id/report`.

Los previews se guardan bajo `PICCOLO_UPLOAD_ROOT/catalog-imports` con permisos privados y caducan a las 72 horas si no se confirman.

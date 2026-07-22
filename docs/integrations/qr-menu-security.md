# Seguridad de QR Menu API v1

- Autenticacion M2M: `Authorization: Bearer`.
- Secreto dedicado: `PICCOLO_QR_MENU_API_TOKEN`, minimo 32 caracteres.
- No se aceptan tokens en URL, query string, cookies de empleados ni JWT del TPV.
- La comparacion es constante mediante `timingSafeEqual`.
- Si el token no esta configurado, la integracion responde 503.
- Token ausente o incorrecto: 401 generico.
- Rate limit: 60 solicitudes por minuto e IP; exceso: 429.
- Pino redacta `Authorization` y la URL de acceso no registra queries.

Rotacion:

1. configurar un token aleatorio nuevo en ambos servidores;
2. desplegar primero el consumidor preparado;
3. cambiar el token del TPV;
4. retirar el anterior y comprobar 401;
5. revisar logs sin registrar valores.

La revocacion inmediata se realiza eliminando la variable del TPV, lo que desactiva la API con 503. La integracion productiva permanece desactivada por defecto.

# Telemetría del navegador (SigNoz)

El frontend envía a SigNoz una traza por cada llamada a la API y los errores que nadie atrapó, para poder ver desde el servidor
qué le pasó a una persona. Código en `src/telemetry/`.

## Qué viaja

| Qué | Dónde se ve en SigNoz |
|---|---|
| Cada llamada de `utils/http.ts` | Servicio `crm-frontend`, span `HTTP POST /invoices/:id/lines`. Enlazado con la traza del gateway y de los servicios (cabecera `traceparent`): una sola traza de punta a punta |
| Errores de Vue, `window.onerror` y promesas rechazadas | Span `frontend.error` con la excepción y su pila (pestaña Exceptions) |
| Contexto en cada span | `app.route`, `app.user_id`, `app.org_id`, `app.locale`, `app.viewport`, versión del front (`service.version`) |
| Cuerpo de la petición y de la respuesta | **Solo si la llamada falla** (excepto 401): `app.http.request_body` y `app.http.response_body`, enmascarados |

Buscar un caso: en Traces, filtrar `serviceName = crm-frontend` y `hasError = true`; con `app.user_id` o `app.org_id` se acota a una
persona u organización. Para ver qué hizo el backend, abrir la traza: el árbol continúa en el gateway y los servicios.

## Qué NO viaja, y cómo se enmascara (`sanitize.ts`)

El enmascarado ocurre en el navegador, antes de enviar:

- **Secretos** (contraseñas, tokens, claves, certificado `.p12`, tarjetas) → `[REDACTED]`. Nunca hacen falta para reproducir un error.
- **Datos personales** (identificación, correo, teléfono, nombres, direcciones) → se conserva la forma y no el valor:
  `0912345678` → `9999999999`, `Juan Pérez` → `Xxxx Xxxxx`. Sirve para reproducir errores de validación sin saber de quién son.
- **El resto** (ids, cantidades, importes, códigos) → tal cual: es lo que hace falta para replicar el caso.
- Archivos y formularios no se serializan (`[binary]`). Cada cuerpo se acota a 4 000 caracteres, 20 elementos por lista, 6 niveles.
- No se envían cabeceras (ni `Authorization`), ni el correo o nombre del usuario: `app.user_id` es un id.

Al añadir un campo sensible nuevo a la API, revisar `SECRET_KEY` y `PERSONAL_KEY` en `sanitize.ts` si su nombre no coincide con
los patrones existentes. Hay pruebas en `telemetry.test.ts`.

## Cómo llega

Navegador → `POST {VITE_API_URL}/telemetry/v1/traces` (gateway) → colector del clúster → SigNoz. El navegador no llega a la red de
observabilidad. En el gateway esa ruta es **pública** (los errores del login ocurren sin sesión) y por eso está acotada: solo ese
endpoint exacto, solo `POST`, 256 KB máximo, 60 peticiones por minuto por IP, y no cuenta en el límite global de la persona. Sin
`TELEMETRY_COLLECTOR_URL` en el gateway la ruta no existe.

Cualquiera puede enviar spans a esa ruta (no hay secreto que valga en un navegador): lo que se ve en SigNoz como `crm-frontend` es
indicativo, no una prueba. El límite por IP y el tamaño acotan el daño.

## Variables (Vite)

| Variable | Efecto |
|---|---|
| `VITE_OTEL_ENABLED` | `true` / `false` fuerza el valor. Por defecto: activa solo en el build de producción (en desarrollo no hace nada) |
| `VITE_OTEL_SAMPLE_RATIO` | Fracción de trazas enviadas, 0 a 1. Por defecto 1 |
| `VITE_APP_VERSION` | La pone el CI (SHA del commit). Sale como `service.version` |

Para probarlo en local: `VITE_OTEL_ENABLED=true` en `.env.local` y un gateway con `TELEMETRY_COLLECTOR_URL`.

## Cómo funciona por dentro

- `index.ts` es la parte ligera: solo usa `@opentelemetry/api`, que sin SDK es un no-op. `utils/http.ts` la llama siempre.
- `start.ts` registra el SDK completo y solo se importa de forma dinámica **después de montar la app** (otro archivo de ~16 KB gzip):
  activar la telemetría no retrasa la primera pantalla.
- Los errores ocurridos antes de que el SDK cargue se guardan (máx. 10) y salen cuando está listo. Se limitan a 10 por minuto y no se
  repite el mismo.
- La telemetría nunca debe romper la app: todo lo de arranque va dentro de `try/catch`.

## ⚠️ Orden de despliegue

El navegador añade `traceparent` a cada llamada. Si el frontend sale ANTES que el gateway, el gateway rechaza el preflight de CORS y
**fallan todas las llamadas de la aplicación**. Desplegar primero `api-gateway-node` (que ya permite `traceparent`) y después el frontend.

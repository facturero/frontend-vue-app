# Plan de pruebas — casos de uso e invariantes del CRM

Elaborado el 2026-09-05 sobre inventario real del código (no sobre los docs de diseño de
`Documents/sg-obs/crm-proyect`, que en varios puntos están desactualizados respecto al
código — cada divergencia encontrada se marca explícitamente como tal).

**Cómo leer este documento**: cada regla trae dónde vive en el código (archivo:línea),
qué la dispara, si es síncrona o depende de un evento RabbitMQ, y el estado de cobertura
en `frontend/e2e/specs/`. `⚠️` marca comportamiento que el propio sistema documenta como
esperado pero que el código **no garantiza** — son los candidatos de mayor valor para
tests E2E, porque hoy revelarían un bug real, no solo un happy path.

Requisito transversal para correr estos tests: RabbitMQ arriba y, como mínimo,
`auth-service`, `organization-service`, `customer-service`, `product-service`,
`billing-service`, `fiscal-ecuador` y `plugin-catalog-service` con sus consumers
arrancados (`RABBITMQ_URL` seteado) — varias reglas de este documento simplemente no
ocurren si el broker no está disponible.

---

## Resumen ejecutivo — hallazgos críticos (bugs reales, no solo huecos de test)

| # | Hallazgo | Servicio | Impacto |
|---|---|---|---|
| 1 | ✅ **CORREGIDO (2026-09-06)** — el secuencial de número de factura ya se lee e incrementa **con lock atómico** (`SELECT...FOR UPDATE` dentro de la transacción de emisión) pese a que antes no había lock y tampoco constraint único en `invoices.number` | billing-service | Antes: dos emisiones concurrentes sobre el mismo punto de emisión podían generar el mismo número. Ahora: la serie se lee con `lock: true`, se provisiona con `INSERT ... IGNORE` (`createIfAbsent`) y se relee con lock; dos emisiones paralelas se serializan y obtienen folios distintos |
| 2 | ✅ **CORREGIDO (2026-09-06)** — agregar una línea con `productId` inexistente **falla limpio**: el `ProductCatalogPort` distingue 404 (`null` → `ProductNotFoundError`, 400) de catálogo caído/5xx/red (lanza `ProductCatalogError` → 503). Antes se creaba la línea sin snapshot ni impuestos, silenciosamente | billing-service | Factura con datos incompletos sin aviso: ya no ocurre; el error de dominio llega al cliente |
| 3 | ⚠️ Anular una factura ya autorizada por el SRI (`billing.invoice.voided`) **no dispara nada** en fiscal-ecuador — no hay nota de crédito ni handler | billing-service / fiscal-ecuador | Estado comercial y fiscal quedan inconsistentes |
| 4 | La validación de cédula/RUC ecuatoriano (dígito verificador) **existe en código pero no está conectada** a ningún caso de uso; solo se aplica el `regex` del catálogo | customer-service | Una identificación con dígito verificador inválido puede pasar si el regex no lo cubre |
| 5 | ✅ **CORREGIDO (2026-09-06, hallazgo #22)** — `update-customer` ahora revalida unicidad de identificación al cambiarla: hace un pre-check con `repos.findByIdentification` y lanza `CustomerAlreadyExistsError` → **409 CUSTOMER_EXISTS**; además el errorHandler de customer-service mapea `SequelizeUniqueConstraintError` → 409 como safety net ante carreras que crucen el pre-check. Antes el constraint UNIQUE de la BD chocaba y respondía **500 INTERNAL_ERROR** no mapeado | customer-service | Cambiar la cédula a la de otro cliente de la misma organización ya responde 4xx de dominio limpio y NO deja el cliente con identificación duplicada |
| 6 | ✅ **CORREGIDO (2026-09-06)** — `disable-user.ts` ahora tiene guard anti-lockout: si el target ES admin (rol `Administrador` de la org) y NO queda OTRO admin no-owner activo (se excluyen al target y al `org.ownerId`; los miembros desactivados tampoco cuentan), lanza `LastAdminRemovalError` → **409 LAST_ADMIN_REMOVAL**. El owner seguía protegido por `org.ownerId`. Reescrito `disable-user.test.ts` (7 casos) | auth-service | Antes: con 2+ admins sin ninguno marcado como owner se podía desactivar a todos (lockout). Ahora: el último admin no-owner no se puede desactivar; probado por API en known-bugs BUG #6 |
| 7 | No existe MFA/TOTP para login de usuarios (el doc lo describe como núcleo del flujo) — el único TOTP real es para emparejar terminales POS | auth-service | Cualquier test que asuma 2FA de usuario fallará porque no existe |
| 8 | No hay flujo público de "olvidé mi contraseña" — el reset es una acción **administrativa** sobre otro usuario | auth-service | UX/expectativa de producto a confirmar con el usuario |
| 9 | ✅ **CORREGIDO (2026-09-06)** — revocar/editar permisos de un rol ya invalida la sesión activa de sus miembros. `auth-service` expone `GET /internal/users/:userId/access-context` (protegido por `X-Internal-Secret`); el gateway consulta el permissions-version (`users.permissions_version`) con caché TTL 10s (`permissions-cache.ts`, fail-open) y en cada ruta autenticada compara el `pv` del JWT con el actual; si difieren → **401 TOKEN_STALE** (el cliente refresca). El payload de outbox `identity.role.updated` ahora incluye `userIds` y el hub realtime emite `permissions.changed` a la sala `user:<uid>` (el frontend re-fetchea `me`). Antes el JWT vigente seguía sirviendo hasta refresh/expirar (900s) | auth-service / api-gateway-node / frontend | Ventana de permisos obsoletos tras un cambio de rol: antes 900s; ahora 0 (evento-socket / TTL-10s). Probado por API en known-bugs BUG #9 (usuario fixture dedicado, el admin no se toca) |
| 10 | `organization-service` no consume ningún evento de tax-service pese a que el doc lo describe — el catálogo de países habilitados depende de un seed manual | organization-service | Sin código reactivo real; solo funciona para países pre-sembrados |
| 11 | `inventory-service` no tiene código (solo specs) — facturar una línea de un producto "bien" **no descuenta stock**, pese a que `billing-service` publica el evento esperado | billing-service / inventory-service | Cualquier test de descuento de inventario fallará: la función no existe |
| 12 | No existe generación de RIDE (PDF con QR del SRI) en ningún servicio, pese a estar documentado como endpoint | fiscal-ecuador | El único PDF del sistema es el "comercial" no oficial |
| 13 | Sin expiración automática de certificados `.p12` — un certificado vencido sigue usándose como activo hasta revocación manual | fiscal-ecuador | — |
| 14 | ⚠️ **REVISADO 2026-09-05** — la premisa original ("ni identificación, ni tag… tienen constraint único; solo checks TOCTOU") era **falsa**: la migration 2026-07-06 crea constraints UNIQUE reales en `customers(organization_id, identification)`, `tags(organization_id, name)` e `identification_types(country_code, code)`. El perdedor de una carrera duplicada choca `ER_DUP` → **500 no mapeado** (hallazgo #22). Los casos pendientes de verificar: establecimientos, categorías, unidades y rol | varios | Test de concurrencia revalidado (known-bugs BUG #14) — seguía verde pero con nueva interpretación |
| 15 | El filtrado de empleados por establecimiento y el rol admin de sesión POS dependen de encontrar un rol con el string exacto `'Administrador'` — sin ese nombre, falla en silencio | auth-service | Frágil ante renombres futuros |
| 16 | ✅ **CORREGIDO** — `disable()` en `frontend/src/stores/customers.ts:78-87` era la única acción de ese store sin `try/catch` — un 403 del backend (ej. al intentar deshabilitar CONSUMIDOR FINAL) nunca llegaba a `store.error`, y la vista tampoco lo atrapaba. Arreglado con el mismo patrón que el resto de acciones (`error.value = extractError(e)` + rethrow); `CustomersListView.vue`/`CustomerDetailView.vue` ya renderizaban el `<v-alert>` de `store.error`, así que el mensaje ahora es visible. `customers.spec.ts` actualizado A PROPÓSITO para afirmar el error visible en vez del fallo silencioso | frontend | Antes: el usuario hacía clic, confirmaba, y no pasaba nada visible — ni error ni cambio, sin explicación. Ahora: el `<v-alert>` muestra el motivo del 403 |
| 17 | Los módulos `org.establishments` y `crm.contacts` no se activan automáticamente al crear una organización nueva — hay que activarlos explícitamente (normalmente desde `/plugins`) antes de poder ver establecimientos o clientes | plugin-catalog-service | Onboarding real requiere un paso de activación de plugins no documentado en ningún lado |
| 18 | ✅ **CORREGIDO** — `auth.needsOrgSetup` dependía de `user.orgName`, poblado por el consumer local de `auth-service` sobre `organization.org.updated` (hasta ~30s de latencia observada). Arreglado: `GetMeUseCase` ahora consulta a `organization-service` directo por HTTP síncrono (`auth-service/src/infrastructure/http/organization-http-repository.ts`, mismo patrón que `HttpOrganizationCatalog` en billing-service) en vez de esperar el evento — el dato llega en la misma respuesta del PUT, sin espera | auth-service | Antes: el router rebotaba a `/organization/settings` hasta 30s tras completar el perfil. Ahora: inmediato |
| 19 | ✅ **CORREGIDO** — en `fiscal-ecuador/src/infrastructure/messaging/consumer.ts`, los 3 registros de error tempranos (sin certificado, .p12 ilegible, password no descifra) usaban `access_key: ''` como placeholder — pero `access_key` tiene `UNIQUE` en la tabla. La PRIMERA factura de todo el sistema en cualquiera de esos 3 casos se guardaba bien; **todas las siguientes fallaban el INSERT por violar la unicidad**, reintentaban 3 veces y escalaban a la cola de retry sin dejar rastro. Arreglado generando una clave de acceso real (`buildAccessKey`, los mismos datos ya vienen en el payload, no depende del certificado) en vez de la cadena vacía | fiscal-ecuador | Antes: después de la primera factura sin certificado en todo el entorno, ninguna otra factura en ese mismo caso (de NINGUNA organización) quedaba registrada — el error desaparecía en silencio. Ahora: cada una se registra con su propia clave única |
| 20 | ✅ **CORREGIDO** — `clientIp()` en `api-gateway-node/src/core/create-gateway.ts` solo leía `X-Forwarded-For`/`CF-Connecting-IP` (headers que nunca llegan sin un proxy externo delante) y caía al literal `'unknown'` para **todo** el tráfico directo — colapsando el rate limit de todos los clientes en un único balde compartido, y ese string nunca podía matchear ninguna IP/CIDR confiable (`ipToNumber('unknown') === null`). Además, `trusted-ip-cache.ts` apagaba el fallback de `RATE_LIMIT_TRUSTED_IPS` en cuanto auth-service respondía (aunque fuera con 0 IPs configuradas), y el CIDR de ese fallback (`172.17.0.0/16`) no coincidía con la subred real de Docker (`172.18.0.0/16`). Arreglado: `clientIp()` usa `getConnInfo` (socket real) y desmapea IPv4-en-IPv6 (`::ffff:x.x.x.x`); el cache usa el fallback cuando la lista de auth-service viene vacía; CIDR corregido a `172.16.0.0/12` | api-gateway-node | Antes: cualquier corrida de la suite completa (o tráfico interno real sin proxy) competía por una sola cuota de 120 req/min compartida por TODOS los clientes, produciendo `429` sin relación con la regla probada. Ahora: tráfico interno/confiable obtiene la cuota elevada (1200/min) correctamente |
| 21 | ✅ **CORREGIDO** — `addImageSchema` en `product-service/src/interface/http/validators.ts` tenía `isPrimary: z.boolean().default(false)` y `position: z.number().int().default(0)`. Como el frontend nunca manda esos campos al subir una imagen, Zod los convertía de "ausentes" a `false`/`0` **explícitos** antes de llegar al caso de uso — y `AddProductImageUseCase` decide `isPrimary: input.isPrimary ?? isFirst` / `position: input.position ?? existingImages.length`, un `??` que nunca ve `undefined` si el valor ya es `false`/`0`. Resultado: NINGUNA imagen se marcaba como principal jamás (todas `isPrimary:false`) y todas quedaban en `position:0`. Arreglado quitando el `.default()` (ahora `.optional()`) para que "no lo mandé" llegue como `undefined` de verdad | product-service | Antes: la miniatura de producto en listados (`imageFileId`, que busca la imagen `isPrimary`) siempre era `null` aunque el producto tuviera imágenes subidas; el chip "Principal" nunca aparecía en `ProductDetailView.vue`. Ahora: la primera imagen subida queda marcada principal y las posiciones incrementan correctamente |
| 23 | ⚠️ **NUEVO (revisión 2026-09-06)** — `plugin-catalog-service` arranca el `OutboxRelay` (main.ts) pero **nunca llama a `relay.notify()`** tras escribir en el outbox: el evento `plugin.deactivated`/`plugin.activated` se queda en la BD hasta que el safety-net periódico del relay (`safetyNetIntervalMs = 30s` en `@facturero/outbox-relay`) dispara el drain — activar/desactivar un plugin tarda **0-30s AL AZAR** en reflejarse en el gate del gateway. Medido en vivo: con caché tibia el 403 llegó a los **14.4s**; la suite completa falló dos veces al sondear solo 20s | plugin-catalog-service | La "invalidación al instante por evento `plugin.*`" de §7 no se cumple; los toggles de plugins llegan tarde e impredictiblemente al gateway. Fix sugerido (fuera de alcance del e2e): `relay.notify()` tras el COMMIT del outbox |
| 22 | ✅ **CORREGIDO (2026-09-06)** — `update-customer` NO revalidaba unicidad de identificación al cambiarla (solo `create-customer` lo hacía). La migration 2026-07-06 tiene el constraint UNIQUE `customers_organization_id_identification`; el `upsert` de `repos.save` chocaba y el `SequelizeUniqueConstraintError` NO estaba mapeado → **500 INTERNAL_ERROR**. Se corrigió en dos capas: (1) pre-check de unicidad en `update-customer.ts` (si la identificación efectiva cambia y pertenece a otro `customer.id` → `CustomerAlreadyExistsError`, 409 `CUSTOMER_EXISTS`); (2) safety net en `middlewares.ts` de customer-service mapeando cualquier `SequelizeUniqueConstraintError` restante → 409 `CUSTOMER_EXISTS`. Nuevo `update-customer.test.ts` (3 casos: ok conservando propia identificación + outbox; rechazo de identific. ajena duplicada sin `save`; permitido limpiar/poner null). Ya no existe el 500 no mapeado | customer-service | Antes: cambiar la cédula a la de otro cliente = 500 en vez de 4xx de dominio limpio (aunque la BD nunca dejaba duplicar). Ahora: 409 `CUSTOMER_EXISTS` limpio, probado por API en known-bugs BUG #5 |
| 24 | ✅ **CORREGIDO (2026-09-06)** — `api-gateway-node/src/config/gateway.config.ts` no tenía ninguna regla explícita para `POST /auth/password-reset` — caía en el catch-all `{ method: 'ANY', path: '/auth/*', public: false }`, así que el gateway exigía un Bearer token válido **antes** de reenviar la petición a auth-service. El endpoint existe específicamente para que alguien SIN sesión activa (que olvidó su contraseña) pueda establecer una nueva desde el link de correo — con este bug, esa persona nunca podía llegar ni siquiera a que auth-service evaluara si el token era válido: 401 `UNAUTHORIZED` del gateway mismo, no un error de dominio. Encontrado escribiendo el test de "reusar un token consumido" (§1.4) — verificado con curl antes y después. Arreglado agregando `{ method: 'POST', path: '/auth/password-reset', service: 'auth-service', public: true }`, mismo patrón que `/auth/accept-invite` | api-gateway-node | Antes: el flujo completo de "restablecer contraseña" (§1.4) era inutilizable de punta a punta para su caso de uso real, aunque el resto de la cadena (generar token, emitir evento, UI de "nueva contraseña") funcionara bien. Ahora: el link del correo funciona sin sesión activa, como se espera |

**Nota operativa (latencia del OutboxRelay)**: además de la propagación de eventos ya
documentada arriba, el propio `OutboxRelay` que publica a RabbitMQ (polling periódico
sobre la tabla `outbox_messages`) mostró latencia muy variable en este entorno durante
las pruebas — desde ~1s hasta 25s+ para el mismo tipo de evento en corridas distintas.
En plugin-catalog se encontró la CAUSA RAÍZ de ese pico (hallazgo #23): el relay solo
se despierta por su safety-net de `safetyNetIntervalMs = 30s` porque nadie llama a
`relay.notify()` tras escribir el outbox — latencia por tanto aleatoria en (0, 30s].
Cualquier test que dependa de un evento cruzando servicios necesita un margen de
polling generoso (45-60 intentos de 1s, no 15) — ver `invoices.spec.ts` y
`fiscal.spec.ts` para el patrón ya aplicado y `plugins.spec.ts` para el caso #23.

**Ojo con el cap por defecto de Playwright (30s/test)**: en el entorno reconstruido
desde cero (`docker compose down -v` + build, 2026-09-06) la cadena completa
perfil → `organization.org.updated` → CONSUMIDOR FINAL + Matriz midió **~29s de peor
caso** (sonda API), muy por encima de los ~1-15s de corridas anteriores. Peor aún,
cualquier test que espera un evento cruzando servicios presupuesta 40-45 intentos de
1s — un presupuesto que el cap de 30s **corta a la mitad** en la práctica. Se manifestó
como error intermitente en el mismo test que a veces pasaba en 17s y a veces moría en
30s (`onboarding.spec.ts`, `invoices.spec.ts:95`, `fiscal.spec.ts:56`,
`gaps.spec.ts:94`). Corregido declarando el timeout del test explícitamente al nivel
del `test.describe` que lo contiene: `test.describe.configure({ timeout: 90_000 })`
(invoices/fiscal/gaps) y `{ timeout: 120_000 }` (onboarding, dos cadenas encadenadas).
Margen de harness, no cambio de asserts. Antes de añadir un test que dependa de eventos,
mide la cadena en el entorno actual: si el margen documentado no cabe en 30s, declara
el timeout del test explícitamente.

**Nota operativa — rate limit (RESUELTO, ver hallazgo #20)**: el gateway limita a
**120 peticiones/minuto por IP** (`RATE_LIMIT_MAX`) fuera de la lista de IPs confiables
(1200/min). Antes del fix #20, esa distinción nunca se aplicaba en un entorno local sin
proxy — la suite completa producía `429` intermitentes sin relación con la regla
probada. Ya corregido; además la red Docker interna (`172.16.0.0/12`) quedó registrada
como IP confiable vía la propia API de administración (`POST /trusted-ips`), que es el
mecanismo soportado para dar de alta tráfico de confianza sin tocar código — ver
`OPENCODE-BRIEF.md` §0.1.

---

## 1. Auth — cuentas y organización

### 1.1 Creación de organización nueva — **tres caminos, no uno**

**Cobertura**: `specs/onboarding.spec.ts` (los dos tests del describe). También reveló los hallazgos #17 y #18 de arriba (plugins no activos por defecto, y el salto asíncrono adicional de auth-service para `orgName`).

| Camino | Dónde | Qué crea |
|---|---|---|
| Registro con email+password | `register-with-password.ts:32-75` | `Credential` + `User` + `Organization` mínima + clona roles plantilla + asigna "Administrador" al fundador + membership `active`, todo síncrono en una transacción |
| Login con Google **con** `identification` | `login-with-google.ts:129-163` | Igual que arriba, en el mismo paso |
| Login con Google **sin** `identification` | `login-with-google.ts` | Solo `User`/`Credential`, `needsOrg: true`; la org se crea después |
| `complete-profile` cuando el usuario no tiene ninguna membership activa | `complete-profile.ts:63-77` | Resuelve el caso anterior — crea org + roles + admin en este paso |

⚠️ Ninguno de estos tres caminos está completo en el doc de `auth-service.md`, que solo
describe el primero.

**Regla confirmada (la que abrió esta conversación)**: al completar el perfil de la
organización (`organization-service`, `upsert-organization-profile.ts:97-108`), se emite
`organization.org.updated`; `customer-service` (`orgUpdatedHandler`,
`infrastructure/messaging/consumer.ts:49-86`) crea el cliente sistema **CONSUMIDOR
FINAL** (`identification: 9999999999999`, `is_system: true`) si no existe ya. Es
**asíncrono** — no está garantizado inmediatamente después de que la llamada de
completar-perfil retorna 200; un test debe esperar/reintentar (polling) a que aparezca en
`GET /customers`.

- [x] E2E: crear cuenta nueva → completar perfil de org → verificar que `CONSUMIDOR
      FINAL` aparece en la lista de clientes (con reintento/polling, no assert inmediato)
- [x] E2E: verificar que el establecimiento "Matriz" (001) y el punto de emisión
      "Principal" (001) se crean junto con el primer perfil de organización
      (`upsert-organization-profile.ts:50-95`)
- [x] E2E: completar el perfil de org una segunda vez (editar) y verificar que **no** se
      duplica el establecimiento ni el cliente CONSUMIDOR FINAL

### 1.2 Roles y permisos

**Cobertura**: `specs/roles.spec.ts` (los dos tests nuevos al final del describe) — confirma el 403 al modificar un rol de sistema, y que la unicidad de nombre la impone solo la BD (sin duplicado creado).

- Rol `isSystem: true` (plantillas clonadas, incluido "Administrador") no puede modificar
  sus permisos (`update-role-permissions.ts:17-18`, `CannotModifySystemRoleError`) — sí
  se le pueden asignar/quitar usuarios.
- No existe endpoint `DELETE` de roles (`routes.ts:146-148`) — ni de sistema ni
  personalizados.
- La siembra del rol "Administrador" busca **por nombre exacto** `'Administrador'`
  (`seed-organization-roles.ts:47-49`); si no existe, la siembra no falla pero tampoco
  asigna ningún admin — falla en silencio.
- ⚠️ `LastAdminRemovalError` nunca se lanza (ver hallazgo #6 del resumen). Solo se
  protege al `organization.ownerId` explícito: `disable-user.ts:23-26` (no se puede
  desactivar al owner), `request-password-reset.ts:31-42` (no se puede resetear password
  del owner ni la propia).
- Nombre de rol duplicado en la misma organización: solo lo impide el índice único de BD
  (`models.ts:337`); `CreateRoleUseCase` no lo captura → probablemente 500 sin mapear en
  vez de 409 de dominio.

- [x] E2E: intentar modificar permisos de un rol `isSystem` → 403/409 esperado
- [x] E2E: con 2 administradores donde ninguno es el owner, desactivar a ambos — hoy
      **no debería estar bloqueado** (confirma el bug #6, no lo "arregla")
- [x] E2E: crear un rol con nombre duplicado → verificar qué código de error realmente
      devuelve (probablemente 500, documentar el hallazgo)
- [x] E2E: revocar un permiso a un usuario con sesión activa y verificar que sigue
      funcionando hasta que se refresque el token (bug #9) — no asumir bloqueo inmediato
      → ver known-bugs.spec.ts:'BUG #9 — revocar un permiso no bloquea la sesión activa'

### 1.3 Empleados / invitaciones

**Cobertura**: `specs/employees.spec.ts` (los dos tests nuevos) — confirma el error al reinvitar, y que el filtro por establecimiento sí incluye al admin sin asignar.

- Invitar a un email existente reutiliza el `User` (`invite-user.ts:21-33`); si ya tiene
  membership en esa organización (en **cualquier** estado, no solo `invited`) →
  `UserAlreadyInvitedError` 409.
- Aceptar invitación exige membership en estado exactamente `'invited'` y que el usuario
  no tenga ya `Credential` (`accept-invite.ts:41-47`) — un usuario que ya aceptó una
  invitación en otra organización no puede aceptar una segunda con password.
- Los permisos se heredan solo de rol(es) asignados, nunca son individuales; un usuario
  puede tener múltiples roles simultáneos.
- `GET /users?establishmentId=` siempre incluye a los usuarios con rol `'Administrador'`
  (hardcodeado por nombre), tengan o no asignación a ese establecimiento
  (`list-users.ts:55-67`).
- `password:view` requiere también `user:read` para poder listar usuarios; sin
  `password:view`, `passwordHash` siempre debe ser `null` en la respuesta.

- [x] E2E: invitar dos veces al mismo email a la misma organización → 409
      `UserAlreadyInvitedError`
- [x] E2E: aceptar invitación siendo ya usuario con credential en otra org → debe fallar
      → `employees.spec.ts`:'aceptar invitación siendo ya usuario con credential en otra org'
- [x] E2E: `GET /users` sin permiso `password:view` → `passwordHash` es `null`
      → `employees.spec.ts`:'GET /users sin permiso password:view'
- [x] E2E: filtrar empleados por establecimiento → un admin sin asignación a ese
      establecimiento igual aparece en la lista

### 1.4 Recuperación de contraseña

⚠️ No hay autoservicio: `RequestPasswordResetUseCase` es una acción **administrativa**
(requiere permiso `password:change`, la dispara un admin sobre otro usuario, nunca sobre
sí mismo ni sobre el owner). El único endpoint público es el que **consume** el token
(`POST /auth/password-reset`). El token expira en 2 horas y es de un solo uso.

- [x] E2E: confirmar que no existe ningún endpoint público de "olvidé mi contraseña" (si
      el producto lo necesita, es una decisión de producto pendiente, no un bug)
      → `employees.spec.ts`:'no existe ningún endpoint público de autoservicio'
- [x] E2E: reusar un token de reset ya consumido → error. De paso reveló y corrigió el
      bug #24 (gateway bloqueaba `/auth/password-reset` sin sesión activa)
      → `employees.spec.ts`:'reusar un token de reset ya consumido'
- [x] E2E: admin intenta resetear su propia contraseña o la del owner → 403
      → `employees.spec.ts`:'admin no puede resetear su propia contraseña ni la del owner'

### 1.5 Terminales POS

- `POST /organization-service/billing-points/pair` es **público** (sin auth), busca el
  código TOTP entre **todos** los puntos POS no emparejados de **todas** las
  organizaciones (`pair-pos-terminal.ts:17-26`).
- Si el aprovisionamiento del token en auth-service falla tras emparejar, se revierte y
  se regenera el secreto TOTP para permitir reintento.
- Desvincular un punto emite `organization.billing_point.unlinked` (⚠️ el doc dice
  `.disabled` — nombre distinto) y regenera el TOTP de inmediato.

- [x] E2E: emparejar un punto POS con un código TOTP válido de otra organización
      distinta a la que se espera — confirmar que el buscador es realmente global
      → `org.spec.ts`:'emparejar con un código TOTP válido de otra organización'

---

## 2. Organización

- `PUT /organizations/me` exige permiso `organization:admin` (⚠️ el doc dice
  `organization:update` — nombre distinto, un test con el permiso del doc fallará con
  403).
- Aprovisiona establecimiento "Matriz" (001) + punto de emisión "Principal" (001) **solo
  si la org tiene 0 establecimientos** (`upsert-organization-profile.ts:50-95`); llamadas
  posteriores no vuelven a crear nada.
- Unicidad `(taxId, countryCode)` entre organizaciones: solo un `findOne` antes de
  guardar, sin constraint de BD — condición de carrera posible.
- No se puede desactivar el establecimiento marca `isMain: true`
  (`CannotDeactivateMainError`, `update-establishment.ts:15-17`).
- Puntos de emisión tipo `pos` nacen con `totpSecret` ya generado, sin paso de
  "activar"; tipo `web` no lo tiene.
- Código de establecimiento/punto de emisión: `max+1` sin constraint único en BD, solo
  `SELECT...FOR UPDATE` que no protege la primera fila.
- El servicio no valida JWT — confía ciegamente en `X-Organization-Id`/`X-User-Id`/
  `X-Permissions` inyectados por el gateway.

- [x] E2E: llamar `PUT /organizations/me` con el permiso `organization:update` (como
      dice el doc) → confirmar 403, y con `organization:admin` → 200
      → `org.spec.ts`:'PUT /organizations/me exige organization:admin'
- [x] E2E: intentar desactivar el establecimiento matriz → error
      → `org.spec.ts`:'intentar desactivar el establecimiento Matriz'
- [x] E2E: crear 2 establecimientos en paralelo para la misma org → verificar si
      colisionan en código (test de concurrencia, documenta el hallazgo #14). El caso
      "001 con cero establecimientos" del enunciado original no es alcanzable por API
      (ver comentario en el test: crear el establecimiento exige que la org ya exista en
      organization-service, y esa misma llamada auto-provisiona la Matriz) — se probó el
      mismo mecanismo para el código siguiente (002+)
      → `org.spec.ts`:'crear 2 establecimientos en paralelo para la misma org'

---

## 3. Clientes (customer-service)

**Cobertura**: `specs/customers.spec.ts`, describe "Clientes — protección de CONSUMIDOR FINAL" y "Clientes — direcciones" — revelaron el hallazgo #16 (disable() sin try/catch, **corregido** en la verificación del 2026-09-06: el test que documentaba el fallo silencioso ahora afirma el `<v-alert>` de error visible), además de confirmar #4 y #5 del resumen ejecutivo.

- **CONSUMIDOR FINAL**: ver sección 1.1. Un cliente `is_system: true` no se puede
  deshabilitar (`CannotDisableSystemCustomerError`) ni cambiar su
  identificación/tipo (`CannotEditSystemCustomerError`) — sí se le puede editar nombre,
  email, teléfono.
- ⚠️ Validación de identificación: si se envían `identificationTypeId` +
  `identification`, se valida contra el `regex` del `identification_type` (poblado por
  evento de tax-service). El validador de dígito verificador ecuatoriano
  (`EcuadorIdentificationValidator`) existe pero **no está conectado** a ningún caso de
  uso (bug #4).
- Unicidad de identificación por organización: `create-customer` la valida con un error de
  dominio limpio (`repos.findByIdentification`) cuando **ambos** campos (`identificationTypeId`
  + `identification`) vienen en el input. `update-customer` NO la revalida (bug #5) — pero la
  migration `20260706000000-create-customer-tables` creó el constraint UNIQUE
  `customers_organization_id_identification`, que SÍ la impone en BD: editar a una identificación
  ya usada choca en el `upsert` y el `SequelizeUniqueConstraintError` no está mapeado → el
  backend responde **500 INTERNAL_ERROR** (la premisa original "permite duplicar" era falsa en
  este stack; la edición falla y la UI muestra el error). **Hallazgo #22** (pendiente de decisión
  de backend): replicar en `update-customer` el check de unicidad que ya hace `create-customer`,
  o mapear el constraint a un 4xx de dominio.
- ⚠️ REVISIÓN 2026-09-05: la migration 2026-07-06 crea constraints UNIQUE reales en
  `customers(organization_id, identification)`, `tags(organization_id, name)` y
  `identification_types(country_code, code)`. Esta sección afirmaba "sin constraint de BD (patrón
  TOCTOU)" — afirmación desactualizada; el E2E Bug #14 (crear duplicados en paralelo) debe
  re-verificarse con el esquema real.
- No hay endpoint de borrado físico de cliente, solo `POST /customers/:id/disable`
  (⚠️ el doc dice `DELETE /customers/:id`).
- Sin regla de "una sola dirección primaria" — se puede marcar `isPrimary` en varias
  direcciones del mismo cliente sin que nada lo impida.
- Contactos y direcciones se borran físicamente (`destroy`), sin soft-delete.

- [x] E2E: crear cliente con cédula EC de dígito verificador inválido pero que matchee
      el regex almacenado → hoy pasa (confirma bug #4, no arreglarlo en el test)
      → ver known-bugs.spec.ts:'BUG #4 — dígito verificador de cédula EC no se valida'
- [x] E2E: crear cliente A con identificación X, luego PATCH cliente B con X → hoy 500
      (el constraint UNIQUE de la migration rechaza el duplicado y `update-customer` no
      mapea el `SequelizeUniqueConstraintError`; test de contrato de API, §3.2)
      → ver known-bugs.spec.ts:'BUG #5 (premisa desactualizada) — update-customer no
      revalida unicidad de identificación'
- [x] E2E: intentar deshabilitar o editar la identificación de CONSUMIDOR FINAL → error
      en ambos casos
- [x] E2E: marcar dos direcciones del mismo cliente como primarias → ambas quedan
      marcadas, sin corrección automática

---

## 4. Productos (product-service)

- Todo producto requiere `establishmentIds` no vacío (`EstablishmentRequiredError`),
  validado también en Zod (`min(1)`). Se valida contra organization-service **vía HTTP
  síncrono**, no evento — si organization-service está caído, crear un producto falla
  con 5xx, no con un error de dominio.
- Máximo una tasa de impuesto por `kind` (`vat`, `withholding_iva`,
  `withholding_rent`, `special`) — `MultipleTaxKindError` 422.
- ⚠️ El read-model local de tasas de impuesto **ya no existe** — el consumer de
  `tax.tax_rate.upserted` es un stub vacío; ahora resuelve tasas vía HTTP síncrono a
  tax-service en cada operación. El doc todavía describe el read-model async — para
  E2E esto significa que tax-service debe responder en vivo en cada creación/edición de
  impuestos de producto, no basta con que haya publicado el evento alguna vez.
- SKU único por organización; categoría única por nombre+nivel (mismo `parentId`);
  unidad única por `code` — ninguno con constraint de BD.
- Borrar categoría falla solo si tiene productos **activos** asociados (cuenta con
  `status: 'active'`) — una categoría con solo productos `inactive` sí se puede borrar.
- La primera imagen de un producto se vuelve principal automáticamente; borrar la
  principal promueve la siguiente por posición.

- [x] E2E: crear producto sin `establishmentIds` → 422/400 `EstablishmentRequiredError`
- [x] E2E: asignar 2 tasas del mismo `kind` a un producto → `MultipleTaxKindError`
- [x] E2E: crear categoría, deshabilitar (no borrar) todos sus productos, luego
      borrar la categoría → debe permitirlo (confirma el detalle "solo cuenta activos")
- [x] E2E: borrar la imagen principal de un producto con 2+ imágenes → la siguiente por
      posición se vuelve principal automáticamente (reveló y corrigió el bug #21)

---

## 5. Facturación (billing-service)

Estados: `draft → issued → voided`.

- Crear factura exige cliente `active` (`CustomerNotFoundError`/`CustomerDisabledError`).
- Agregar/editar/quitar líneas solo si `status === 'draft'` — fuera de ese estado,
  las operaciones de la entidad son no-ops silenciosos, no lanzan error.
- `quantity > 0`, `unitPrice > 0`, descuento no puede superar el subtotal de línea.
- ⚠️ Producto inexistente al agregar línea: no falla, crea la línea sin snapshot ni
  impuestos (bug #2) — `ProductNotFoundError`/`TaxRateNotFoundError` están definidos
  pero nunca se lanzan.
- Emitir exige `draft`, establecimiento y punto de emisión `active`; recalcula
  totales desde las líneas persistidas y compara contra el cache — si no cuadra,
  `MismatchedTotalsError` 500.
- ⚠️ Numeración: `establecimiento-puntoEmision-secuencial` sin lock atómico real pese
  al doc (bug #1) — riesgo de números duplicados bajo concurrencia.
- Anular solo permitido desde `issued` (no `draft`, no ya `voided`).
- ⚠️ Anular una factura `issued` no dispara ningún proceso fiscal (bug #3) — el
  consumer de fiscal-ecuador no tiene binding a `billing.invoice.voided`.
- Generación de PDF/XML comercial solo para país `'EC'` (único registrado); otros
  países no generan ningún documento.

- [x] E2E: agregar línea con `productId` que no existe → **hoy no falla** (confirma
      bug #2; documentar, no "arreglar" en el test)
- [x] E2E: emitir 2 facturas en paralelo sobre el mismo establecimiento/punto de
      emisión → verificar si el número queda duplicado (test de concurrencia, bug #1)
- [ ] E2E: anular una factura autorizada por el SRI → verificar que el estado fiscal
      (`fiscal-ecuador`) **no cambia** (confirma bug #3, gap real de producto)
- [x] E2E: agregar línea a una factura ya emitida → no debe modificarla (verificar
      no-op silencioso vs. error explícito — hoy es no-op, ¿es lo deseado?)
- [x] E2E: emitir factura sin certificado activo cuando el régimen lo requiere → debe
      quedar en `error` con "Sin certificado activo" del lado de fiscal-ecuador

---

## 6. Fiscalidad Ecuador (fiscal-ecuador)

⚠️ El doc de este servicio y el de billing-service lo describen como "Fase 2, no
construido" — **está completamente implementado y operativo**: consumer RabbitMQ,
cliente SOAP SRI, firma XAdES-BES, gestión de certificados, job de reconciliación,
endpoints de reintento.

- Solo procesa facturas de organizaciones con país `'EC'` — cualquier otro país se
  ignora sin error.
- Idempotente: reprocesar un `billing.invoice.issued` ya manejado (estado ≠ `error`) se
  ignora; si estaba en `error`, se borra y se reintenta desde cero.
- Requiere `Certificate` `active` más reciente; sin uno, la factura fiscal queda en
  `error` con `'Sin certificado activo'`.
- Subir certificado `.p12` valida la contraseña real contra el PKCS12 y extrae
  vigencia antes de guardar.
- Revocar certificado marca `status: 'revoked'`, no borra. ⚠️ No hay expiración
  automática por fecha (bug #13) — un certificado vencido sigue "activo" hasta
  revocación manual.
- Clave de acceso (49 dígitos): usa la hora de **procesamiento del evento**, no la
  `issueDate` original — puede diferir si la cola está atrasada.
- Reconciliación: polling cada 2 minutos, hasta 10 facturas `sent`; después de 30
  intentos (~60h) pasa a `error` por límite excedido.
- Reintento manual solo permitido si `status === 'error'`.
- ⚠️ No existe `GET /fiscal-invoices/:id/ride` (RIDE con QR) pese a estar documentado
  como endpoint — no hay generación de RIDE en ningún servicio (bug #12).
- ⚠️ No consume `organization.org.updated` pese a estar documentado.

- [x] E2E: subir certificado con contraseña incorrecta → 400, no se persiste
- [x] E2E: emitir factura EC sin certificado activo → factura fiscal en `error`,
      `last_error: 'Sin certificado activo'`
- [x] E2E: reintentar una factura fiscal en estado `error` → pasa por el flujo completo
      de nuevo sin necesidad de reemitir la factura comercial
- [x] E2E: confirmar que `GET /fiscal-invoices/:id/ride` no existe (404) — no asumir
      que hay RIDE disponible

---

## 7. Plugins (plugin-catalog-service)

- Plugins `isCore: true` siempre activos, no configurables — `CorePluginNotConfigurableError`.
- `isBuyable` requiere `!isCore && buildStatus === 'disponible' && isActive`.
- Plugins privados de otra organización se ocultan como `PLUGIN_NOT_FOUND` (mismo
  código que "no existe") — no revela su existencia entre organizaciones.
- Activar con dependencias: auto-activa recursivamente las marcadas `autoActivate:
  true` y compradas; si alguna no califica, falla **todo** atómicamente
  (`MissingDependenciesError`).
- Activar un plugin ya activo → `PluginAlreadyActiveError` 409 (no idempotente).
- Desactivar con dependientes activos directos → bloqueado (`BlockingDependentsError`)
  hasta que se desactiven manualmente primero.
- Desactivar en cascada las dependencias activadas *por dependencia*, solo si ningún
  otro plugin activo aún las necesita (punto fijo iterativo).
- Crear un plugin a medida (fulfill) **no lo activa** automáticamente — paso separado.
- **Cross-servicio central**: el API Gateway bloquea rutas completas con `403
  PLUGIN_NOT_ACTIVE` si el plugin requerido no está activo — `/establishments/*` →
  `org.establishments`; `/customers|contacts|addresses|tags/*` → `crm.contacts`;
  `/invoices/*` y `/fiscal-invoices/*` → `finance.electronic_invoicing`;
  `/certificates/*` → `finance.electronic_certificate`. Cache de 60s invalidada al
  instante por evento `plugin.*`; si el catálogo cae, sirve cache vencida. ⚠️ En la
  práctica la invalidación tarda **0-30s AL AZAR**: `plugin-catalog-service` crea el
  `OutboxRelay` pero no llama a `relay.notify()` (ver hallazgo #23), así que el evento
  espera al safety-net de 30s del relay. `plugins.spec.ts` sondea 45s (peor caso +
  margen) con `timeout: 120_000` en el describe.

- [x] E2E: desactivar un plugin (`finance.electronic_invoicing`, no `crm.contacts` —
      ver nota en `plugins.spec.ts`) y verificar que su ruta gateada empieza a
      devolver 403 en TODOS los servicios, no solo en su propia UI
- [ ] E2E: activar un plugin con dependencias no compradas → falla completo, nada
      queda activado (atomicidad) — **no reproducible con el seed actual**, ver
      `test.skip()` documentado en `plugins.spec.ts`
- [x] E2E: intentar desactivar un plugin que otro plugin activo todavía necesita como
      dependencia → `BlockingDependentsError` (422, no 409)
- [x] E2E: crear un plugin a medida vía fulfill → confirmar que NO queda activado
      automáticamente para la organización solicitante

---

## 8. Inventario — **no implementado**

`inventory-service` no tiene código (`src/` no existe, solo specs). ⚠️ `billing-service`
publica `billing.invoice.issued` con el payload que el spec de inventario espera
consumir, pero no hay ningún consumidor real (bug #11).

- [x] E2E (documentación de gap, no de funcionalidad): facturar un producto tipo
      "bien" con `trackStock: true` → confirmar explícitamente que el stock **no**
      cambia (para detectar el día que alguien implemente inventory-service sin avisar
      que este test empieza a fallar por la razón correcta)

---

## 9. Notificaciones (notification-service)

Dirigido por configuración (`template-config.json`) — solo reacciona a 4 eventos, todos
de `auth-service`: `identity.user.invited`, `identity.user.enabled`,
`identity.user.disabled`, `identity.user.password_reset_requested`.

⚠️ No hay notificación por: factura emitida, certificado por vencer, cambios de plugin,
ni la mayoría de eventos de `identity.*` (rol asignado, invitación aceptada, perfil
completado) — se emiten al outbox pero no generan correo.

- [x] E2E: invitar empleado → confirmar que se dispara el correo de invitación. No hay
      mailhog/mock en este entorno — `notification-service` cae a `ConsoleMailer`
      cuando `SMTP_HOST` no está seteado (siempre el caso en docker-compose local) y
      loggea `[notification] processed <evento> → <email>` a stdout; se verifica
      leyendo `docker logs cmr-notification`, no un buzón real
- [x] E2E: emitir una factura → confirmar explícitamente que **no** llega ningún correo
      (documenta el gap, no un bug — `billing.invoice.issued` ni siquiera tiene binding
      a la cola de notification-service en RabbitMQ)

---

## Cobertura actual (`frontend/e2e/specs/`) — plan de 5 lotes COMPLETO (2026-09-06)

| Archivo | Cubre |
|---|---|
| `auth.spec.ts` | Flujo de login/registro básico |
| `onboarding.spec.ts` | §1.1 — cuenta nueva con organización nueva (Matriz + CONSUMIDOR FINAL), hallazgos #17/#18 |
| `org.spec.ts` | §2 — configuración de organización, permisos, establecimientos; §1.5 — pairing POS cross-org |
| `customers.spec.ts` | §3 — CRUD de clientes, protección de CONSUMIDOR FINAL, hallazgo #16 |
| `employees.spec.ts` | §1.3 — invitación/reinvitación, filtrado por establecimiento, `password:view`, invite cross-org; §1.4 — recuperación de contraseña completa (reveló hallazgo #24) |
| `roles.spec.ts` | §1 — roles de sistema vs. no-sistema, permisos |
| `products.spec.ts` | §4 — validaciones de creación, categorías, imagen principal (reveló hallazgo #21) |
| `invoices.spec.ts` | §5 — ciclo de vida de facturas, hallazgos #2/#19 |
| `fiscal.spec.ts` | §6 — certificados, reintento fiscal |
| `plugins.spec.ts` | §7 — gateo cross-servicio, dependencias, fulfill |
| `gaps.spec.ts` | §8-9 — ausencia de inventario y notificaciones (confirmación explícita) |
| `known-bugs.spec.ts` | Los 15 hallazgos originales del resumen ejecutivo (#1-15): #1/#2/#6/#9 flipeados a CORREGIDO (contract de API), #5 CORREGIDO vía hallazgo #22, #14 REVISADO; 4 `test.skip()` documentados (#3/#10/#13/#15) |

Resumen ejecutivo: **25 hallazgos totales (1-21 + #22 en §3 + #23 en §7 + #24 en el
gateway — numeración del hallazgo #22 queda debajo del #23 en la tabla por orden de
detección, no cronológico)**, 11 corregidos: #16 (frontend), #18, #19, #20, #21, #24
(backend) y el 2026-09-06 también **#1, #2, #5/#22, #6 y #9** (billing/customer/auth/
gateway/frontend-realtime, con tests unitarios nuevos y flips E2E en `known-bugs.spec.ts`).
Suite completa: `npx playwright test` — 70 tests (65 pasan, 5
`test.skip()` documentados), corre en ~3-4 minutos.

Los 9 casos de §1.3/§1.4/§1.5/§2 que quedaban sin asignar a ningún lote del plan
original (nunca se "olvidaron" — el plan de 5 lotes de `OPENCODE-BRIEF.md` nunca los
incluyó) se resolvieron el 2026-09-06: 5 en `employees.spec.ts` (aceptar invitación
cross-org, `password:view`, ausencia de autoservicio, admin/owner no pueden resetear su
propia contraseña, reuso de token — esta última reveló el bug #24) y 4 en `org.spec.ts`
(permiso `organization:admin` vs `organization:update`, desactivar Matriz, carrera de
código de establecimiento, pairing POS cross-org). Todos son casos de contrato de API
(OPENCODE-BRIEF.md §3.2), no alcanzables desde la UI real — cada test documenta por qué
en un comentario.

Ninguna regla asíncrona (eventos RabbitMQ) ni el resumen ejecutivo de bugs quedó sin
cobertura E2E salvo los 4 `test.skip()` de `known-bugs.spec.ts` (necesitan certificado
real o son demasiado complejos de fabricar) y 1 de `plugins.spec.ts`
(`MissingDependenciesError`, no reproducible con el catálogo semilla actual).

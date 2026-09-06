# Brief de implementación — tests E2E del CRM (para ejecutar con OpenCode)

Este documento es la especificación de implementación que acompaña a
[`TEST-PLAN.md`](./TEST-PLAN.md). `TEST-PLAN.md` dice **qué** debe pasar (las reglas de
negocio, con archivo:línea de dónde viven). Este documento dice **cómo** escribir los
tests de Playwright que lo verifiquen, con el detalle suficiente para que quien lo
ejecute no tenga que adivinar ni tomar decisiones de diseño por su cuenta.

Léelo completo antes de escribir la primera línea. Si algo de aquí y algo de
`TEST-PLAN.md` parecen contradecirse, **`TEST-PLAN.md` tiene la razón** sobre la regla
de negocio; este documento manda sobre la forma del código.

---

## 0. Regla de oro: los tests documentan el comportamiento REAL, no el deseado

`TEST-PLAN.md` marca con ⚠️ quince hallazgos que son **bugs confirmados** (código
verificado, no sospecha). La tarea NO es arreglar esos bugs. La tarea es escribir un
test que:

1. Reproduce la condición exacta del bug.
2. Afirma (`expect`) el comportamiento **actual**, aunque sea el incorrecto.
3. Lleva un comentario que dice explícitamente qué debería pasar en un mundo ideal y
   referencia el número de hallazgo de `TEST-PLAN.md` (ej. `// BUG #2 (TEST-PLAN.md):
   debería fallar con ProductNotFoundError, hoy no falla`).

Así, el día que alguien arregle el bug sin darse cuenta de que rompió este test, la
suite falla y avisa — y el día que alguien lo arregle a propósito, sabe exactamente qué
test actualizar porque el comentario se lo dice. **Nunca "corrijas" el assert para que
pase silenciosamente si el comportamiento real cambia** — si un test de bug empieza a
fallar, repórtalo, no lo edites sin decir por qué.

Si tienes dudas sobre si algo es "el bug" o "tu test está mal escrito": corre el flujo
manualmente contra el entorno real primero (o pide que se confirme) antes de fijar el
assert. No inventes el comportamiento esperado a partir de la intuición.

---

## 0.1 Hallazgo operativo: rate limit del gateway (RESUELTO — hallazgo #20 de TEST-PLAN.md)

`api-gateway-node` limita a 120 peticiones/minuto por IP (`RATE_LIMIT_MAX`,
ventana 60s), con una cuota elevada de 1200/min para IPs "confiables"
(`RATE_LIMIT_TRUSTED_MAX`). **La distinción entre ambas nunca se aplicaba en
este entorno**: `clientIp()` en `create-gateway.ts` solo leía headers de proxy
(`X-Forwarded-For`/`CF-Connecting-IP`) que no existen sin un proxy externo
delante, así que todo el tráfico directo (tests incluidos) caía al literal
`'unknown'` — un único balde de rate-limit compartido por TODOS los clientes,
y ese string nunca podía matchear ninguna IP/CIDR confiable. Sumado a un
segundo bug en `trusted-ip-cache.ts` (el fallback de `RATE_LIMIT_TRUSTED_IPS`
se apagaba en cuanto auth-service respondía, aunque fuera con una lista
vacía) y un CIDR de fallback que no coincidía con la subred real de Docker.

**Ya corregido** (ver TEST-PLAN.md hallazgo #20): `clientIp()` ahora usa el
socket real (`getConnInfo`) con el desmapeo de IPv4-en-IPv6, el cache usa el
fallback cuando la lista viene vacía, y el CIDR quedó corregido. Además, la
red interna de Docker está registrada como IP confiable a través de la propia
API de administración (`POST /trusted-ips`, protegida por `user:update`) —
ese es el mecanismo soportado para dar de alta tráfico de confianza sin tocar
código; el fallback por env var es solo el colchón para cuando auth-service
no responde. Con esto, una corrida completa de la suite (~50 tests, ~2.5 min)
ya no dispara `429` — verificado con una corrida limpia end-to-end.

Si en un entorno nuevo (sin la IP de Docker ya registrada) reaparece un
`429`/`RATE_LIMIT_EXCEEDED` que no tiene relación con la regla que estás
probando: registra la subred correspondiente vía `POST /trusted-ips` con un
usuario admin, en vez de tocar código o env vars.

## 1. Entorno — checklist obligatorio antes de correr NADA

Estos tests mutan datos reales de un backend de desarrollo compartido (ver comentario en
`playwright.config.ts:6-7`) y varias reglas dependen de eventos asíncronos vía RabbitMQ.
Antes de ejecutar la suite (o cualquier test nuevo), confirma:

1. **RabbitMQ está arriba** y accesible en la URL configurada por cada servicio
   (`RABBITMQ_URL`). Sin esto, `orgUpdatedHandler` de customer-service nunca crea
   CONSUMIDOR FINAL, los plugins no invalidan caché del gateway, etc. — los tests que
   dependen de eventos colgarán hasta timeout, no fallarán con un error claro.
2. **Servicios corriendo con sus consumers arrancados** (no solo el HTTP levantado):
   como mínimo `auth-service`, `organization-service`, `customer-service`,
   `product-service`, `billing-service`, `fiscal-ecuador`, `plugin-catalog-service`,
   `api-gateway-node`. Verifica en el log de arranque de cada uno que diga algo como
   "Consumidores de RabbitMQ iniciados" — si dice "RABBITMQ_URL no configurado,
   consumidores desactivados", ese servicio no va a reaccionar a nada y los tests que
   dependen de él van a fallar por timeout, no por el motivo real.
3. **Gateway accesible en `http://localhost:8080`** (`API_URL` en
   `e2e/global-setup.ts:11`) y **frontend en `http://localhost:5173`** (`baseURL` en
   `playwright.config.ts:15`).
4. **Usuario admin de prueba**: `admin@admin.com` / `Admin123!`, identificación
   `0000000000` (`e2e/global-setup.ts:12-14`). `global-setup.ts` lo registra solo si no
   existe — no lo borres ni cambies su contraseña, es compartido por toda la suite.
5. Corre `npx playwright test --list` primero para confirmar que Playwright encuentra
   los archivos nuevos sin errores de sintaxis antes de ejecutar nada de verdad.
6. **En este entorno el `:5173` NO es un dev server con HMR** — es un build de
   producción horneado en el contenedor `cmr-frontend` (nginx, sin volúmenes). Si cambias
   código en `frontend/src` y esperas que los tests lo vean, la sorpresa es que sirve la
   versión vieja: `npm run build` + `docker cp frontend/dist/. cmr-frontend:/usr/share/nginx/html`.
   Verifica contra qué bundle estás corriendo pidiendo el `index.html` servido
   (busca el hash de `assets/index-*.js` y compáralo con el que acaba de generar tu build).
   Sin esto, "el test sigue fallando" puede ser "el test corre contra código viejo".

Si cualquiera de estos puntos no se puede cumplir en el entorno donde estás trabajando,
**dilo explícitamente en vez de escribir tests que asumes que van a pasar** — mejor un
test marcado `test.skip(..., 'requiere RabbitMQ arriba')` con el motivo, que uno que
falla en CI sin explicación.

---

## 2. Convenciones existentes — replícalas, no inventes otras

Lee `frontend/e2e/specs/customers.spec.ts` completo antes de escribir tu primer test
nuevo. De ahí sale todo esto:

### 2.1 Selector de campos Vuetify

Vuetify 3.7 duplica el `<label>` de cada campo (label real + floating label), así que
`page.getByLabel()` puede resolver 2 elementos y romper. El patrón ya resuelto es:

```ts
function fieldByLabel(page: Page, label: string) {
  return page.locator('.v-field').filter({ has: page.getByText(label, { exact: true }) });
}
```

Úsalo así:
- Para `v-text-field`/`v-textarea`: `fieldByLabel(page, 'Nombre').locator('input')`
- Para `v-select`/`v-autocomplete`: click en `fieldByLabel(page, 'Estado')` para abrir
  el desplegable, luego `page.getByRole('option', { name: /.../i }).click()`

**No copies este helper en cada archivo** — muévelo a `frontend/e2e/support/fields.ts`
(nuevo archivo, no existe todavía) y expórtalo, para que `customers.spec.ts` y todos
los specs nuevos lo importen del mismo sitio. Actualiza `customers.spec.ts` para
importarlo también, en vez de dejar dos copias divergentes.

### 2.2 Unicidad entre corridas

Todo dato que crees en un test debe llevar una marca única para no chocar entre
corridas de la suite (que reusa el mismo backend). El patrón existente:

```ts
const UNIQUE = Date.now();
// ...
await nameInput.fill(`Cliente E2E ${UNIQUE}`);
```

Para identificaciones (cédulas/RUC) que deben tener una longitud exacta, sigue el
patrón ya usado: `'17' + String(UNIQUE).slice(-8)` (cédula, 10 dígitos), `'179' +
String(UNIQUE).slice(-7) + '001'` (RUC, 13 dígitos).

### 2.3 Estructura de archivo

- Un `test.describe` por funcionalidad/flujo, nombrado en español tal como los
  existentes (`'Clientes — crear persona'`).
- Nombre de test en minúscula, describiendo el comportamiento, no la acción mecánica
  (`'crear persona con Consumidor Final auto-llena identificación y la deshabilita'`,
  no `'test 3'`).
- Un archivo nuevo por módulo, nombrado igual que la carpeta de vistas del frontend:
  `billing.spec.ts` (no `invoices.spec.ts` — el módulo de negocio se llama
  "facturación" pero las rutas y carpetas de código usan `invoices`; usa
  `invoices.spec.ts` para que coincida con `frontend/src/views/invoices/`, no con el
  nombre del servicio backend `billing-service`), `fiscal.spec.ts`, `products.spec.ts`,
  `plugins.spec.ts`, `roles.spec.ts`. Revisa `frontend/src/router/index.ts` para
  confirmar el nombre de carpeta/ruta correspondiente antes de nombrar el archivo si
  tienes dudas.

### 2.4 Antes de escribir selectores de un módulo que no conoces

**No adivines el texto de un botón o label.** Antes de escribir un test para una vista
que no has leído, abre el archivo `.vue` correspondiente y lee las cadenas de texto
reales (o las claves de i18n en `frontend/src/i18n/es.json`, ya que casi todo el texto
visible sale de `$t('...')`, no está hardcodeado en el `.vue`). Ejemplo: para saber que
el botón de crear factura dice "Emitir factura", no "Emitir" ni "Confirmar factura",
busca la clave en `es.json` bajo `invoices.issueInvoice`.

Los archivos de vista relevantes ya están mapeados por ruta en la sección 4 de este
documento — no hace falta que los redescubras, pero si el texto que esperas no aparece
al correr el test (`--debug` te lo muestra), vuelve al `.vue` y a `es.json` antes de
cambiar el selector a ciegas.

---

## 3. Patrones nuevos que necesitas (no existen todavía en el repo)

### 3.1 Esperar un efecto asíncrono (evento RabbitMQ → otro servicio → UI)

Varias reglas de `TEST-PLAN.md` (CONSUMIDOR FINAL, invalidación de caché de plugins,
etc.) tardan un instante en propagarse porque dependen de un evento, no de la respuesta
HTTP directa. **Nunca hagas un `expect` inmediatamente después de la acción que dispara
el evento** — vas a tener un test intermitente (flaky). Crea este helper en
`frontend/e2e/support/wait-for.ts`:

```ts
import { Page, expect } from '@playwright/test';

/**
 * Reintenta una acción de UI hasta que la condición se cumpla o se agote el tiempo.
 * Úsalo para invariantes que dependen de un evento asíncrono (RabbitMQ) en vez de
 * un `expect` inmediato, que sería flaky.
 */
export async function waitForCondition(
  check: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const { timeoutMs = 15_000, intervalMs = 1_000, message = 'condición no se cumplió a tiempo' } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando: ${message}`);
}
```

Ejemplo de uso real (CONSUMIDOR FINAL tras completar perfil de organización):

```ts
await waitForCondition(
  async () => {
    await page.goto('/customers');
    await page.reload();
    return await page.getByText('CONSUMIDOR FINAL').isVisible().catch(() => false);
  },
  { timeoutMs: 20_000, message: 'CONSUMIDOR FINAL debería aparecer tras completar el perfil de organización' },
);
```

No inventes otro patrón (ni `page.waitForTimeout` fijo de varios segundos — eso hace la
suite lenta sin garantizar nada; ni polling sin timeout — eso cuelga la suite entera si
el evento nunca llega).

**Combo con el timeout del test**: `waitForCondition` con un `timeoutMs` de 40-60s es
inútil si el test no declara su propio timeout — Playwright aborta con "Test timeout of
30000ms exceeded" (default de 30s) en cuanto el reloj del test se agota, antes de que el
helper pueda lanzar su propio mensaje. Si una cadena de eventos puede tardar más de 30s
(medido en el reset de 2026-09-06: perfil → CONSUMIDOR FINAL + Matriz, ~29s peor caso),
declara el headroom al nivel del `test.describe`:

```ts
test.describe('...', () => {
  test.describe.configure({ timeout: 120_000 }); // presupuestos waitForCondition de 60s × dependencias encadenadas
  ...
});
```

Ver `onboarding.spec.ts` para el patrón aplicado. Esto es margen de harness, no un
cambio de asserts.

### 3.2 Llamadas directas a la API dentro de un test — cuándo SÍ está permitido

El usuario pidió explícitamente que los tests vayan **contra la UI**, no contra las
APIs directamente. Respeta eso como default. La única excepción permitida es cuando la
regla que se prueba es literalmente sobre el **contrato de la API** (nombre de permiso
exacto, código de estado HTTP), no sobre lo que la UI hace — porque la UI, al estar
bien escrita, nunca va a mandar el permiso "equivocado" para poder comprobar qué pasa
si lo hiciera. Ejemplo concreto: la sección 2 de `TEST-PLAN.md` dice que
`organization-service` exige el permiso `organization:admin`, pero el doc de diseño
decía `organization:update` — verificar esto por UI no tiene sentido (la UI ya manda el
correcto). Para este caso puntual, usa el fixture `request` de Playwright
directamente:

```ts
test('organization-service exige organization:admin, no organization:update (doc desactualizado)', async ({ request }) => {
  // Ver TEST-PLAN.md sección 2. Esto es un test de contrato de API, no de UI:
  // la UI real siempre manda el permiso correcto, así que no hay forma de
  // reproducir esto navegando la app.
  // ... construir el request con el token del usuario admin y verificar 403/200
});
```

Márcalo siempre con un comentario que explique por qué este test rompe el patrón
"contra la UI" — así no se ve como una inconsistencia accidental.

Para TODO lo demás (creación de recursos, flujos, validaciones de formulario,
invariantes visibles en la UI), sigue siendo contra la UI real, como los specs
existentes.

---

## 4. Mapa de rutas frontend (para ubicar vistas sin adivinar)

| Ruta | Nombre de ruta | Vista |
|---|---|---|
| `/login` | `login` | `AuthView.vue` |
| `/profile` | `profile` | `ProfileView.vue` |
| `/settings` | `settings` | `settings/AccountSettingsView.vue` (pestañas) |
| `/employees` | `employees` | `EmployeesListView.vue` |
| `/employees/invite` | `employees-invite` | (dentro de `EmployeesListView.vue` o dialog) |
| `/employees/:id` | `employees-detail` | `EmployeeDetailView.vue` |
| `/roles` | `roles` | `RolesListView.vue` |
| `/roles/new` | `roles-create` | `RoleCreateView.vue` |
| `/roles/:id/edit` | `roles-edit` | `RoleEditView.vue` |
| `/organization/settings` | `organization-settings` | `organization/OrganizationSettingsView.vue` |
| `/organization/establishments` | `organization-establishments` | `organization/EstablishmentsView.vue` |
| `/organization/certificates` | `organization-certificates` | `organization/CertificatesView.vue` |
| `/products`, `/products/new`, `/products/:id`, `/products/:id/edit` | `products*` | `products/*View.vue` |
| `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/edit` | `customers*` | `customers/*View.vue` |
| `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit` | `invoices*` | `invoices/*View.vue` |
| `/plugins` | `plugins` | `plugins/PluginsView.vue` |

No hay ruta dedicada para certificados fuera de `/organization/certificates` — los
tests de fiscal-ecuador (sección 6 de `TEST-PLAN.md`) suben el certificado desde ahí, y
el resultado de la emisión se observa en `/invoices/:id` (detalle de factura).

---

## 5. Plan de implementación, en orden — con detalle por lote

### Lote 1 — los 15 hallazgos críticos (máxima prioridad, hazlos primero y por separado)

Crea `frontend/e2e/specs/known-bugs.spec.ts` dedicado solo a estos — no los mezcles
dentro de los specs por módulo, porque quieres poder correr `npx playwright test
known-bugs.spec.ts` de forma aislada como "smoke test de regresión de bugs conocidos".
Cada test lleva el número de hallazgo de `TEST-PLAN.md` en el nombre.

1. **`#1 numeración de factura sin lock atómico`**: crea una factura en borrador con al
   menos una línea (usa `/invoices/new`, confirma cliente, agrega línea — sigue el
   flujo real, no hay atajo). Antes de emitir, necesitas DOS facturas borrador
   distintas apuntando al MISMO establecimiento y punto de emisión. Emítelas en
   paralelo con `Promise.all([page1.click('Emitir factura'), page2.click('Emitir
   factura')])` usando dos `BrowserContext` distintos (dos pestañas/contextos con la
   misma sesión de storageState). Verifica los números de factura resultantes
   (visibles en `/invoices/:id`, campo folio) — si el hallazgo es real, ambos números
   serán iguales. Documenta el resultado con un comentario claro sea cual sea
   (puede que en la práctica el timing de la UI nunca dispare la carrera exacta; si es
   así, dilo en un comentario y no fuerces un assert que no se sostiene).
2. **`#2 línea con producto inexistente no falla`**: en `/invoices/new`, tras confirmar
   cliente, esto requiere enviar un `productId` que no existe — la UI normal no te
   deja hacerlo porque el select solo lista productos reales. Esto cae en el caso de
   la sección 3.2 (test de contrato, no de UI): usa `request` para llamar
   `POST /invoices/:id/lines` con un `productId` con formato UUID válido pero
   inexistente, y verifica que responde 200/201 en vez de 404, y que la línea creada
   no tiene impuestos (`taxes: []`).
3. **`#3 anular factura autorizada no dispara nada fiscal`**: emite una factura EC
   completa (con certificado activo — necesitas haber subido uno de prueba en
   `/organization/certificates` antes; si no hay uno disponible en el entorno,
   `test.skip` con el motivo). Espera (con `waitForCondition`) a que quede
   `authorized` en fiscal-ecuador (esto puede tardar por la reconciliación de 2
   minutos — considera usar el endpoint de reintento o revisar si hay un modo de
   prueba más rápido; si no lo hay, marca el test con `test.slow()` de Playwright).
   Anula la factura desde `/invoices/:id`. Verifica que el estado fiscal (visible en
   la misma vista de detalle, o vía API si la UI no lo muestra) sigue en `authorized`,
   no cambia a nada relacionado con anulación.
4. **`#4 dígito verificador EC no se valida`**: en `/customers/new`, crea un cliente
   persona con tipo Cédula y un número de 10 dígitos que cumpla el regex pero tenga
   dígito verificador inválido (puedes construirlo determinísticamente: cualquier
   secuencia de 10 dígitos que pase el regex almacenado — revisa primero cuál es ese
   regex consultando `GET /identification-types` o el seeder de
   `customer-service/seeders/20260706000001-seed-ec-identification-types.js`).
   Confirma que la creación tiene éxito (hoy debería, por el bug).
5. **`#5 update-customer no revalida unicidad`**: crea cliente A con identificación X.
   Crea cliente B con una identificación distinta. Edita cliente B para que su
   identificación pase a ser X también. Verifica que la edición tiene éxito (no
   debería, pero hoy sí).
6. **`#6 se pueden desactivar todos los admins si ninguno es owner`**: requiere crear
   un segundo usuario con rol Administrador que NO sea el fundador/owner de la
   organización (invita desde `/employees/invite`, asígnale el rol Administrador,
   acepta la invitación con una segunda sesión/contexto). Desde la cuenta owner,
   desactiva al segundo admin — debe poder (el owner desactivando a otro admin no está
   bloqueado). Esto por sí solo no reproduce el bug completo (no puedes desactivar al
   owner mismo, eso SÍ está bloqueado y es esperado) — el bug real es que si hubiera 2
   admins NO-owner, ambos podrían desactivarse mutuamente. Si crear un segundo usuario
   no-owner con rol admin y verificar que el owner puede desactivarlo ya ilustra la
   ausencia de la protección "último admin", es suficiente; documenta la limitación de
   cobertura en un comentario si no puedes reproducir el escenario completo de 2
   no-owners por límites de tiempo de setup.
7. **`#7 no existe MFA de usuario`**: navega el flujo de login completo y confirma que
   no aparece ningún paso de código de verificación/2FA tras ingresar email+password
   correctos — llega directo al home. Test simple, de ausencia.
8. **`#8 no hay "olvidé mi contraseña" autoservicio`**: en `/login`, busca un enlace
   "¿Olvidaste tu contraseña?" — YA EXISTE en la UI (visto en pantallas anteriores del
   proyecto). Verifica a dónde lleva y qué pide. Si pide el email y efectivamente
   dispara un flujo de reset sin necesitar que un admin lo inicie, este hallazgo del
   TEST-PLAN puede estar desactualizado o el enlace apunta a un flujo distinto al que
   investigó el agente — en ese caso, documenta la discrepancia explícitamente en el
   test con un comentario y no fuerces el assert a coincidir con `TEST-PLAN.md` si lo
   que ves en pantalla dice lo contrario; repórtalo en vez de adivinar.
9. **`#9 revocar permiso no bloquea sesión activa`**: con dos sesiones (contextos) del
   mismo usuario o con un usuario B ya logueado, quítale un permiso a su rol desde la
   cuenta admin. Sin refrescar el token de la sesión B, intenta seguir usando una
   acción que requería ese permiso — debe seguir funcionando (hoy). Refresca el token
   de B (logout/login, o esperar expiración) y confirma que ahora sí se bloquea.
10. **`#10 organization-service sin consumer de tax-service`**: test de ausencia — no
    es fácil de probar por UI (requeriría verificar que agregar un país nuevo en
    tax-service no lo habilita automáticamente en organization-service). Dado el
    costo/beneficio, documenta este como `test.skip` con el motivo en vez de forzar un
    test de integración cross-servicio complejo — anota la razón en el `skip`.
11. **`#11 inventario no descuenta stock`**: crea un producto tipo "bien" con
    `trackStock: true` (si el formulario de producto expone ese campo — revisa
    `ProductFormView.vue`; si no está expuesto en la UI, es otra divergencia a
    documentar), factúralo, y confirma explícitamente que no hay ningún lugar en la UI
    donde el stock haya cambiado (puede que ni siquiera exista una vista de stock —
    en ese caso, el test es simplemente confirmar que no existe tal vista/sección).
12. **`#12 no existe RIDE`**: test de contrato de API (sección 3.2) —
    `GET /fiscal-invoices/:id/ride` debe responder 404, no un PDF.
13. **`#13 certificado vencido sigue activo`**: requiere poder subir un certificado ya
    vencido de prueba. Si no hay un `.p12` de prueba con fecha vencida disponible en
    el repo, `test.skip` con el motivo (no fabriques un certificado falso solo para el
    test si no hay uno ya preparado para pruebas).
14. **`#14 sin constraint único, condición de carrera`**: elige UN caso representativo
    (sugerido: dos clientes con la misma identificación creados en paralelo desde dos
    contextos) en vez de probar los cuatro/cinco casos de TOCTOU mencionados — cubrir
    uno bien documentado es más valioso que forzar los cinco de forma apurada.
    Documenta en el test que este es representativo del patrón, y lista los otros
    lugares donde aplica (tags, categorías, unidades, código de establecimiento) en un
    comentario, sin necesidad de un test por cada uno.
15. **`#15 rol 'Administrador' hardcodeado por nombre`**: test de ausencia/fragilidad —
    de bajo valor de automatizar (requeriría renombrar el rol del sistema, lo cual no
    tiene UI porque los roles de sistema no se pueden editar). Omite este de la
    automatización; ya quedó documentado en `TEST-PLAN.md`, no hace falta un test.

### Lote 2 — Auth, organización, clientes (base de todo lo demás)

Implementa en este orden porque cada uno depende del anterior:

1. `frontend/e2e/specs/onboarding.spec.ts`: registrar cuenta nueva → completar perfil
   de organización → usar `waitForCondition` para verificar que CONSUMIDOR FINAL
   aparece en `/customers` → verificar que existe un establecimiento "Matriz" en
   `/organization/establishments`. Usa una cuenta nueva por test (`UNIQUE` en el
   email), no la cuenta admin compartida — completar perfil de org en la cuenta admin
   ya la tiene hecha desde `global-setup.ts`, correrlo de nuevo no reproduce "cuenta
   nueva".
2. `frontend/e2e/specs/roles.spec.ts`: casos de la sección 1.2 del TEST-PLAN
   (modificar permisos de rol de sistema → error; nombre de rol duplicado → verificar
   qué código de error real da).
3. Extiende `frontend/e2e/specs/employees.spec.ts` (ya existe) con los casos de la
   sección 1.3 (reinvitar mismo email → 409; filtrado por establecimiento incluye
   admins sin asignar).
4. Extiende `frontend/e2e/specs/customers.spec.ts` (ya existe) con los casos de la
   sección 3 que no estén ya cubiertos (revisa el archivo actual primero para no
   duplicar — ya cubre creación persona/empresa y Consumidor Final autollenado, pero
   no cubre deshabilitar/editar CONSUMIDOR FINAL ni la doble-dirección-primaria).

### Lote 3 — Facturación y fiscal (el flujo de mayor valor de negocio)

Crea `frontend/e2e/specs/invoices.spec.ts` y `frontend/e2e/specs/fiscal.spec.ts`
(separados, porque fiscal depende de tener un certificado subido, que es un
precondition costoso de montar — quieres poder correr los tests de facturación básica
sin necesitar certificado). Casos de la sección 5 y 6 de `TEST-PLAN.md` que no queden
ya cubiertos por `known-bugs.spec.ts` (revisa el Lote 1 antes de escribir estos para no
duplicar los casos #1, #2, #3, #12, #13 que ya viven en `known-bugs.spec.ts`).

### Lote 4 — Productos y plugins

`frontend/e2e/specs/products.spec.ts` y `frontend/e2e/specs/plugins.spec.ts`, casos de
las secciones 4 y 7. El caso de plugins más importante (gateo cross-servicio: 403 en
`/customers` si se desactiva `crm.contacts`) requiere activar/desactivar plugins desde
`/plugins` y luego intentar usar el módulo bloqueado — verifica primero en
`PluginsView.vue` cómo se activa/desactiva desde la UI antes de escribir el test.

**ESTADO AL 2026-09-06: LOTE 4 COMPLETO.** `products.spec.ts` (4/4) y `plugins.spec.ts`
(3 pasan + 1 `test.skip()` documentado) ya existen y pasan. Nada pendiente de este lote
salvo lo que el propio `test.skip()` de `plugins.spec.ts` documenta. Detalle de lo que
se hizo, por si hace falta retocar algo:

**products.spec.ts — TERMINADO. De paso reveló y corrigió un bug real (#21 de TEST-PLAN.md):**
`addImageSchema` en `product-service/src/interface/http/validators.ts` tenía
`isPrimary: z.boolean().default(false)` y `position: z.number().int().default(0)` —
Zod convertía "el frontend no mandó este campo" en `false`/`0` explícitos ANTES de
llegar al caso de uso, y `AddProductImageUseCase` decide con `input.isPrimary ??
isFirst` (un `??` que nunca ve `undefined` si ya llega `false`). Resultado: ninguna
imagen se marcaba nunca como principal, y todas quedaban en `position:0`. Corregido a
`.optional()` en ambos campos, desplegado (build local + `docker cp` a `cmr-product` +
restart, mismo patrón que auth-service/fiscal-ecuador/api-gateway-node antes en esta
sesión). Detalle completo de los 4 tests que ya cubren la sección 4 completa:
- `EstablishmentRequiredError` (crear sin `establishmentIds`): el botón "Crear
  producto" en `ProductFormView.vue:367` está `:disabled="!name || !price ||
  establishmentIds.length === 0"` — **la UI nunca permite intentar el submit sin
  establecimiento**, no hay forma de disparar el error del backend desde ahí. Test
  correcto: crear vía API directa (`POST /products` sin `establishmentIds`) para
  confirmar el 422/400, y opcionalmente un segundo assert de UI confirmando que el
  botón queda disabled (defensa en profundidad, no el mismo camino que el backend).
- `MultipleTaxKindError`: el formulario solo expone UN selector de IVA
  (`vatRateId`, single-select, `ProductFormView.vue:327-336`) — no hay forma de
  asignar 2 tasas del mismo `kind` desde la UI. Test vía API directa: `PUT
  /products/:id/taxes` con 2 `taxRateId` que compartan `kind` (consultar
  `GET /tax-rates` primero para encontrar dos con el mismo `kind`, ej. dos `vat` de
  distinto país/tasa si existen, o revisar el seed).
- Categorías: **no existe ninguna UI de gestión de categorías** (crear/borrar) — solo
  se seleccionan categorías ya existentes en el `v-select` de `ProductFormView.vue`.
  El caso "crear categoría, deshabilitar sus productos, borrarla" es 100% vía API
  (`POST/DELETE /categories`, `POST /products/:id/disable`).
- Imagen principal (única parte genuinamente UI-testable de este lote):
  `ProductDetailView.vue` sí tiene UI completa para borrar imágenes y marcar
  principal (`removeImage`/`setPrimary`, líneas ~99-114 y ~310-335, con chip
  "Principal" visible). El input de archivo es creado dinámicamente por JS en
  `ImageUploader.vue:56-72` (`openPicker()` crea un `<input type=file>`, lo agrega al
  DOM, hace `.click()`, y lo remueve en el listener `change`) — **no uses
  `locator('input[type=file]').setInputFiles(...)` directamente porque el input no
  existe hasta que se hace click**; usa el patrón `page.waitForEvent('filechooser')`
  disparado por el click en la dropzone, y `fileChooser.setFiles(path)`. Necesitas 2
  imágenes de prueba reales (cualquier PNG pequeño sirve) en el repo o generadas al
  vuelo en el test.

**plugins.spec.ts — TERMINADO (3 tests pasan, 1 `test.skip()` documentado):**
- Gateo cross-servicio: el estado real de la organización de prueba (verificado vía
  `GET /organizations/me/plugins` antes de escribir el test) tenía
  `finance.electronic_invoicing` activo (direct) dependiendo de `crm.contacts` —
  desactivar `crm.contacts` directo (el ejemplo original de este brief) habría
  disparado `BlockingDependentsError`, no el 403 que este caso quiere probar. Se usó
  en su lugar `finance.electronic_invoicing` → `/invoices` (mismo mecanismo
  `pluginGate` del gateway). Flujo UI real: `/plugins` → tab "Mis plugins" → ícono de
  desactivar → confirmar en el diálogo (`MyPluginsTab.vue`). **Vuetify NO desmonta
  pestañas inactivas** (`v-tabs-window-item` usa `v-show`) — el mismo plugin también
  vive en el DOM oculto de la pestaña "Catálogo", así que los locators de card deben
  filtrar por `:visible` o Playwright tira violación de modo estricto. El caché de
  plugin-gate del gateway NO se invalida "al instante" en la práctica (a pesar de lo
  que dice TEST-PLAN.md §7) — el evento viaja por RabbitMQ con la misma latencia
  variable que el resto de la suite; el test hace polling corto (20×1s), no un solo
  intento. Restaura el plugin en un `finally` (confirmado con `GET
  /organizations/me/plugins` que queda igual que antes de correr el test).
- `MissingDependenciesError`: confirmado con el catálogo real (`GET /plugins`) que
  NINGÚN plugin `disponible` (comprable) tiene una dependencia que no sea también
  `disponible` con `autoActivate:true` — no hay forma de reproducirlo con el seed
  actual sin fabricar un plugin `is_exclusive` de otra organización. Queda como
  `test.skip()` con la razón documentada inline; no se fabricó nada.
- `BlockingDependentsError`: usa el estado real (`finance.electronic_invoicing`
  activo, depende de `org.establishments`) sin fabricar ni tocar nada — la
  desactivación de `org.establishments` simplemente falla (422, no el 409 que
  TEST-PLAN.md sugería a priori) y no hay limpieza que hacer porque nada cambió.
- Fulfill: `POST /organizations/me/plugin-requests` espera `basedOnPluginCodes`, NO
  `basedOnPluginIds` (`requestCustomPluginSchema` en
  `plugin-catalog-service/validators.ts`) — el nombre del campo no es obvio por el
  nombre de la entidad. `POST /admin/plugin-requests/:id/fulfill` funcionó con el
  mismo token de admin de la organización que creó la solicitud (no hace falta un
  superadmin cross-org; el endpoint sigue atado al contexto de organización del
  caller). Confirmado que el plugin resultante NO aparece activo en
  `GET /organizations/me/plugins`.

### Lote 5 — Inventario y notificaciones (confirmación de ausencia, bajo costo)

`frontend/e2e/specs/gaps.spec.ts` — un archivo dedicado a "esto no existe todavía",
separado de los specs funcionales para que quede claro que no son fallos de la
funcionalidad sino registro de alcance. Casos de las secciones 8 y 9.

**ESTADO AL 2026-09-06: TERMINADO (3/3 tests pasan).** No hay mailhog/mock de correo en
este entorno (`docker-compose.yml` no define ningún servicio de mail; `notification-service`
usa SMTP real si `SMTP_HOST` está seteado, o cae a `ConsoleMailer` si no — y en local
`SMTP_HOST` no está seteado). Verificar un envío real de correo desde una suite
automatizada no es apropiado (no hay buzón que consultar, y no conviene mandar correos
reales repetidamente). Se verifica en su lugar leyendo `docker logs cmr-notification`:
`consumer.ts:18` loggea `[notification] processed <evento> → <email>` por cada evento
que SÍ procesa. Con eso:
- Invitar empleado (`POST /users/invite` directo, no hace falta repetir el flujo de UI
  que ya cubre `employees.spec.ts`) → poll de los logs hasta ver la línea con el email
  invitado.
- Emitir factura → confirmar que NO aparece ninguna línea nueva mencionando
  invoice/factura/billing en los logs — `billing.invoice.issued` ni siquiera tiene
  binding a la cola de `notification-service` (`loadTemplateConfig()` solo enlaza los
  4 eventos de `identity.*`), así que el gap es real a nivel de infraestructura, no
  solo "falta un handler".
- `trackStock`: producto con `trackStock:true` no expone ningún campo de stock en
  `GET /products/:id` antes ni después de facturarlo — no hay dónde descontar nada,
  `inventory-service` no tiene código real.

### Lote 6 — Casos huérfanos de §1.3/§1.4/§1.5/§2 (nunca asignados a un lote)

Estos 9 casos de `TEST-PLAN.md` no estaban en el alcance de NINGUNO de los lotes 1-5
originales — no es que se hayan pasado por alto, el plan de 5 lotes de arriba nunca los
incluyó. Se identificaron y resolvieron el 2026-09-06 en una auditoría posterior.

**ESTADO: TERMINADO (9/9 tests pasan).** Todos van en `employees.spec.ts` (5) y
`org.spec.ts` (4) — ninguno necesitó un archivo nuevo. Todos son casos de contrato de
API (§3.2 de arriba) porque la UI real nunca ofrece el camino que hace falta probar
(un token de invitación manipulado, un rol a medida sin cierto permiso, un token de
reset reusado, etc.):

- **Invitación cross-org / `password:view`** (`employees.spec.ts`): el token de
  `accept-invite` es literalmente `base64url(JSON.stringify({uid, oid}))` **sin firma**
  (`accept-invite.ts:25`) — se puede construir a mano conociendo el `userId` y el
  `organizationId`, exactamente como el link real del correo. Esto destraba TODOS los
  casos que necesitan loguearse como un usuario recién creado con un rol a medida, sin
  pasar por la UI de aceptar invitación.
- **Recuperación de contraseña** (`employees.spec.ts`): el token real de
  `request-password-reset` es un secreto de 32 bytes que NUNCA se expone por ninguna
  API/log (a diferencia del email de invitación, `ConsoleMailer` solo loggea el LARGO
  del cuerpo del correo, no el contenido) — no hay forma de interceptarlo desde afuera
  del proceso para probar "reusar un token ya consumido". Se insertó una fila
  directamente en `password_reset_tokens` (MySQL vía `docker exec`) con el mismo
  algoritmo `sha256` sin sal que usa el código real (`reset-password.ts:29`) — el
  endpoint bajo prueba (`POST /auth/password-reset`) se ejercita igual en ambas
  llamadas, solo el paso de generar+guardar el token se controla desde afuera.
  **Esto reveló y corrigió un bug real (#24)**: el gateway no tenía ninguna regla
  pública para `/auth/password-reset` — caía en el catch-all `/auth/*` (`public:
  false`) y exigía un Bearer token para consumir un link que por definición es para
  alguien SIN sesión activa. Arreglado en `api-gateway-node/src/config/gateway.config.ts`
  agregando la regla explícita, mismo patrón que `/auth/accept-invite`.
- **`organization:admin` vs `organization:update`** (`org.spec.ts`): el ejemplo que la
  propia sección 3.2 de este documento usa para explicar cuándo saltarse la regla
  "contra la UI" — se implementó tal cual se describe ahí.
- **Desactivar la Matriz** (`org.spec.ts`): directo, `PATCH /establishments/:id
  {status:'inactive'}` sobre el establecimiento `isMain:true` de la organización
  compartida — sin efecto secundario, la llamada simplemente falla (422).
- **Carrera de código de establecimiento** (`org.spec.ts`): el caso original ("001 con
  cero establecimientos") resultó NO ser alcanzable por API — `create-establishment.ts`
  exige que la organización ya exista en la tabla local de `organization-service`
  (`ORG_NOT_FOUND` si no), y esa fila solo se crea con `PUT /organizations/me`
  (`upsert-organization-profile`), cuya MISMA transacción auto-provisiona la Matriz si
  la org tiene 0 establecimientos — para cuando `organization-service` conoce a la org,
  ya tiene 1. Se probó el mismo mecanismo (`nextCode` sin protección real) para el
  código siguiente (002+), con el mismo criterio de "documentar el resultado real sin
  forzar un assert" que la carrera de facturas (#1).
- **Pairing POS cross-org** (`org.spec.ts`): `GET
  /establishments/:id/billing-points/:pointId/pairing-code` (admin-autenticado) expone
  el código TOTP vigente de un punto — se usa ese código para emparejar vía `POST
  /billing-points/pair` **sin autenticación y sin ningún dato de organización en el
  body**, la prueba más directa de que `listUnpairedPosPoints()` busca globalmente.

---

## 6. Definición de "terminado" para cada lote

Antes de dar un lote por completo:

1. `npx playwright test <archivo-nuevo> --list` sin errores de sintaxis.
2. Correr el archivo de verdad contra el entorno con todos los servicios arriba
   (sección 1) y confirmar que cada test pasa o, si documenta un bug conocido, pasa
   afirmando el comportamiento actual (no que falla inesperadamente).
3. Ningún test nuevo debe dejar el backend compartido en un estado que rompa otros
   specs — si un test desactiva un plugin, debe reactivarlo al final (usa
   `test.afterEach` o `try/finally`, seas o no exitoso el test, para no dejar
   `crm.contacts` desactivado y romper `customers.spec.ts` en la siguiente corrida).
4. Actualiza el checklist de `TEST-PLAN.md` (los `- [ ]`) marcando `- [x]` los casos
   que quedaron cubiertos, y agrega al final de cada caso el nombre del archivo/test
   que lo cubre, ej.: `- [x] E2E: ... → ver known-bugs.spec.ts:'#2 línea con...'`.

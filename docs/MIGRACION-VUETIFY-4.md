# Migración de Vuetify 3 a Vuetify 4

Plan escrito el 2026-11-06 a partir de la guía oficial
([upgrade guide](https://vuetifyjs.com/en/getting-started/upgrade-guide/),
[typography migration](https://vuetifyjs.com/en/getting-started/typography-migration/),
[grid legacy mode](https://vuetifyjs.com/en/getting-started/grid-legacy-mode/),
[long-term support](https://vuetifyjs.com/en/introduction/long-term-support/)) y de medir el código de `frontend/src`. Estado: **hecha el 2026-11-06** (en local, falta subir el frontend).

## Por qué ahora

- **Vuetify 3 ya está en LTS** desde el 27-jul-2026 y hasta el 27-jul-2027: solo recibe arreglos críticos y de seguridad. Nada nuevo.
- **Vuetify 4 es la versión activa** (4.0.0 salió el 23-feb-2026). No hay un «LTS de la 4»: lo estable es la **última minor, 4.3.x**
  (4.3.0 del 19-oct, 4.3.2 del 3-nov-2026). Se fija `~4.3.2` y se aceptan parches.
- Lo que vamos a construir ya existe estable en la 4 y no en la 3: **`v-date-input` es estable desde 4.1** (en 3.12 y 3.13 sigue en
  *labs*), `v-snackbar-queue` muestra varios avisos a la vez (base de `useNotify`), y el sistema de tipografía MD3.
- Cuanto antes, mejor: cada pantalla nueva escrita con clases de la 3 (`text-h6`, `text-body-2`…) es trabajo extra en la migración. Las
  piezas de `REGLAS-FRONT.md` §1 (`DateField`, `useNotify`, `EmptyState`, `useConfirm`) conviene hacerlas **ya sobre la 4**.

Requisitos: Vue `^3.5.25` (tenemos 3.5.39). No usamos `vite-plugin-vuetify` ni variables Sass de Vuetify (`src/styles/settings.scss`
existe pero nadie lo importa: código muerto, se borra en la migración).

## Inventario: qué nos toca de cada cambio

| Cambio de la 4 | Nos afecta | Medida en `src/` | Cómo se resuelve |
|---|---|---|---|
| **Tipografía MD2 → MD3**: `text-h*`, `text-subtitle-*`, `text-body-*`, `text-caption` dejan de existir | **mucho** | `text-body-2` 389, `text-h6` 161, `text-caption` 134, `text-body-1` 41, `text-subtitle-2` 12, `text-subtitle-1` 7, `text-h5` 4, `text-h4` 1 (~750 usos, ~120 archivos) | codemod (`vuetify-codemods`), tabla conservadora: tamaños idénticos salvo `text-h6` 20→22 px (`text-title-large`) |
| **Reset CSS casi eliminado**: `h1–h6`, `p`, `ul` recuperan márgenes del navegador; `button`, `input`, `select` nativos recuperan borde y fondo | **medio** | `<p>` 138 (49 archivos), `<h1–h6>` 5, `<ul>/<ol>` 8; nativos 25 en la caja web (`components/pos/`, `PosView`) | fragmento de reset de la guía (`h1–h6, p, ul, ol` sin margen) y revisar la caja web, que es HTML propio |
| **Rejilla con `gap`** en vez de márgenes negativos; `dense`, `align`, `justify` de `v-row` pasan a clases | **medio** | `v-row` 138, `v-col` 464 (77 archivos); `v-row dense` 37; `align/justify` en `v-row` 13; `no-gutters` 1 | codemod para las props; para el espaciado, empezar con el CSS de *grid legacy mode* y quitarlo después |
| **Breakpoints más chicos**: md 960→840, lg 1280→1145, xl 1920→1545 | **medio** | 224 `md=`/`lg=` en `v-col`, 13 usos de `useDisplay` | primero restaurar los de la 3 (`display.thresholds`); decidir después si se adoptan |
| **Capas CSS (`@layer`)** en todo Vuetify: el CSS propio sin capa **siempre** gana | medio | `index.html` (`card-surface`), `styles/{mobile,tour,print,pos-kiosk}.css`, 12 `<style>` de componentes | revisar con capturas; si algo pisa a una utilidad (`rounded-0` contra `card-surface`), meterlo en una capa propia |
| Tema por defecto pasa a `system` | no | ya fijamos `defaultTheme: 'light'` en `vuetify.ts` | nada |
| `v-btn` sin mayúsculas por defecto | no | ya usamos `text-none` en el default | se puede **quitar** `class: 'text-none'` del default |
| Sombras MD3 (6 niveles) | poco | 8 usos de `elevation` | revisar a ojo |
| Slots de `v-select`/`v-autocomplete`: `item` pasa a ser `internalItem.raw` | poco | 2 usos de `item.raw` en `TaskFieldInput.vue` | codemod o cambiar a `item.color` |
| `v-snackbar` cambia su estructura interna; `v-snackbar-queue` reescrito | poco | 24 snackbars sueltos, sin `multi-line` | se resuelve con `useNotify` (un solo snackbar, `REGLAS-FRONT.md` R-31) |
| `v-date-picker multiple="range"` emite solo inicio y fin | no | 0 usos | — |
| `VForm` desenvuelve sus slots, `fill-height` no centra | poco | 0 / 5 usos | revisar los 5 `fill-height` |
| `rgba(var(--v-theme-x), a)` solo falla con colores de tema transparentes | no | 11 usos, sin colores transparentes | nada |
| Vite en desarrollo: menús dentro de diálogos quedan detrás (dos instancias de `useStack`) | sí, en dev | — | `optimizeDeps.include` de la guía en `vite.config.ts` |
| Defaults: `undefined` ya no pisa el default | no | — | nada |

## Pasos

Cada paso deja la app funcionando y se puede subir solo. Ninguno toca backend.

0. **Capturas de referencia en la 3. Hecho el 2026-11-06.** `e2e/visual/` (Playwright) lee las rutas del router, resuelve las que
   llevan id abriendo la primera fila de cada lista, y fotografía cada pantalla a 1366 y 375 px, en claro y oscuro: 84 pantallas × 4
   = 336 capturas en `cmr-proyect/.visual/v3/` (fuera de los repos), con un `manifest.json` por combinación. Se repite igual tras
   migrar, con otra etiqueta:

   ```bash
   E2E_EMAIL=… E2E_PASSWORD=… VISUAL_LABEL=v4 npx playwright test -c e2e/visual/visual.config.ts
   ```

   Usa el frontend del contenedor (`:5173`), así que antes hay que reconstruirlo (`docker compose build --no-cache frontend`). Quedan
   fuera 19 pantallas de detalle sin datos para abrir (empleados, roles, compras con su servicio apagado, estados de cuenta, cuentas
   bancarias, anexos) y Reportes, cuyo plugin no está publicado en el catálogo local.
1. **Hecho el 2026-11-06 (sin subir).** Resultado: `vuetify@4.3.2`; codemods aplicados (748 tipografía, 50 rejilla, 8 sombras, 4
   slots de `v-select`) más un `text-body-2` dentro de una función de render (`RichTextView`) que el codemod no ve;
   `src/styles/vuetify4-compat.css` (reset completo de la 3 + *grid legacy mode*); breakpoints de la 3 en `vuetify.ts`;
   `optimizeDeps` en Vite; `useAppTour` acepta colores de tema no textuales; `settings.scss` borrado. El `package-lock.json` se
   regeneró con Node 20 (el del Dockerfile): `@vuetify/v0` pide `@vue/devtools-api >=7` como peer opcional y el npm 10 del
   contenedor exige tenerlo en el lock (el npm 11 local no). `typecheck`, 467 tests, `lint:ui` y `build` en verde.
   **Capturas v3 contra v4** (`node e2e/visual/compare.mjs v3 v4`): las 336 cambian (mediana 9 %), y en todas la causa es la
   tipografía MD3, no una rotura: títulos de tarjeta y `text-title-large` pasan de 20 px/500 a 22 px/400, `text-body-small` y
   `text-title-small` tienen menos interlineado, y botones y pestañas no tienen espaciado de letra extra. Las páginas quedan más
   densas (hasta 660 px más cortas en Plugins). Caja web, factura, tableros, sombras de tarjeta y modo oscuro: iguales.
   Hallazgo aparte: las clases de tipografía pintan en **Roboto** (la 3 lo fijaba en cada clase y la 4 lo usa si no se define
   `--v-font-body`), mientras el resto de la app va en Plus Jakarta Sans.

   Lo que se planeó para este paso: **Subir a `vuetify@~4.3.2` con compatibilidad.** Breakpoints de la 3 en `vuetify.ts`, reset mínimo y *grid legacy mode* en una hoja
   con su capa, `optimizeDeps` en Vite. Ejecutar los codemods (tipografía, props de rejilla, slots de `v-select`). Borrar
   `settings.scss`. `typecheck`, `test`, `build`, `lint:ui`.
2. **Comparar capturas** contra el paso 0 y corregir: caja web (controles nativos), `card-surface` y utilidades por las capas, `<p>`
   con margen, `text-h6` → 22 px.
   **Decisión del dueño (2026-11-06): se adopta la tipografía de Vuetify 4 tal cual**, sin restaurar tamaños ni pesos de la 3 y sin
   unificar la fuente (las clases de tipografía siguen en Roboto, como ya pasaba en la 3).
3. **Hecho el 2026-11-06:** `UI-UX.md` §5 y `AGENTS.md` con las clases MD3 (`text-title-large`, `text-body-medium`,
   `text-body-small`); `REGLAS-FRONT.md` corregido; `check-ui.mjs` rechaza las clases de la 3 (kind `tipografia`) y reconoce los
   títulos a mano con clases MD3. Pendiente de este paso: quitar `text-none` del default de `VBtn` (la 4 ya no pone mayúsculas) y
   reescribir la nota de `no-gutters` de §6 cuando se retire la rejilla heredada. Lo planeado era: **Actualizar el sistema de diseño**: `UI-UX.md` §5 (tipografía con nombres MD3: título de sección `text-title-large`, secundario
   `text-body-medium`, anotación `text-body-small`), §2 (quitar `text-none`), §6 (la nota de `no-gutters` + `ga-*` cambia con `gap`);
   `check-ui.mjs` (prohibir las clases MD2, que ya no existen y fallarían en silencio) y `AGENTS.md`.
4. **Piezas compartidas sobre la 4.** `DateField` **hecho el 2026-11-06** (con `VDateInput` estable; Proyectos migrado, el resto de módulos en `DATE_PENDING`). `useNotify` (con `v-snackbar-queue`), `EmptyState` (con `v-empty-state`),
   `useConfirm` y `utils/format.ts` **hechos el mismo día**; ver la tabla de `REGLAS-FRONT.md` §1.
5. **Hecho el 2026-11-06.** `vuetify4-compat.css` borrado: la rejilla usa el `gap` nativo de la 4 y el reset completo de la 3 se
   cambió por `src/styles/base.css` (el reset selectivo que recomienda la guía —títulos, párrafos y listas sin margen— y los controles
   nativos de la caja web sin borde ni fondo, solo dentro de `.pk`). Capturas `v4` contra `v4b`: la caja web, Inicio y clientes,
   idénticos; el resto, cambios pequeños por la rejilla nativa y por las fechas `dd/mm/yyyy`. Se corrigieron dos cosas que se vieron
   ahí: los filtros de fecha de Compras en columnas de `md="1"` (no cabían) y las fechas ISO del flujo de caja.
   En el mismo paso: los 54 botones principales de pie de diálogo con `variant="flat"` (regla `dialogo` en `lint:ui`), los 49
   `type="date"` y los 21 `<v-snackbar>` de los demás módulos migrados a `DateField` y `notify`, y todas las fechas de la app con
   `utils/format.ts` (corrige un día de menos en la lista y el detalle de facturas). **Breakpoints:** siguen los de la 3 (nadie decidió aún
   cambiarlos) (`display.thresholds` en `vuetify.ts`); adoptar los de la 4 sería otro cambio, con sus capturas.

## Riesgos

- **Solo visuales**: la lógica no cambia. Lo que se rompe se ve (márgenes, tamaños, un menú detrás de un diálogo).
- La **caja web** (`/pos`) es la más expuesta: es HTML propio con `<button>`/`<input>`/`<select>` que hoy dependen del reset de Vuetify.
  Se prueba aparte. La caja de escritorio (`pos/frontend`) es otro proyecto y no usa Vuetify: no le afecta.
- Desplegar es subir el `frontend`; volver atrás es revertir ese commit.

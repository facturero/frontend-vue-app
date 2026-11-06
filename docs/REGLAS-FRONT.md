# Reglas del frontend: patrones de pantalla

`UI-UX.md` decide **cómo se ve** cada pieza (tokens, defaults de Vuetify, espaciado, tipografía). Este documento decide **cómo se
comporta y se arma una pantalla**: qué pasa mientras carga, cuando no hay datos, al borrar, al guardar, en el teléfono… Son las cosas
que hoy cada módulo resuelve a su manera y que luego hay que corregir una por una.

Regla de oro, la misma de `UI-UX.md`: **un patrón se decide una vez y vive en una pieza compartida.** Si una pantalla necesita
resolver por su cuenta algo de esta lista, falta una pieza o una regla aquí; se añade aquí primero.

Cada regla tiene un código (`R-xx`) para citarla en revisiones y commits, y su estado:

- **guardián** — `npm run lint:ui` la comprueba sola.
- **a mano** — se revisa con la lista del final; aún no hay comprobación automática.
- **falta pieza** — la regla exige una pieza compartida que todavía no existe (ver §1). Hasta crearla, sigue el patrón descrito.

---

## 1. Piezas compartidas

Antes de escribir algo de esto en una vista, úsalo de aquí. Si no existe, se crea aquí, no en el módulo.

| Pieza | Para qué | Estado |
|---|---|---|
| `components/ui/PageHeader.vue` | Título, subtítulo y acciones de toda vista de nivel superior | existe |
| `components/ui/FieldHelp.vue` | Ayuda «?» de un campo | existe |
| `composable/useConfirm.ts` + `components/ui/ConfirmDialog.vue` (uno, en `App.vue`) | Toda confirmación: `if (!(await confirm({ title, text, confirmText, destructive })))` | **existe** (2026-11-06); ya no queda ningún `window.confirm` |
| `components/ui/EmptyState.vue` | Pantalla, tabla o columna sin datos (`compact` dentro de columnas y secciones) | **existe** (2026-11-06); en uso en la lista de proyectos |
| `composable/useNotify.ts` + el único `<v-snackbar-queue>`, en `App.vue` | Avisos: `notify.success`, `notify.error(err)`, `notify.undoable` | **existe** (2026-11-06); ya no queda ningún `<v-snackbar>` fuera de `App.vue` |
| `utils/format.ts` (+ `utils/isoDate.ts`) | `formatDate`, `formatDateTime`, `formatMoney`, `formatNumber` | **existe** (2026-11-06); todas las fechas de la app salen de aquí (`dd/mm/yyyy`); el dinero aún usa `utils/accounting.formatMoney` en varios módulos |
| `components/ui/DateField.vue` | Todo campo de fecha y rango: envuelve `v-date-input` (estable desde Vuetify 4.1) y habla `YYYY-MM-DD` | **existe** (2026-11-06); ya no queda ningún `type="date"` en la app. `required`: la fecha no se puede vaciar |

Antes de cualquier pieza, la regla de `UI-UX.md` §1: **solo componentes de Vuetify**; si Vuetify no tiene lo que hace falta, se
pregunta antes de construirlo o de instalar una librería.

Al crear una pieza: documéntala en esta tabla, migra al menos un módulo a ella en el mismo cambio y, si se puede, añade al
guardián la comprobación que impida volver al patrón viejo.

---

## 2. Estados de una pantalla

Toda vista y todo bloque que pide datos tiene **cinco estados**, y los cinco se diseñan, no se dejan al azar:

| Estado | Cómo se ve | Regla |
|---|---|---|
| Cargando por primera vez | `v-progress-linear indeterminate` bajo el encabezado; en tablas, su prop `loading` | R-01 |
| Recargando (ya hay datos) | Los datos siguen visibles; solo la barra o el `loading` de la tabla. **Nunca** se vacía la pantalla | R-02 |
| Vacío | `EmptyState`: icono, título, una frase y la acción para salir del vacío | R-03 |
| Error al cargar | `v-alert type="error"` bajo el encabezado, con lo que pasó en lenguaje de persona y botón «Reintentar» si aplica | R-04 |
| Sin permiso / solo lectura | Lo que no se puede hacer **no se muestra**; si se ve pero no se edita, se dice una vez (chip «Solo lectura») | R-05 |

- **R-01 / R-02 (a mano).** Un `v-skeleton-loader` solo cuando la forma del contenido es conocida y fija (tarjetas, resumen). No se
  combinan barra y esqueleto en la misma zona.
- **R-03 (falta pieza).** Hay tres vacíos distintos y cada uno dice algo distinto:
  - *aún no hay nada* → invita a crear («Crea tu primer proyecto» + botón);
  - *el filtro no encontró nada* → ofrece limpiar el filtro, no crear;
  - *todo hecho* (bandeja, tareas) → celebra, sin botón.
  Una columna de tablero, una sección de lista o una tabla vacías también llevan su vacío (en pequeño), no un hueco en blanco.
- **R-04 (a mano).** El error de **cargar** va arriba (alerta). El error de **una acción** va donde se hizo: dentro del diálogo si
  la acción es de un diálogo, en un aviso (§5) si fue un clic en la página. Nunca un error de un diálogo detrás del diálogo.
- **R-05 (a mano).** Ocultar vs deshabilitar: se **oculta** lo que el rol no permite nunca; se **deshabilita** lo que se podrá hacer
  cuando cambie algo (falta un dato, la tarea está bloqueada) y entonces un `v-tooltip` o un texto dice qué falta.

---

## 3. Acciones y botones

### Jerarquía (R-10, a mano)

| Nivel | Cómo | Cuántos |
|---|---|---|
| Principal | `color="primary"` sin `variant` (ya es `flat`) | **uno** por zona: encabezado, diálogo, tarjeta |
| Secundaria | `variant="text"` | las que hagan falta |
| Destructiva | `color="error"`, **solo** dentro del `ConfirmDialog`; en menús, ítem con icono de borrar, sin color | — |
| Alternar estado / navegación (anterior–siguiente, «Hoy») | `variant="tonal"` o `v-btn-toggle` | — |

`variant="outlined"` no se usa en botones: compite con los campos (que son `outlined`) y crea un cuarto nivel que nadie sabe leer.

### Tamaños (R-11, a mano)

| Dónde | Tamaño |
|---|---|
| Encabezado de página, pie de diálogo, vacíos | por defecto (no se escribe) |
| Barras de herramientas, filas de lista, paneles laterales, tarjetas | `size="small"` |
| Dentro de un chip o de una celda muy densa | `size="x-small"` (solo icono) |

### Botones solo de icono (R-12, guardián: pendiente)

- Llevan **siempre** `:aria-label="t('…')"`. Sin texto visible, el lector de pantalla y el test no saben qué hacen.
- Llevan `v-tooltip` cuando el icono no es universal. Son universales: cerrar, borrar, editar, más opciones, buscar, añadir. Lo demás
  (teclado, plantilla, duplicar, dependencia…) lleva tooltip con el mismo texto del `aria-label`.

### Glosario de iconos (R-13, guardián: pendiente)

Un concepto, un icono. Variante `-outline` para acciones; la rellena solo para un estado activo (me gusta dado, completada).

| Concepto | Icono | No usar |
|---|---|---|
| Borrar | `mdi-trash-can-outline` | `mdi-delete`, `mdi-delete-outline` |
| Editar | `mdi-pencil-outline` | `mdi-pencil` |
| Más opciones | `mdi-dots-vertical` en filas y tarjetas; `mdi-dots-horizontal` en encabezados | — |
| Cerrar | `mdi-close` | `mdi-close-circle*` |
| Añadir / nuevo | `mdi-plus` | `mdi-plus-circle-outline` |
| Recargar | `mdi-refresh` | `mdi-reload` |
| Buscar | `mdi-magnify` | — |
| Archivar / desarchivar | `mdi-archive-outline` / `mdi-archive-arrow-up-outline` | — |
| Duplicar | `mdi-content-copy` | — |
| Descargar | `mdi-download-outline` | — |

Si un concepto nuevo se repite en dos módulos, se añade aquí.

---

## 4. Diálogos y paneles

### Tamaños (R-20, guardián: pendiente)

Solo tres anchos. Hoy hay 13 valores distintos (400, 420, 440, 480, 500, 520, 560, 600, 640, 720, 760, 860, 880).

| Tamaño | `max-width` | Para |
|---|---|---|
| Normal | *(no se escribe: 480 es el default)* | confirmaciones, formularios de 1–4 campos |
| Ancho | `640` | formularios con secciones, listas editables (reglas, campos, opciones) |
| Extra | `880` | galerías (plantillas), tablas dentro del diálogo, vista previa |

Escribir `max-width="480"` es repetir el default (R-20 lo rechazará).

### Anatomía (R-21, a mano)

```vue
<v-dialog v-model="open" max-width="640">
  <v-card>
    <v-card-title>{{ t('modulo.dialogo.titulo') }}</v-card-title>
    <v-card-text class="d-flex flex-column ga-4">
      <div class="text-body-medium text-medium-emphasis">{{ t('modulo.dialogo.explicacion') }}</div>
      <v-alert v-if="error" type="error" closable @click:close="error = null">{{ error }}</v-alert>
      <!-- campos -->
    </v-card-text>
    <v-card-actions class="flex-wrap ga-2">
      <v-spacer />
      <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
      <v-btn color="primary" :loading="saving" :disabled="!valid" @click="save">{{ t('common.save') }}</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

- Orden fijo del pie: espacio, **Cancelar** (texto), **acción principal** (sólida, verbo concreto: «Crear proyecto», no «Aceptar»).
  Sólida quiere decir `variant="flat"` escrito en el botón: `v-card-actions` pone a sus botones en `text` por encima de los defaults
  globales. `lint:ui` rechaza un botón con color sin `variant` dentro de un `v-card-actions` (kind `dialogo`).
- El primer campo lleva `autofocus`; en un diálogo de un solo campo, Enter confirma.
- El botón principal muestra `:loading` mientras guarda y el diálogo **no se cierra** hasta que el servidor responde bien; si falla,
  el error se queda dentro (R-04).
- Escape y clic fuera cierran **solo** si no hay cambios sin guardar; con cambios, piden confirmación (`useConfirm`).
- Un diálogo no abre otro diálogo encima, salvo la confirmación.

### Confirmaciones (R-22, falta pieza; guardián: prohibir `confirm(`)

- Nunca `window.confirm()`: no respeta el tema, el idioma del botón ni el teléfono. Hoy aún lo usan clientes, productos,
  establecimientos y temas del POS (7 usos).
- Siempre `useConfirm()`: el título es la pregunta con el nombre del objeto («¿Borrar el proyecto «Cierre mensual»?»), el texto dice
  la consecuencia («Se borran sus 34 tareas. No se puede deshacer.») y el botón dice el verbo («Borrar», en `error`).
- Se confirma lo **irreversible** o lo que afecta a otros. Lo reversible no se confirma: se hace y se ofrece «Deshacer» en el aviso (§5).
  Archivar, completar o mover no se confirman.

### Panel lateral de detalle (R-23, a mano)

Para ver y editar un elemento sin perder la lista (tarea, movimiento, documento):

- `v-navigation-drawer location="right" temporary`, ancho `560` en escritorio y **ancho completo** en teléfono
  (`const { mobile, width } = useDisplay()` y `:width="mobile ? width : 560"`: el drawer solo acepta un número; 360 fijo deja una
  franja inútil a un lado).
- Cabecera fija con: acción principal del elemento a la izquierda, iconos (más opciones, cerrar) a la derecha.
- La URL refleja el elemento abierto (`?task=<id>`), para poder compartir el enlace y que «atrás» lo cierre.

---

## 5. Avisos

### Cuándo usar qué (R-30, a mano)

| Situación | Pieza |
|---|---|
| Se hizo lo que la persona pidió (guardado, enviado, copiado) | aviso breve (`notify.success`), 4 s |
| Se hizo algo reversible (archivar, borrar en lote, mover) | aviso con **Deshacer**, 6 s |
| Falló una acción de página | aviso de error (`notify.error`), se queda hasta cerrarlo |
| Falló la carga, o un estado que la persona debe ver mientras dure (archivado, sin conexión, período cerrado) | `v-alert` en la página |
| Algo dentro de un diálogo o formulario | `v-alert` dentro del diálogo, o el error del campo |

### Un solo snackbar (R-31, falta pieza)

Hoy hay 24 `<v-snackbar>` repartidos por vistas, con tres tiempos distintos (3000, 3500, 4000) y colores a criterio. Se reemplazan
por **uno** en `App.vue` que lee `useNotify()`; las vistas solo llaman `notify.success(t('…'))` o `notify.error(err)`.

### Cambios al instante (R-32, a mano)

Lo que se edita en línea (título de tarea, responsable, fecha, arrastrar una tarjeta) se ve cambiado **en el momento**; si el
servidor lo rechaza, se vuelve atrás y se avisa. Un conflicto de versión (409) recarga el elemento y dice «Otra persona lo cambió;
se cargó la versión actual».

---

## 6. Formularios

- **R-40 Un modo por pantalla (a mano).** O se guarda con botón (formularios, diálogos, ajustes) o se guarda solo al salir del campo
  (paneles de detalle estilo Asana). No se mezclan en la misma vista. En el modo «al salir del campo», el campo muestra que guarda y,
  si falla, vuelve a su valor con el error.
- **R-41 Validación (a mano).** Las reglas del campo (`:rules`) avisan al salir del campo, no mientras se escribe. Los errores del
  servidor por campo (`ValidationError` con `field`) se pintan en ese campo, no en una alerta genérica. El botón principal se deshabilita
  solo si falta algo obligatorio.
- **R-42 Etiquetas (a mano).** Todo campo tiene `label` (no solo `placeholder`). Obligatorio = sin marca; opcional = «(opcional)» en la
  etiqueta, solo si en el formulario hay más obligatorios que opcionales. Los límites de longitud muestran `:counter`.
- **R-43 Fechas en el estado (a mano).** En el estado y en la API, una fecha es `YYYY-MM-DD` y una fecha-hora es ISO en UTC. Lo
  local solo existe en pantalla (§8). Prohibido `toLocaleDateString('en-CA')` para sacar el `YYYY-MM-DD`: va a `utils/format.ts`.

---

## 7. Listas, tablas y tableros

- **R-50 Tabla o lista (a mano).** Datos con columnas que se ordenan, filtran o paginan → `v-data-table` / `v-data-table-server`
  (este último si la lista crece sin techo, como la bitácora). Filas interactivas de verdad (arrastrar, editar en línea, secciones
  plegables) → lista propia. `v-table` solo para tablas pequeñas fijas (resúmenes, detalle de una factura).
- **R-51 Anchos de columna (a mano).** En `v-data-table`, por `headers` (`width`). En una lista propia, el ancho se define **una vez**
  en una constante y se usa en cabecera y filas; nunca `style="width: 120px"` repetido a mano en cada celda.
- **R-52 La fila entera abre el elemento (a mano).** Con `cursor-pointer` y `hover`. Las acciones de la fila (completar, menú) paran
  la propagación. En teléfono, la fila muestra solo lo esencial: título, estado y un dato (fecha o responsable).
- **R-53 Chips en filas (a mano).** `size="x-small"` en filas de lista y tabla, `size="small"` en encabezados y paneles. Máximo dos
  chips por tipo y «+N» para el resto.
- **R-54 Filtros (a mano).** Encima de la tabla, en una fila `d-flex flex-wrap ga-2`; cada filtro `cols="12" sm="…"` (UI-UX §3). Un
  filtro activo se ve (chip o contador «Filtros (2)») y se limpia con un clic. El filtro se refleja en la URL.
- **R-55 Tablero (a mano).** Columnas de ancho fijo con scroll horizontal del tablero, nunca de la página. Cada columna tiene su vacío
  pequeño y su «Añadir» al pie.

---

## 8. Datos en pantalla

- **R-60 Formato (guardián: pendiente).** Toda fecha, dinero, número o duración sale de `utils/format.ts`, que usa el
  idioma activo de i18n. Prohibido en vistas: `new Intl.*`, `toLocaleString`, `toLocaleDateString`, `toFixed` para dinero.
  - Dinero: siempre en centavos en el estado; en pantalla con su moneda (`$1.234,50` según idioma); alineado a la derecha en tablas.
  - Fechas: **siempre `dd/mm/yyyy`** (`formatDate`), en cualquier idioma (decisión del dueño, 2026-11-06), y `dd/mm/yyyy HH:mm` con hora
    (`formatDateTime`). Se escriben igual en `DateField`. Con palabras solo lo relativo cercano: «Hoy», «Mañana», «Ayer», «Vencida», y
    «hace 5 min» en actividad y avisos. Los rótulos de calendario y de ejes (nombre del día o del mes, semanas de un gráfico) no son
    «una fecha» y siguen el idioma.
  - Cantidades: los decimales que trae el producto, sin ceros de relleno.
- **R-61 Colores de estado (a mano).** Los de `UI-UX.md` §2 (positivo `lightsuccess`, intermedio `lightwarning`, negativo
  `lighterror`, neutro `lightinfo`). Un estado no se comunica **solo** con color: lleva texto o icono.
- **R-62 Personas (a mano).** Una persona se muestra con avatar + nombre; si solo cabe el avatar, el nombre va en tooltip. Sin nombre
  conocido: el correo; nunca un UUID suelto en pantalla.
- **R-63 Identificadores técnicos (a mano).** UUIDs, request-ids y claves de evento van en `text-body-small text-medium-emphasis` y solo
  en vistas técnicas (bitácora, detalle). Nunca como dato principal.

---

## 9. Encabezado de página

- **R-70 Cuántas acciones (a mano).** En `#actions`: **una** principal y, como mucho, dos secundarias visibles. El resto va a un menú
  `mdi-dots-horizontal`. En teléfono (`mobile`): solo la principal y el menú. Indicadores (salud del proyecto, miembros, cronómetro)
  no son acciones: van en el subtítulo o debajo del encabezado.
- **R-71 Pestañas de una vista (a mano).** `v-tabs` con icono + texto, `show-arrows`, y la pestaña activa en la URL
  (`?view=board`), para que recargar o compartir no te devuelva a la primera.

---

## 10. Textos

- **R-80 Todo por i18n (guardián: parcial).** Nada de texto visible escrito en la plantilla, tampoco en `title=`, `label=` ni
  `placeholder=`. Las tres lenguas (`es`, `en`, `fr`) a la vez.
- **R-81 Plurales y variables (a mano).** `t('clave', n)` con las formas `cero | una | varias`; nunca concatenar trozos traducidos
  («3 » + t('tareas')): en otro idioma el orden cambia.
- **R-82 Tono (a mano).** De tú. Botones con verbo en infinitivo y sin punto («Crear proyecto»). Mayúscula solo al inicio. Errores:
  qué pasó y qué hacer («No se pudo guardar: la tarea ya no existe. Recarga la lista.»), nunca «Error 500» ni el mensaje en inglés del
  servidor.

---

## 11. Accesibilidad y teclado

- **R-90 (a mano).** Todo lo que se hace con el ratón se puede hacer con el teclado: los elementos clicables son `v-btn`, `v-list-item`,
  `<a>` o llevan `tabindex="0"` y responden a Enter.
- **R-91 (a mano).** Arrastrar nunca es la única forma: si una tarjeta se mueve arrastrando, también se mueve desde su menú
  («Mover a…»).
- **R-92 (a mano).** Los atajos de un módulo se listan en su diálogo de atajos (`?`) y no pisan los del navegador.

---

## 12. Teléfono y modo oscuro

- **R-95 (a mano).** Cada pantalla se mira a **375 px** y a **1366 px**, en claro y en oscuro, antes de darla por terminada. Sin scroll
  horizontal de la página (solo dentro de tablas, tableros y cronogramas).
- **R-96 (a mano).** En teléfono, los paneles laterales y los diálogos «Extra» ocupan la pantalla completa (`:fullscreen="mobile"`).
- **R-97 (a mano).** Un color hecho a mano en CSS (cronograma, calendario, editor de texto) usa `rgb(var(--v-theme-…))` o
  `rgba(var(--v-border-color), var(--v-border-opacity))`, igual que el plano del restaurante (UI-UX §«Editor del plano»).

---

## 13. Antes de entregar una pantalla

1. `npm run lint:ui` y `npm run build` en verde (UI-UX §7).
2. Los cinco estados (§2): cargando, recargando, vacío (los tres tipos que apliquen), error, sin permiso/solo lectura.
3. Confirmaciones con `useConfirm`, avisos con `useNotify`, formatos con `utils/format.ts`.
4. Botones: una principal por zona, tamaños de la tabla §3, iconos del glosario, `aria-label` en los de solo icono.
5. Diálogos: uno de los tres anchos, pie en orden, error dentro, no se cierra hasta guardar.
6. Encabezado: como mucho 1 + 2 acciones visibles; pestañas y filtros en la URL.
7. Captura a 375 y 1366 px, en claro y oscuro.
8. Las tres lenguas.

---

## 14. Qué vigila el guardián

Hoy `lint:ui` (`scripts/check-ui.mjs`, `check-icons.mjs`, `check-audit-labels.mjs`) comprueba: props que ya son default, títulos a
mano, colores hex, `<style>` en vistas, media queries, topes de ancho, iconos inexistentes y etiquetas de la bitácora.

Lo que se le irá añadiendo, en este orden, a medida que existan las piezas (cada regla nueva entra con las excepciones de hoy
listadas y con fecha, igual que `EXCEPTIONS` en `check-ui.mjs`):

1. ~~`confirm(` en `.vue` (R-22)~~ **hecho el 2026-11-06** (kind `confirmar`, sin excepciones).
2. `max-width` de diálogo fuera de 640/880, y `max-width="480"` repetido (R-20).
3. Iconos del «No usar» del glosario (R-13).
4. `v-btn` con `icon=` sin `aria-label` (R-12).
5. `new Intl.`, `toLocale*` y `toFixed(` en `.vue` (R-60).
6. ~~`<v-snackbar` fuera de `App.vue` (R-31)~~ **hecho el 2026-11-06** (kind `aviso`, sin excepciones).
7. ~~`variant="outlined"` en `v-btn` (R-10)~~ **hecho el 2026-11-06** (kind `boton`, sin excepciones; `v-btn-toggle` sí puede).
8. ~~`type="date"`~~ **hecho el 2026-11-06** (kind `fecha`, sin excepciones). Faltan `type="time|number|color"`,
   `<select>` y `<button>` fuera de las excepciones de `UI-UX.md` §1.

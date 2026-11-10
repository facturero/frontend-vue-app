# Sistema de UI / UX

Regla de oro: **el estilo se define una vez, en un sitio, y las vistas sólo
describen contenido y comportamiento.** Si una vista necesita decidir cómo se ve
algo, es que falta una decisión aquí.

Este documento fija **el aspecto**. Los **patrones de pantalla** (estados de
carga y vacío, confirmaciones, avisos, diálogos, formularios, tablas, formatos,
teclado) están en [`REGLAS-FRONT.md`](REGLAS-FRONT.md).

---

## 1. Dónde vive cada decisión

| Decisión | Único sitio donde se define | Cómo se usa en la vista |
|---|---|---|
| Colores | `theme.themes.light/dark.colors` en `src/plugins/vuetify.ts` | `color="primary"`, `class="bg-auth-panel text-medium-emphasis"` |
| Aspecto por defecto de un componente | `defaults` en `src/plugins/vuetify.ts` | no se escribe nada |
| Estructura de página | `src/components/ui/PageHeader.vue` | `<PageHeader :title="…">` |
| Ayuda de un campo | `src/components/ui/FieldHelp.vue` | `<FieldHelp :text="$t('…')" />` |
| Espaciado, flex, tamaños | utilidades de Vuetify | `class="d-flex ga-4 pa-6 mb-6"` |
| Textos | `src/i18n/{es,en,fr}.json` | `$t('…')` |

Nunca: colores hex en un `.vue`, `<style>` en una vista, ni `px` a mano cuando
existe una utilidad.

### Solo componentes de Vuetify

**Toda pieza de interfaz es un componente de Vuetify.** Nunca el control nativo
de HTML (`<input type="date">`, `type="time"`, `type="number"`, `type="color"`,
`<select>`, `<button>`) ni una librería de interfaz aparte.

Por qué: un control nativo lo dibuja el navegador, no la app. Se ve distinto en
Chrome, Safari y Android, no sigue el tema (en oscuro sale blanco), ignora los
defaults de `vuetify.ts` y muestra la fecha en el idioma **del sistema
operativo**, no en el que eligió la persona en el CRM. Ejemplo real: las fechas
de inicio y fin de una tarea usan `v-text-field type="date"`, y lo que se abre
es el calendario de Chrome, no el `v-date-picker` del tema.

| Necesito | Uso | No uso |
|---|---|---|
| Una fecha | `<DateField>` (= `v-date-input`, ver abajo) | `type="date"` |
| Un rango (inicio–fin) | dos `<DateField>`, el de fin con `:min` = inicio; o uno con `multiple="range"` | dos `type="date"` sin relación |
| Una hora | `v-time-picker` dentro de un `v-menu` (Vuetify 3.12 no tiene campo de hora, ni en *labs*) | `type="time"` |
| Un número, una cantidad, un importe | `v-number-input` (con `:precision` y `:min`) | `type="number"` |
| Un color | `v-color-picker` | `type="color"` |
| Un archivo | `v-file-input` o `ImageUploader` | `<input type="file">` |
| Elegir de una lista | `v-select` / `v-autocomplete` | `<select>` |
| Un botón | `v-btn` | `<button>` |

**Fechas: `v-date-input`, siempre a través de `components/ui/DateField.vue`**
(existe desde el 2026-11-06). El componente de Vuetify para escribir o elegir una fecha es
[`v-date-input`](https://vuetifyjs.com/en/components/date-inputs/): un
`v-text-field` con el `v-date-picker` del tema, que acepta `min`, `max`,
`clearable`, `readonly`, `input-format`/`display-format` y rangos
(`multiple="range"`), y es estable desde **Vuetify 4.1** (usamos la 4.3). Ninguna
vista lo usa directo: lo usa `DateField`, que

- recibe y emite `YYYY-MM-DD` (el componente trabaja con `Date`; la API y el
  estado, con texto ISO — `REGLAS-FRONT.md` R-43),
- muestra la fecha en el idioma activo del CRM (`dd/mm/aaaa` en español) y el
  calendario empieza en lunes,
- su aspecto (contorno, densidad, icono dentro del campo) sale de `VDateInput`
  en `plugins/vuetify.ts`,
- y expone `focus()` (el atajo **D** del detalle de tarea lo usa),
- y para un rango inicio–fin se usa dos veces, el fin con `:min` = inicio (o
  una sola con `multiple="range"` cuando el rango se elige de una vez, como un
  filtro de fechas).

**Componentes *labs* de Vuetify** (`VMaskInput`, `VFileUpload`, `VColorInput`…):
no se usan sin una decisión explícita del dueño. Si se adopta uno, entra
envuelto en una pieza de `components/ui/` (como `DateField` con
`VDateInput`), para que su cambio de API toque un archivo y no veinte, y se
anota en la lista de excepciones de abajo.

**Si Vuetify no tiene el componente, se pregunta antes de construirlo.** No se
escribe un control a mano ni se instala una librería por cuenta propia: se
plantea la necesidad al dueño (qué hace falta, por qué ningún componente de
Vuetify sirve y qué alternativas hay) y, si se aprueba, queda anotado aquí
con su motivo.

Excepciones aprobadas hoy:

| Qué | Con qué | Por qué Vuetify no sirve |
|---|---|---|
| Caja web (`/pos`) | HTML propio + `pos-kiosk.css` | debe verse igual que la caja de escritorio, con el tema del cliente (ver «La caja web…») |
| Plano del restaurante | SVG propio | medidas reales, imán y deshacer (ver «El editor del plano…») |
| Vista previa del tema del POS | `div` con estilos en línea | tiene que ser fiel a la caja, no al CRM (§9) |
| Texto enriquecido (descripción y comentarios de tareas) | Tiptap (`@tiptap/*`) | Vuetify no tiene editor de texto con formato ni menciones |
| Arrastrar y soltar (tablero, listas) | `vue-draggable-plus` | Vuetify no tiene arrastrar y soltar |
| Recorrido guiado | `driver.js` | Vuetify no tiene tours (§8) |
| Color del editor de tema del POS | `<input type="color">` | **por revisar**: se decidió cuando Vuetify no traía `v-color-picker`; hoy sí lo trae |
| Búsqueda global (Ctrl+K) | `v-command-palette` (*labs*, aprobado 2026-11-10), envuelto en `components/ui/CommandPalette.vue` | está en *labs*; se envuelve para que un cambio de API toque un archivo. Filtro propio (`no-filter`): el orden y los resultados de Proyectos los decide `GlobalSearch` |
| Gráfico de anillo (panel del proyecto) | `v-pie` (*labs*, aprobado 2026-11-10), envuelto en `components/ui/PieChart.vue` | está en *labs*. Colores por token del tema: el envoltorio los pasa como `rgb(var(--v-theme-…))`, nunca en hexadecimal |

**Fechas: hecho el 2026-11-06.** Las 61 `type="date"` de la app pasaron a
`DateField` y `lint:ui` rechaza cualquier `type="date"` (kind `fecha`, sin
excepciones). Pendientes, para cuando se toque cada pantalla: 36
`type="number"` (→ `v-number-input`) y 4 `type="time"`.

---

## 2. Los defaults son la fuente de verdad

`src/plugins/vuetify.ts` ya fija esto para toda la app:

```
VCard          elevation 0 + clase card-surface (radio 7px, sombra suave)
VBtn           variant flat, rounded lg, sin MAYÚSCULAS (text-none)
               ⚠ dentro de v-card-actions Vuetify fuerza `text`: la acción principal de un
                 pie de tarjeta o diálogo lleva `variant="flat"` explícito (lint:ui lo exige)
campos*        variant outlined, density compact, hide-details auto
VAlert         variant tonal, density compact, rounded lg
VChip          variant tonal
VCheckbox      color primary, density compact
VDialog        max-width 480
VDataTable     hover
```

\* `v-text-field`, `v-textarea`, `v-select`, `v-autocomplete`, `v-combobox`, `v-file-input`, `v-number-input`, `v-date-input`

### Colores tonales

Además de los colores base hay una familia `light*` para fondos suaves:
`lightprimary`, `lightsecondary`, `lightsuccess`, `lightinfo`, `lightwarning`,
`lighterror`.

Úsalos en paneles, chips de estado y avisos — nunca escribas un hex a mano:

```vue
<v-sheet color="lightsuccess" class="pa-4">…</v-sheet>
<v-chip color="lightwarning">Pendiente</v-chip>
```

**Los chips de estado sobre `light*` llevan `variant="flat"`.** El default de
`v-chip` es `tonal`, que pinta el fondo con el propio color al 12%: sobre un
token pálido el texto se vuelve ilegible. Con `flat` el fondo es el tono y el
texto sale del token emparejado `on-light*` (el color base). Ejemplo real:

```vue
<v-chip color="lightwarning" variant="flat">Pendiente</v-chip>
```

Es la excepción a "no sobreescribir": cambiar el default a `flat` apagaría
todos los chips con colores base de golpe, así que `flat` se decide en cada
chip de estado, nunca en la vista.

Funcionan en claro y en oscuro porque son tokens del tema, no colores fijos.

**Tipos y estados en las tablas de listado usan esta misma familia.** Empleados,
clientes, productos, facturas y roles pintan sus chips con `light*` + `flat`
según la semántica:

- estado positivo → `lightsuccess` (Activo, Emitida, Vendedor en RoleBadge)
- estado intermedio/parado → `lightwarning` (Inactivo, Borrador)
- estado negativo/final → `lighterror` (Anulada)
- "tipo"/etiqueta neutra → `lightinfo` (persona, bien/servicio); empresa → `lightprimary`
- etiqueta de sistema → `lightsecondary` (Sistema, establecimientos)

Ejemplo real en `CustomersListView.vue`:

```vue
<v-chip size="x-small" variant="flat" color="lightsuccess">Activo</v-chip>
```

**Antes de escribir una prop de estilo, mírala en esa lista.** Si el valor
coincide, no la escribas — repetirla es exactamente cómo empiezan las
divergencias: alguien cambia el default y esa vista se queda atrás.

Si necesitas otro valor **de forma recurrente**, cambia el default; no lo
sobreescribas vista por vista. Sobreescribir es legítimo sólo cuando es una
excepción real y puntual.

---

## 3. Anatomía de una vista

Toda vista de nivel superior tiene la misma forma:

```vue
<template>
  <v-container>
    <PageHeader :title="$t('modulo.title')" :subtitle="$t('modulo.subtitle')">
      <template #actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="crear">
          {{ $t('modulo.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4">
      {{ store.error }}
    </v-alert>

    <v-card>
      <v-card-text>…</v-card-text>
    </v-card>
  </v-container>
</template>
```

Reglas fijas:

- El contenedor raíz es `<v-container>`, y **es fluido por defecto** (`VContainer: { fluid: true }` en `vuetify.ts`): la página ocupa el
  100 % del ancho en una laptop. No escribas `fluid` ni un `max-width` en las vistas. El único tope vive en `App.vue` (`APP_MAX_WIDTH`,
  1920 px): en monitores más grandes la página se centra con márgenes a los lados.
  **Qué no se hace en una vista:** un `max-width` de 500 px o más, un `.invoice-workspace { max-width }` en un `<style>`, ni meter el contenido en
  una columna `<v-col cols="12" md="8" lg="6">` (angosta en la laptop y deja franjas vacías). `npm run lint:ui` lo rechaza (kind `ancho`). Las
  únicas pantallas angostas por diseño son las de acceso (`AuthView`, `AcceptInviteView`, `ResetPasswordView`: tarjeta centrada) y la caja web
  (`/pos`, a pantalla completa con su propio diseño). Un párrafo con `max-width` como medida de lectura sí vale.
  Las columnas que se reparten el ancho (8/4, 5/7, 6/6…) están bien: lo prohibido es dejar columnas vacías.
- El título lo pone **siempre** `PageHeader`, nunca un `<h1>`/`<h2>` suelto.
- Las acciones de `PageHeader` **se parten en varias líneas** (`flex-wrap`) en pantallas estrechas: con dos o más botones, en un teléfono el último se salía del ancho y la página tenía scroll lateral. No fuerces `flex-nowrap` ni anchos fijos en los botones de un encabezado.
- El bloque del título **crece** (`flex-grow-1`): si las acciones caben, quedan a la derecha en la misma fila; si no, bajan a la fila siguiente **alineadas a la izquierda**, bajo el título (antes quedaban sueltas a la derecha con un hueco debajo del título). En el teléfono (`xs`) el título baja a `text-title-large`: a 24 px, el nombre de un proyecto y sus acciones no cabían en una fila (2026-11-10).
  Así el nivel de encabezado y el margen inferior son idénticos en todas partes.
- **El encabezado es fijo en todas las pantallas** (`PageHeader`, por defecto): se queda bajo la barra superior al hacer scroll para que
  sus acciones (el carrito de módulos, «Crear rol», etc.) no desaparezcan. Arriba del todo es el panel de siempre; al bajar crece de
  forma gradual, atada al scroll, hasta el 100 % del ancho útil, pierde las esquinas y se compacta (menos relleno), sin sombra. Su
  hueco en la página no cambia: lo que pierde de alto se lo suma al margen inferior (si no, el contenido se movería mientras se hace
  scroll). No se fija dentro de tarjetas ni diálogos (las secciones embebidas de Ajustes), ni si en reposo mide más de 112 px (móvil,
  con las acciones en otra fila). `:sticky="false"` lo apaga. Lo que sea `position: sticky` en una vista debe calcular su `top` con
  `var(--v-layout-top)` más el alto del encabezado (ver el panel de vista previa de `PosThemeEditorView`). Lógica en
  `composable/useStickyHeader.ts`.
- **Teléfono (< 600 px):** se resuelve con clases y props de Vuetify, no con CSS: `App.vue` quita el relleno de su contenedor en móvil
  (`pa-0`, porque cada vista trae el suyo y juntos eran 32 px por lado) y deja sitio al botón del asistente (`pb-16`); los filtros
  llevan `cols="12" sm="…"` (a pantalla completa en el teléfono, para que «Todos los estados» no se corte en «Todo…»); los títulos de
  tarjeta y de diálogo se parten en líneas por defecto (`VCardTitle`/`VCardSubtitle` llevan `text-wrap` en `vuetify.ts`; Vuetify los cortaba con «…») y las filas de acciones usan `flex-wrap` en vez de desbordar. **Diálogos:** mídelos a 375 px (ancho útil ~327 px): un selector de ancho fijo o tres botones en una fila no caben; apila los campos (`flex-column flex-sm-row`) y deja que `v-card-actions` envuelva (`flex-wrap ga-2`). Lo único con CSS propio (`src/styles/mobile.css`) son
  las celdas de las tablas en una línea con scroll horizontal, porque `text-no-wrap` de Vuetify no tiene variante por tamaño y dejaría
  las tablas así también en escritorio. Al añadir una vista, míresela a 375 px.
- Los errores van en un `v-alert` justo debajo del encabezado, no dentro de la
  tarjeta.
- La acción principal va en `#actions`, alineada a la derecha, **sólida**
  (sin `variant`, que ya es `flat` por defecto). No uses `tonal` ahí: el panel
  del `PageHeader` ya es tonal y un botón tonal encima queda lavado.
- El título del `PageHeader` lleva `text-high-emphasis`. Sobre `lightprimary`
  el texto heredaría `on-lightprimary` — el propio azul — y perdería contraste.

### Ajustes con pestañas (arquetipo F)

La configuración vive en **una sola página de nivel superior**: `/settings`
(`AccountSettingsView.vue`). El menú lateral tiene un único ítem «Ajustes», no
los 4 sueltos.

- `AccountSettingsView` pone el `PageHeader` y una tarjeta con `v-tabs` (icono
  + texto, `grow`); cada pestaña monta una de las vistas originales.
- Las vistas que actúan como pestaña aceptan la prop `embedded`:
  omiten su `<v-container>` y su `PageHeader` (los pone la contenedora) y
  usan `<component :is="embedded ? 'div' : 'v-container'">` para el wrapper.
- El cambio de pestaña remonta la vista (`:key`), así cada pestaña vuelve a
  montarse limpia: sin datos stale y deteniendo el polling de emparejamiento al
  salir.
- Deep-links: `/settings?tab=profile|organization|establishments|certificates`.
  Las rutas sueltas `/profile` y `/organization/settings` se conservan para el
  onboarding (`needsOrgSetup` las usa) y muestran la vista sola.
- En modo `embedded`, los accesos redundantes se repliegan: la tarjeta de
  acceso rápido a Establecimientos/Certificado desaparece (ahora son pestañas
  hermanas) y el botón «Subir certificado» pasa al título de su tarjeta.

---

## 4. Escala de espaciado

Se usa la escala de Vuetify (1 = 4px), y sólo estos escalones:

| Uso | Clase |
|---|---|
| Separación dentro de un grupo | `ga-2` / `mb-2` |
| Entre campos de un formulario | `ga-4` / `mb-4` |
| Entre bloques de una página | `mb-6` |
| Relleno interior de un panel | `pa-6` |

Para separar hijos de un contenedor flex usa `ga-*`, no márgenes en cada hijo:
un solo valor en el padre en vez de N valores que se pueden desincronizar.

---

## 5. Tipografía

| Rol | Clase |
|---|---|
| Título de página | `text-headline-small font-weight-bold`; en el teléfono (`xs`), `text-title-large` (lo pone `PageHeader`) |
| Título de tarjeta / sección | `text-title-large` |
| Texto normal | por defecto |
| Texto secundario | `text-body-medium text-medium-emphasis` |
| Anotación | `text-body-small text-medium-emphasis` |

Son las clases de Material Design 3 de Vuetify 4 (decisión del 2026-11-06: se adopta su tipografía tal cual, sin restaurar
tamaños ni pesos de la 3). No se usan `text-display-*` ni `text-headline-large`/`-medium` en vistas de aplicación.

Las clases de la 3 (`text-h1`…`text-h6`, `text-subtitle-*`, `text-body-1`/`-2`, `text-caption`, `text-overline`, `text-button`)
**ya no existen**: un elemento con ellas se pinta sin estilo y sin ningún error. `lint:ui` las rechaza. Equivalencias: `text-h6` →
`text-title-large`, `text-subtitle-1`/`text-body-1` → `text-body-large`, `text-subtitle-2` → `text-title-small`, `text-body-2` →
`text-body-medium`, `text-caption` → `text-body-small`.

Fuente: las clases de tipografía usan `--v-font-body` (o `--v-font-heading`), que no definimos, así que pintan en Roboto, mientras
el resto de la app va en Plus Jakarta Sans (`--v-font-family` en `index.html`). Venía igual de la 3 y se dejó así a propósito.

---

## 6. Layout responsivo

Se usan los breakpoints de Vuetify, nunca media queries propias:

- Variantes responsivas de utilidad: `d-none d-lg-block`, `h-lg-screen`,
  `align-self-lg-stretch`, `pa-lg-6`.
- `v-row` / `v-col` con `cols` + `md` + `lg` para las rejillas.
- Si necesitas el breakpoint en JS: `const { mobile } = useDisplay()`.

Desde Vuetify 4 la rejilla separa las columnas con `gap` (no con márgenes
negativos y relleno, como en la 3). Por eso **no** pongas `ga-*` en un `v-row`:
pisa el `gap` de la rejilla. Para juntar o separar columnas usa `density`
(`compact`, `comfortable`) o la prop `gap` de `v-row`; dentro de una columna,
`ga-*` en un `d-flex` interior.

---

## 7. Antes de dar una vista por terminada

1. ¿Tiene `<style>`? Casi siempre sobra: hay una utilidad o una prop que lo hace.
2. ¿Repite una prop que ya es default? Bórrala.
3. ¿Tiene un color escrito a mano? Conviértelo en token del tema.
4. ¿El título sale de `PageHeader`?
5. `npm run lint:ui` en verde. Incluye `scripts/check-icons.mjs`: todo `mdi-*` escrito en el código debe existir en `@mdi/font`
   (un nombre inventado no da error, solo no se pinta). Una pestaña o botón de la misma fila no debe quedarse sin icono.
6. Míralas en claro **y** en oscuro: usar tokens (`text-medium-emphasis`,
   `bg-surface`) en vez de colores fijos es lo que hace que el modo oscuro
   funcione solo.

---

## 7 bis. Vuetify 4: clases, componentes y trampas

Resumen operativo de la documentación de Vuetify 4.3 (vuetifyjs.com, revisada el 2026-11-06) aplicado a este proyecto. Lo que no
esté aquí, se busca allí antes de inventarlo (§1, «Solo componentes de Vuetify»).

### Tamaños reales: `html { font-size: 15px }`

`index.html` fija la raíz en 15 px, así que todo lo que Vuetify define en `rem` sale al 93,75 %: `text-body-medium` (0,875rem)
mide 13,1 px, no 14. Los tamaños de abajo ya están calculados así. No cambies la raíz sin mirar todas las pantallas.

### Tipografía (Material Design 3)

| Clase | Tamaño · peso | Para |
|---|---|---|
| `text-headline-small` | 22,5 px · 400 | título de página (lo pone `PageHeader`, con `font-weight-bold`) |
| `text-title-large` | 20,6 px · 400 | título de tarjeta o sección |
| `text-title-medium` | 15 px · 500 | subtítulo, nombre destacado en una fila |
| `text-title-small` | 13,1 px · 500 | rótulo de grupo, cabecera de bloque pequeño |
| `text-body-large` | 15 px · 400 | texto de lectura |
| `text-body-medium` | 13,1 px · 400 | texto secundario (con `text-medium-emphasis`) |
| `text-body-small` | 11,3 px · 400 | anotaciones, fechas en filas, ids técnicos |
| `text-label-large` / `-medium` / `-small` | 13,1 / 11,3 / 10,3 px · 500 | etiquetas cortas (chips propios, contadores) |

No se usan `text-display-*` ni `text-headline-large`/`-medium` en vistas. Peso: `font-weight-medium` (500) o `-bold` (700) solo para
resaltar; el MD3 base es 400. Énfasis de color: `text-high-emphasis`, `text-medium-emphasis`, `text-disabled`. Cortar o partir:
`text-truncate`, `text-wrap`, `text-no-wrap`; en un `v-text-field` las clases de tamaño no cambian el texto del campo (va por el
componente, no por la clase del contenedor).

### Espaciado, radios y sombras

- Espaciado: escala de 4 px (`ga-1` = 4 px … `ga-16` = 64 px; igual `pa-*`, `ma-*`, `ms-*`/`me-*` para izquierda/derecha según el
  idioma). En este proyecto solo los escalones de §4.
- Radios: `rounded-sm` 2 px, `rounded`/`-md` 4 px, `rounded-lg` 8 px, `rounded-xl` 24 px, `rounded-pill`, `rounded-circle`. Las
  tarjetas llevan 7 px por `card-surface` (§2); un elemento suelto que deba verse igual usa `rounded-lg`.
- Sombras: 6 niveles (`elevation-0` … `elevation-5`); 1 tarjeta, 2 menú, 3 diálogo y snackbar, 4 lo que se arrastra. Una tarjeta
  clicable puede subir al pasar el ratón con la prop `hover-elevation`; **ojo:** `card-surface` pone la sombra con `!important` fuera de
  capa, así que en `v-card` la de Vuetify no se ve. Para resaltar una tarjeta clicable usa el borde o el fondo, no la sombra.

### Rejilla

`v-row` separa con `gap` (24 px). `density="comfortable"` (16 px) o `density="compact"` (8 px) para juntar; `gap` acepta número o
`[x, y]`. Alineación con clases (`align-center`, `justify-space-between`), no con las props `align`/`justify` de la 3. No pongas
`ga-*` en un `v-row` (§6). Breakpoints: los de la 3 (`display.thresholds` en `vuetify.ts`: md 960, lg 1280, xl 1920).

### Capas CSS

Vuetify va en capas (`vuetify-core`, `vuetify-components`, `vuetify-overrides`, `vuetify-utilities`…). Cualquier CSS propio **sin
capa** les gana siempre, también a las utilidades. Consecuencias: un `<style>` de componente pisa a `pa-4` o `d-none`; y una regla
propia con `!important` sin capa pierde ante un `!important` de Vuetify (en capas, el `!important` se invierte). Los estilos base
propios van en `src/styles/base.css`, dentro de `@layer vuetify-core.reset`.

### Componentes de la 4 que hay que preferir

| Necesito | Componente | En lugar de |
|---|---|---|
| Fila de avatares con «+N» | `v-avatar-group` (`limit`, `border`, `hoverable`) | avatares con `ml-n2` a mano |
| Botón solo de icono | `v-icon-btn` o `v-btn icon`, con `aria-label` y `v-tooltip` si no es universal (REGLAS R-12) | `v-icon` con `@click` |
| Mostrar un atajo de teclado | `v-hotkey keys="cmd+k"` (o `v-kbd` para una tecla) | `v-chip` o `<kbd>` |
| Atender un atajo | composable `useHotkey('cmd+k', fn)` (sintaxis: `+` combina, `/` alternativas, `-` secuencia) | `keydown` a mano |
| Soltar archivos | `v-file-upload` (`density="compact"`, `multiple`) | `<input type="file">` oculto |
| Gráfico pequeño de barras o línea | `v-sparkline type="bar"` | `div` con alturas en `:style` |
| Resaltar lo buscado | `v-highlight :text :query` | `split` + `<mark>` |
| Sin datos | `EmptyState` (envuelve `v-empty-state`) | tarjeta armada a mano |
| Fecha | `DateField` (envuelve `v-date-input`) | `type="date"` |
| Número o importe | `v-number-input` (`:precision`, `:min`, `control-variant`) | `type="number"` |
| Editar en línea con Guardar/Cancelar | `v-confirm-edit` | botones a mano alrededor del campo |
| Lista muy larga | `v-virtual-scroll` | pintar mil filas |
| Botón flotante en el teléfono | `v-fab` (y `v-speed-dial` si son varias acciones) | botón fijo con CSS |
| Avisos | `notify` (usa `v-snackbar-queue`) | `v-snackbar` en la vista |

*Labs* en 4.3 (necesitan decisión del dueño, §1): `v-heatmap`, `v-time-input`, `v-date-range-picker`, `v-mask-input`, `v-split-btn`,
`v-checkbox-group`. Ya aprobados (2026-11-10) y envueltos en `components/ui/`: `v-command-palette` (`CommandPalette`) y `v-pie`
(`PieChart`).

Calendario de un mes con cosas en sus días: `v-calendar` (núcleo) con `type="month"` y la semana desde el lunes
(`:weekdays="[1, 2, 3, 4, 5, 6, 0]"`). Si lo que va en cada día se tiene que arrastrar a otro, se pinta en el hueco `day` con
arrastre nativo, no como eventos de `v-calendar` (sus fichas no se mueven de día). Ejemplo: `ProjectCalendar.vue`.

### Trampas conocidas

- `v-card-actions` pone sus botones en `variant="text"` por encima de los defaults: la acción principal lleva `variant="flat"`
  (§2, `lint:ui` kind `dialogo`).
- Al abrir un `v-dialog`, el foco va a la caja e ignora `autofocus`: para enfocar un botón, `@after-enter` + `ref.$el.focus()`
  (ver `ConfirmDialog.vue`).
- Las clases MD2 (`text-h6`, `text-body-2`, `text-caption`…) ya no existen y no dan error (§5, `lint:ui` kind `tipografia`).
- Un campo (`v-text-field`, `v-textarea`…) mide siempre 16 px: Vuetify 4 lo fija en `.v-field` en px. Para un título editable en
  línea, `class="title-field text-title-large"` (`src/styles/base.css`) hace que el campo herede la clase.
- Un `v-btn` con `icon` y contenido dentro pierde el icono: el contenido lo reemplaza. El tooltip de un botón de icono va por fuera,
  con `<v-tooltip><template #activator="{ props: tip }"><v-btn v-bind="tip" … /></template></v-tooltip>`; si el botón ya abre un
  menú, `v-bind="mergeProps(menu, tip)"`.
- `v-btn variant="outlined"` no se usa (REGLAS-FRONT R-10, `lint:ui` kind `boton`); `v-btn-toggle` sí puede ir con borde.
- El tema por defecto de la 4 es `system`; aquí está fijo en `light` (`vuetify.ts`).
- En un diálogo, Vuetify 4 pone el `v-card-text` a 24 px de los lados pero deja el `v-card-title` suelto a 15 px y el
  `v-card-actions` a 8 px: título, campos y botones quedaban desalineados. `src/styles/base.css` (bloque 4) los pone a los tres a
  24 px del borde. No le pongas `pa-*` al título ni al pie de un diálogo.
- Dos `v-fab app` en la misma esquina no se apilan: se montan uno sobre otro. La esquina inferior derecha es del botón del
  asistente (`App.vue`); un botón flotante de una vista va abajo a la izquierda (`location="bottom start"`, ver `ProjectView.vue`).
- Un `v-card` con `@click` se ve como enlace (`v-card--link`) pero Vuetify no le pone `tabindex`: con el teclado no se llega a él.
  Si la tarjeta abre algo, `tabindex="0"` y `@keydown.enter.self` con la misma acción (REGLAS-FRONT R-90; ver `ProjectBoard.vue`).
- Un `v-menu` (y la lista de un `v-select`/`v-autocomplete`/`v-combobox`, que es un `v-menu` por dentro) usa por defecto
  `scroll-strategy="reposition"`: al hacer scroll se queda dentro de la pantalla aunque su campo ya no se vea, y flota encima de
  otras filas. Aquí el default es `close` (`vuetify.ts`): al hacer scroll, el menú se cierra. No lo sobreescribas en una vista.

### Menú lateral por áreas (2026-11-10)

El menú se define en `src/menus/navigation.ts`: la lista plana de pantallas (`getNavigationItems`, que también usan la búsqueda
global y los tests) y el árbol por áreas (`getNavigationTree`): Inicio, Ventas, Compras y stock, Finanzas, Proyectos, Restaurante y
Administración, esta última al pie y separada. Con 22 pantallas sueltas, el menú colapsado era una columna de iconos indistinguibles.

- **Colapsado** (rail): un icono por área y ningún grupo abierto; el área de la pantalla actual se marca como píldora.
- **Expandido** (al pasar el ratón, o en el teléfono): `v-list-group` en **acordeón**, un área abierta a la vez (con todas
  abiertas el menú volvía a medir lo mismo que antes). Al entrar a una pantalla se abre su área; la que se abra a mano se recuerda
  (`localStorage`, `crm:nav:opened`) hasta cambiar de área.
- **Desplazamiento:** se desplaza solo la parte principal (`flex-grow-1`, `overflow-y-auto` y `min-height: 0`) y Administración queda
  fija al pie. No pongas el scroll en el contenedor de la columna: `v-list` trae `overflow: hidden` y las listas se encogen para
  caber, así que lo último quedaba fuera de la pantalla sin forma de llegar.
- Un área sin pantallas visibles (permisos y módulos activos) no sale; una con una sola se pinta como esa pantalla, sin desplegable.
- Pantalla nueva: entra en la lista plana **y** en un área del árbol. `navigation.test.ts` falla si queda fuera o repetida.
- No repitas el icono de un área en una de sus pantallas (por eso Roles dejó el escudo a Administración).

---

## 8. Tour guiado (driver.js)

El tour de la aplicación vive en `src/composable/useAppTour.ts` y su estilo en
`src/styles/tour.css`.

- **Colores del popover:** nunca escribas un color aquí. driver.js monta el
  popover fuera del `.v-application` de Vuetify, así que no hereda los
  `--v-theme-*`; el composable vuelca los tokens activos del tema a `--tour-*`
  en `:root` y `tour.css` los consume. Funciona igual en claro y en oscuro.
- **Pasos:** cada paso es una ruta y respeta permisos (`auth.can`) y plugins
  activos (`plugins.isActive`), igual que el menú lateral. Si añades un paso,
  réplica ese filtrado y reusa `PageHeader` como ancla (`<main h1>`).
- **Cuánto contar:** el tour explica el para qué de una pantalla, no qué va
  en cada campo. El detalle de un campo va en su `<FieldHelp>`, que se lee al
  pasar el ratón y sigue ahí cuando el tour ya se cerró.
- **Navegación:** entre pasos de rutas distintas el tour empuja la ruta con
  vue-router y reanuda el highlight al montar la vista (ver hooks
  `onNextClick`/`onPrevClick` y la reanudación en `router.afterEach`).
- **Recorrido de un módulo complejo** (2026-11-10): `PLUGIN_TOURS` asocia un
  módulo con su recorrido (hoy `projects.tasks_kanban` → `projects`). Sale solo
  justo después de comprarlo en el carrito (`PluginCartDialog`), la primera vez
  (`shouldAutoStartTour`), y arranca en la pantalla de su primer paso. Se
  relanza desde el menú ⋯ del módulo. Para un módulo nuevo: sus pasos en
  `useAppTour`, sus anclas `data-tour="…"`, sus textos en `tour.<módulo>.*`
  (es/en/fr; una `@` en un texto va como `{'@'}`, o vue-i18n la toma por un
  enlace y el mensaje no compila) y la entrada en `PLUGIN_TOURS`.

---

## 9. Tema del POS (editor y vista previa)

`Ajustes → Apariencia del POS` (`PosThemesView`, `PosThemeEditorView`) deja al
cliente personalizar sus cajas. Las vistas siguen las reglas de siempre
(`PageHeader`, utilidades de Vuetify, tokens); lo único distinto es la **vista
previa**, y por eso vive aislada.

- **Un solo sitio con colores "sueltos":** `components/pos-theme/PosThemePreview.vue`
  (y `PosBrandMark.vue`, que dibuja el logotipo POS KIOSKO). Los colores que pintan
  NO son decisiones de diseño del CRM sino **datos que escribió el cliente**: llegan
  por `:style` desde el estado. Aun así, **no se escribe un hexadecimal a mano**: si
  hace falta un color por defecto, sale de `defaultPosThemeConfig()`
  (`src/types/posTheme.ts`).
- **Por qué no usa `v-card`:** los defaults globales de `vuetify.ts` (radio, sombra)
  son de la app y falsearían la única vista que tiene que ser fiel al 100 % a lo que
  verá la caja. El mock se construye con `div` y estilos en línea.
- **Selector de color:** un `<input type="color">` nativo con su campo hexadecimal al
  lado; el contrato solo acepta `#rrggbb` en minúsculas. Se decidió cuando Vuetify no
  traía selector de color; hoy trae `v-color-picker`, así que está **por revisar**
  (ver §1, «Solo componentes de Vuetify»).
- **Imágenes de marca:** `PosThemeLogoField` reutiliza `ImageUploader`. Los archivos
  cuelgan de la **organización** (`resourceType: pos-theme-brand`, categorías `logo`,
  `logo-dark`, `login-background`), no del tema, porque un tema nuevo aún no tiene id.
- **Contraste:** bajo 3:1 el editor bloquea el guardado (igual que el servidor); entre
  3 y 4,5 solo avisa. La lógica está en `checkContrast` y tiene pruebas.
- **El contrato se copia, no se importa:** `src/types/posTheme.ts` replica
  `organization-service/src/domain/pos-theme.ts`. Si cambia un token, cámbialo en los
  dos sitios; `posTheme.test.ts` avisa si se desincronizan.
- **Defaults = aspecto actual del POS:** el tema "Clásico" reproduce los colores y la
  distribución que la caja tiene hoy (paleta gray/blue de Tailwind). Si se toca, hay
  que tocar también el tema integrado del POS.

## La caja web no usa el sistema de UI del CRM (`/pos`)

La pantalla de caja es **la misma que la de escritorio** (`pos/frontend`) y su aspecto lo decide el **tema de la organización**
(colores, radio, densidad, ancho del carrito, columnas, logo), no `vuetify.ts`. Por eso es la segunda excepción deliberada:

- **No lleva Vuetify**: ni `<PageHeader>` ni `v-card`/`v-btn`. Los defaults globales (radio de 7 px, sombras, color del CRM) la
  falsearían. Se escribe con HTML y clases `pk-*`.
- **Sus estilos viven en `src/styles/pos-kiosk.css`**, no en un `<style>` de la vista (que `lint:ui` prohíbe). Cada clase `pk-*` lleva el
  mismo valor que su equivalente Tailwind de la caja de escritorio (`px-3 py-2` → `calc(var(--u) * 3)`…). Si se cambia algo allí, hay
  que cambiarlo aquí también: la gracia es que se vean igual.
- **Los colores son variables CSS** (`--c-*`, `--r-*`, `--dens`…) que `utils/pos-theme.ts` deriva del tema y `PosView` pone en su raíz
  `.pk` por `:style`. Es el mismo cálculo que `pos/frontend/src/theme/theme.ts`: no se escribe ningún hexadecimal a mano.
- **El tema se pide al CRM** con la sesión de quien vende (`GET /establishments/:e/billing-points/:p/theme`, el mismo que usa la caja de
  escritorio); sin permiso (`organization:read`) o sin red se ve con el tema integrado «Clásico» y sigue funcionando.
- **Ruta con `meta.kiosk`**: ocupa toda la ventana, sin menú, barra superior ni asistente del CRM, y no lanza el recorrido guiado.

## El editor del plano del restaurante (`/restaurant/plan`)

Es una excepción acotada: el lienzo es **SVG** hecho a mano (`components/restaurant/floorplan/`), porque un plano con medidas reales,
imán a 10 cm y deshacer no se resuelve con componentes de Vuetify. El resto de la pantalla (`PageHeader`, pestañas, inspector, diálogos)
sí sigue el sistema.

- **Colores: tokens del tema por CSS variables**, nunca hexadecimales. Las variables de Vuetify son `R,G,B` separadas por **comas**, así que la
  transparencia se escribe `rgba(var(--v-theme-x), 0.16)`. La forma moderna `rgb(var(--v-theme-x) / 0.16)` mezcla comas y barra, es **inválida**
  y el navegador pinta el relleno de negro (paredes y zonas salieron negras así). Usa `token(color, alpha)` de `FloorPlanShapes.vue`.
- **Un `v-alert` no va directo dentro de una columna flex** (`d-flex flex-column`): trae `flex: 1 1 0%`, así que se encoge a 0 o se estira a
  todo el alto. Envuélvelo en un `<div>`.
- **Unidades:** centímetros enteros en el estado y en la API; el metro solo se ve en la interfaz (`utils/restaurant-plan.ts`).
- **Borrador en el navegador** (`localStorage`, por usuario y organización) y guardado atómico con `expectedVersion` (409 si otra persona guardó).

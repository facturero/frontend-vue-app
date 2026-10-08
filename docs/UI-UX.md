# Sistema de UI / UX

Regla de oro: **el estilo se define una vez, en un sitio, y las vistas sólo
describen contenido y comportamiento.** Si una vista necesita decidir cómo se ve
algo, es que falta una decisión aquí.

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

---

## 2. Los defaults son la fuente de verdad

`src/plugins/vuetify.ts` ya fija esto para toda la app:

```
VCard          elevation 0 + clase card-surface (radio 7px, sombra suave)
VBtn           variant flat, rounded lg, sin MAYÚSCULAS (text-none)
campos*        variant outlined, density compact, hide-details auto
VAlert         variant tonal, density compact, rounded lg
VChip          variant tonal
VCheckbox      color primary, density compact
VDialog        max-width 480
VDataTable     hover
```

\* `v-text-field`, `v-textarea`, `v-select`, `v-autocomplete`, `v-combobox`, `v-file-input`

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

- El contenedor raíz es `<v-container>`. `fluid` sólo si el contenido es una
  tabla ancha que realmente lo necesita.
- El título lo pone **siempre** `PageHeader`, nunca un `<h1>`/`<h2>` suelto.
  Así el nivel de encabezado y el margen inferior son idénticos en todas partes.
- **El encabezado es fijo en todas las pantallas** (`PageHeader`, por defecto): se queda bajo la barra superior al hacer scroll para que
  sus acciones (el carrito de módulos, «Crear rol», etc.) no desaparezcan. Arriba del todo es el panel de siempre; al bajar crece de
  forma gradual, atada al scroll, hasta el 100 % del ancho útil, pierde las esquinas y se compacta (menos relleno), sin sombra. Su
  hueco en la página no cambia: lo que pierde de alto se lo suma al margen inferior (si no, el contenido se movería mientras se hace
  scroll). No se fija dentro de tarjetas ni diálogos (las secciones embebidas de Ajustes), ni si en reposo mide más de 112 px (móvil,
  con las acciones en otra fila). `:sticky="false"` lo apaga. Lo que sea `position: sticky` en una vista debe calcular su `top` con
  `var(--v-layout-top)` más el alto del encabezado (ver el panel de vista previa de `PosThemeEditorView`). Lógica en
  `composable/useStickyHeader.ts`.
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
| Título de página | `text-h5 font-weight-bold` (lo pone `PageHeader`) |
| Título de tarjeta / sección | `text-h6` |
| Texto normal | por defecto |
| Texto secundario | `text-body-2 text-medium-emphasis` |
| Anotación | `text-caption text-medium-emphasis` |

No se usan `text-h1`…`text-h4` en vistas de aplicación.

---

## 6. Layout responsivo

Se usan los breakpoints de Vuetify, nunca media queries propias:

- Variantes responsivas de utilidad: `d-none d-lg-block`, `h-lg-screen`,
  `align-self-lg-stretch`, `pa-lg-6`.
- `v-row` / `v-col` con `cols` + `md` + `lg` para las rejillas.
- Si necesitas el breakpoint en JS: `const { mobile } = useDisplay()`.

Cuidado: en un `v-row` con `no-gutters`, **no** añadas `ga-*`. El gap se suma al
ancho de las columnas y provoca que se envuelvan. Usa los gutters de `v-row` o
márgenes en un `v-sheet` interior.

---

## 7. Antes de dar una vista por terminada

1. ¿Tiene `<style>`? Casi siempre sobra: hay una utilidad o una prop que lo hace.
2. ¿Repite una prop que ya es default? Bórrala.
3. ¿Tiene un color escrito a mano? Conviértelo en token del tema.
4. ¿El título sale de `PageHeader`?
5. `npm run lint:ui` en verde.
6. Míralas en claro **y** en oscuro: usar tokens (`text-medium-emphasis`,
   `bg-surface`) en vez de colores fijos es lo que hace que el modo oscuro
   funcione solo.

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
- **Selector de color:** un `<input type="color">` nativo (Vuetify no trae uno) con su
  campo hexadecimal al lado; el contrato solo acepta `#rrggbb` en minúsculas.
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

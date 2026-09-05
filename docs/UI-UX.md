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

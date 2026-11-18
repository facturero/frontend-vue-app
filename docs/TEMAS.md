# Temas

Escrito el 2026-11-18 como análisis; construido el mismo día. Estado: **hecho en local, sin subir**. Falta el recorrido del modo
oscuro por todas las pantallas (ver «Lo que hay que arreglar antes de ofrecer el oscuro»).

## Decisiones del dueño (2026-11-18)

1. Vive en **organization-service**, junto a los temas del POS. No hay microservicio nuevo.
2. **Gratis** para todos: no es un módulo del catálogo (ni plugin, ni widget, ni precio).
3. **Todos pueden cambiar de tema; no todos pueden crearlo.** Crean temas y deciden el de la empresa quienes tienen
   `organization:admin` (no hay permiso nuevo).
4. **Se puede fijar.** Los administradores fijan el tema de la empresa para el resto; ellos siguen pudiendo elegir.

## Lo construido

- **organization-service:** tablas `app_themes`, `organization_theme_settings` y `user_theme_choices` (migración
  `20261118100000-create-app-themes.js`).
  - Rutas `GET /organizations/me/themes` (temas + ajustes + mi elección, sin permiso), `POST`/`PUT /:id`/`DELETE /:id`
    (`organization:admin`), `PUT /organizations/me/theme-settings` (`organization:admin`) y `PUT /organizations/me/theme-choice`
    (sin permiso; 409 `THEME_ENFORCED` si está fijado y no eres administrador).
  - Eventos `organization.app_theme.created/updated/deleted` y `organization.theme_settings.updated`, con etiqueta en la bitácora.
    Elegir tu tema no publica nada.
  - La elección de cada usuario vive aquí y no en auth-service (cambio respecto al análisis): una sola petición devuelve todo y la
    regla del fijado se aplica junto al dato. Así auth-service no se toca.
- **api-gateway-node:** el hub enlaza `organization.app_theme.#` y `organization.theme_settings.#` y avisa `app_theme.changed` a
  la sala de la organización: si un administrador fija un tema, el resto lo ve sin recargar.
- **frontend:** «Tema» en el menú del avatar abre un diálogo con un cuadro por tema, como en Slack: miniatura con sus colores y
  el nombre (`ThemeSwitcher.vue` + `components/themes/ThemeTile.vue`). «El de la empresa» solo aparece si la empresa tiene un tema
  propio como tema de la empresa; si nunca creó uno, sería un «Claro» repetido (decisión del dueño, 2026-11-18). También `Ajustes → Temas` (`AppThemesView.vue`) con el editor
  (`AppThemeEditorDialog.vue`), y el store `stores/appTheme.ts` (ver UI-UX.md §9 bis).

- **Temas predefinidos (2026-11-18):** 8 temas que ve toda empresa, como los de Slack: Océano, Bosque, Atardecer, Lavanda y
  Cereza (claros), Medianoche, Grafito y Esmeralda (oscuros). Referencia `preset:<id>`; los colores viven solo en el frontend
  (`PRESET_THEMES` en `types/appTheme.ts`) y organization-service solo conoce los nombres para validar (`BUILTIN_THEME_REFS`). Un
  predefinido nuevo va en las dos listas y en `themes.preset.*` de i18n; `appTheme.test.ts` comprueba contraste, nombres e i18n.

**Orden de despliegue:** organization-service (migración) → api-gateway-node → frontend.

---

El resto es el análisis original, con lo que se decidió marcado arriba.

## Qué pidió el dueño

Un apartado «Temas» que reúna:

1. tema **claro** y **oscuro**;
2. que el **cliente** (la empresa) pueda **crear su propio tema**;
3. y **aplicarlo**.

## Lo que ya hay (2026-11-18)

- **Tema del CRM:** dos temas fijos en `src/plugins/vuetify.ts` (`light` y `dark`), cada uno con ~52 colores. El oscuro está
  completo, pero el interruptor que lo activaba **no guardaba nada**: al recargar se volvía a claro. Nadie lo usaba en serio y
  nunca se revisaron todas las pantallas en oscuro.
- **Temas del POS** (`Ajustes → Apariencia del POS`): el patrón completo ya existe, para la caja.
  - organization-service guarda temas por organización (CRUD, uno por defecto, asignación por punto de emisión) y publica un
    evento.
  - El gateway lo reenvía en vivo a las cajas abiertas (`pos-theme-routing.ts`).
  - El contrato es **solo datos**: 10 colores por modo, listas cerradas, tope de 8 KB y validación de contraste WCAG en el servidor
    y en el editor.
  - El frontend tiene editor, vista previa y pruebas (`types/posTheme.ts`, `utils/pos-theme.ts`).
- **Preferencias por usuario guardadas en el servidor:** auth-service ya guarda el tablero de Inicio por usuario y organización
  (`user_dashboards`). Es el mismo tipo de dato que «qué tema uso yo».

El tema del CRM no tiene que inventar nada: es el del POS con menos campos y aplicado a Vuetify.

## Propuesta

### Qué ve cada quien

- **Cualquier usuario**, en el menú de su avatar → «Tema»: elige entre **Claro**, **Oscuro**, **Como el sistema** (sigue al
  sistema operativo) y los **temas de su empresa**. La elección es suya, se guarda en el servidor y le sigue en cualquier equipo.
- **El administrador de la empresa**, en `Ajustes → Temas`:
  - crea, edita, duplica y borra temas;
  - marca uno como **tema de la empresa** (el que ve quien nunca eligió);
  - opcionalmente lo **fija para todos** (así el personal no lo cambia; útil en mostradores o pantallas compartidas).
- **Sin empresa todavía** (inicio de sesión, alta, invitación): el tema claro de siempre. Antes del inicio de sesión no se sabe de
  qué empresa es la persona.

### Qué se puede personalizar (contrato v1)

Solo datos, nunca CSS, igual que en el POS.

- **Base:** claro u oscuro. Decide de qué tema integrado se parte y si Vuetify lo trata como oscuro.
- **Colores que escribe el cliente (8):** `primary`, `secondary`, `background`, `surface`, `text`, `success`, `warning`, `error`.
  `info` sale del primario.
- **Colores que se derivan** (el cliente no los ve): los tonales `light*`, `primary-darken-1`, los `on-*` (blanco o negro según el
  contraste), `borderColor`, `inputBorder` y `hoverColor`. Se calculan en el cliente desde los 8 y la base, igual que el POS deriva
  sus variantes. Así un tema no se puede «romper» dejando un token suelto sin tocar.
- **Opcional en v1, recomendado para v2:**
  - tipografía de una lista cerrada (las mismas fuentes que el POS);
  - radio de las tarjetas (`none` a `xl`);
  - logo de la empresa en la marca del menú lateral.
- **Validación:** contraste mínimo 3:1 de texto sobre fondo y sobre superficie, y del `on-primary` sobre `primary`. El servidor
  rechaza por debajo; entre 3 y 4,5 el editor solo avisa. Mismas reglas que `checkContrast` del POS, reutilizadas.
- **Tope:** 4 KB por tema y 20 temas por empresa.

### Dónde vive el dato

- **Recomendación: en organization-service, junto a los temas del POS. No un microservicio nuevo.** Un servicio aparte costaría
  repo, CI, base de datos, k8s, secretos, entrada en el gateway y orden de despliegue, todo por ~6 rutas sobre un dato que es de
  la organización (como su logo y los temas del POS). Si «servicio» se entiende como **módulo del catálogo** (algo que se activa y
  se cobra), eso sí: el módulo se llama «Temas» aunque el código viva en organization-service.
- **Tabla nueva** `organization_themes (id, organization_id, name, config JSON, is_default, enforced, created_by, timestamps)`.
  `enforced` (fijado para todos) solo puede estar en el tema por defecto. Se mantiene aparte de `pos_themes` porque son contratos
  distintos: el del POS lleva distribución de caja, carrito y catálogo.
- **Rutas:**
  - `GET /organizations/me/themes`, para cualquier miembro: todos necesitan leerlos para aplicarlos.
  - `POST`, `PUT /:id`, `DELETE /:id` y `POST /:id/make-default`, con `organization:admin`, como los del POS. Si se quiere un rol
    «diseñador» aparte, permiso nuevo `theme:manage`.
- **Evento** `organization.theme.updated` (también al borrar y al cambiar el de por defecto). El hub del gateway lo manda a la sala
  de la organización y las sesiones abiertas se repintan sin recargar, igual que las cajas. Necesita su etiqueta de auditoría en
  i18n y su entrada en `asyncapi.yaml`.
- **La elección de cada usuario** va en auth-service, por usuario y organización (mismo patrón que `user_dashboards`):
  `GET`/`PUT /users/me/preferences` con `{ theme: 'light' | 'dark' | 'system' | 'org:<id>' }`. Es una tabla de preferencias
  genérica para no abrir una tabla por cada ajuste futuro.

### Cómo se aplica en el navegador

- Vuetify 4 permite registrar temas en caliente: `theme.themes.value['org-<id>'] = { dark, colors }` y luego `theme.change(...)`.
  Un composable `useAppTheme` hace esto en un solo sitio:
  1. lee la preferencia y los temas de la empresa;
  2. resuelve el que toca (el fijado para todos gana, luego la elección del usuario, luego el de la empresa, luego claro);
  3. deriva los tokens y lo activa.
- **Sin destello:** el último tema resuelto se guarda en `localStorage`, como hace la caja web, y se aplica antes de montar la app.
  Luego se confirma con el servidor.
- **«Como el sistema»:** escucha `prefers-color-scheme` y cambia en vivo.
- **Vista previa real:** en el editor, «Probar» aplica el tema a toda la aplicación de forma temporal, con una barra «Probando
  tema X · Guardar · Volver». Es más fiel que un mock y no hay que mantener una segunda maqueta como la del POS.
- **Cambio de empresa** (quien está en varias): se recalcula con los temas de la nueva.

### Lo que hay que arreglar antes de ofrecer el oscuro

El oscuro nunca se probó entero. Antes de soltarlo:

- **Recorrido en oscuro de todas las pantallas** con Playwright (capturas por ruta) y corrección de lo que se vea mal.
- Sospechosos ya vistos:
  - colores fijos en `ImageUploader`, `ProductDetailView`, `AssistantPanel`, `ProjectTimeline` y `ProfileView`;
  - gráficos y cronograma (R-97 de REGLAS-FRONT);
  - el editor de texto;
  - los correos no aplican: no siguen el tema.
- **Regla nueva para `lint:ui`:** nada de `bg-white`, `color="white"` ni `grey-lighten-*` en vistas. Se usan `surface` o
  `background`, que sí cambian con el tema.
- **Lo que NO sigue el tema, a propósito:**
  - la caja (`/pos`): tiene sus propios temas;
  - la vista previa del tema del POS;
  - la página pública de reservas.

### Relación con los temas del POS

Siguen separados (contratos distintos), pero comparten:

- las utilidades de color y contraste (se extraen a `utils/color.ts` y las usan los dos editores);
- el selector de color: es buen momento para pasar los dos a `v-color-picker` (pendiente en UI-UX.md §9).

Más adelante, un botón en el editor del POS: «Usar los colores del tema de la empresa».

### Catálogo y reglas del proyecto

- **Claro, Oscuro y Como el sistema** son **núcleo y gratis**: el oscuro ya existía para todos y quitarlo detrás de un pago se
  sentiría como un recorte.
- **Temas propios** son el **módulo «Temas»** del catálogo. Precio por decidir: es un módulo de marca, barato de mantener.
- **Regla de widgets** (`check-widgets.mjs`): «Temas» no tiene datos que mostrar en Inicio, así que va a `EXEMPT` con su razón.
- **Permisos:** si se crea `theme:manage`, primero se añade en las migraciones de auth-service y luego se corre
  `check-permissions.mjs`.

## Fases

| Fase | Qué | Repos | Tamaño |
|---|---|---|---|
| T1 | Claro / Oscuro / Como el sistema por usuario, guardado en el servidor; recorrido y arreglo del oscuro; regla nueva de `lint:ui` | auth-service, frontend | medio (casi todo es el recorrido del oscuro) |
| T2 | Temas de la empresa: tabla, rutas, evento en vivo, editor con «Probar», tema por defecto y fijado para todos; módulo en el catálogo | organization-service, api-gateway-node, plugin-catalog-service, frontend | medio-grande |
| T3 | Tipografía, radio, logo en el menú, «usar en el POS», `v-color-picker` en los dos editores | organization-service, frontend | pequeño-medio |

**Orden de despliegue (T2):** organization-service, luego plugin-catalog-service, luego api-gateway-node (hub), luego frontend.
En T1, auth-service antes que el frontend.

## Decisiones abiertas (del dueño)

1. ¿Un microservicio nuevo `themes-service` o dentro de organization-service? Recomendado: organization-service.
2. ¿Los temas propios se cobran (módulo del catálogo) o son gratis para todos?
3. ¿Quién crea temas: solo el administrador de la empresa, o también cada usuario para sí mismo? Recomendado: solo el
   administrador; los usuarios eligen.
4. ¿Se permite fijar un tema para toda la empresa (sin que el personal lo cambie)?

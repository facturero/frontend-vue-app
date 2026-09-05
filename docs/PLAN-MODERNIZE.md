# Plan de rediseño visual — referencia Modernize

Plan para alinear el CRM con la plantilla [Modernize Vue3](https://modernize-vuejs.adminmart.com/).
Elaborado el 2026-09-04 sobre inventario real del código.

---

## Premisa

**Tu stack es idéntico al de la plantilla**: Vue 3.5 + Vuetify 3.7 + Pinia + vue-router + Vite. No hay reescritura; es cambiar tokens y contenedores.

Y hay un segundo hecho que reduce el trabajo mucho más de lo que parece: gracias a `docs/UI-UX.md`, los `defaults` de `vuetify.ts` y el componente `PageHeader`, **la mayoría de las 22 vistas no se tocan**. Heredan el cambio.

> **Regla que manda sobre este plan:** `docs/UI-UX.md` sigue siendo la fuente de verdad. Si algo de Modernize choca con ella, gana `UI-UX.md` — o se cambia el default, nunca la vista. Todo cambio debe pasar `npm run lint:ui`.

### Inventario medido

| | |
|---|---|
| Vistas | 22 |
| Componentes | 14 |
| Layouts | 2 |
| Ficheros con `<style>` propio | **3** |
| Iconos `mdi-` distintos | 73 (130 usos en 31 ficheros) |

---

## Tokens de Modernize (extraídos del bundle)

```
FUENTE     Plus Jakarta Sans (400/500/600/700)
ICONOS     Tabler Icons
RADIO      7px en tarjetas
SOMBRA     0 0 2px #919eab4d, 0 12px 24px -4px #919eab1f

primary   #5D87FF    lightprimary   #ECF2FF    textPrimary   #2A3547
secondary #49BEFF    lightsecondary #E8F7FF    textSecondary #7C8FAC
success   #13DEB9    lightsuccess   #E6FFFA    borderColor   #e5eaef
info      #539BFF    lightinfo      #EBF3FE    inputBorder   #DFE5EF
warning   #FFAE1F    lightwarning   #FEF5E5    hoverColor    #f6f9fc
error     #FA896B    lighterror     #FDEDE8    grey100/200   #F2F6FA / #EAEFF4
```

Lo que más cambia la percepción no son los colores base, sino la familia **`light*`**: fondos tonales suaves para chips, alertas y badges. Hoy no existen en tu tema.

---

## FASE 0 — Tokens globales

**Un solo fichero. Cambia el aspecto de toda la app. Revertible con `git checkout`.**

### 0.1 `src/plugins/vuetify.ts` — paleta

| Token | Actual | Nuevo |
|---|---|---|
| `primary` | `#078DEE` | `#5D87FF` |
| `secondary` | `#6D788D` | `#49BEFF` |
| `success` | `#02CA4B` | `#13DEB9` |
| `info` | `#06B6D4` | `#539BFF` |
| `warning` | `#EAB308` | `#FFAE1F` |
| `error` | `#FB4141` | `#FA896B` |
| `background` | `#F8FAFC` | `#F2F6FA` (grey100) |
| `on-background`/`on-surface` | `#3F404D` | `#2A3547` |

**Añadir** (no existen hoy): `lightprimary`, `lightsecondary`, `lightsuccess`, `lightinfo`, `lightwarning`, `lighterror`, `borderColor`, `inputBorder`, `hoverColor`, `grey100`, `grey200`.

Conservar tal cual: `auth-panel`, `skin-bordered-*` — son tuyos y no estorban.

### 0.2 Tipografía

`index.html`:
```html
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" />
```

En SCSS global: `$body-font-family: 'Plus Jakarta Sans', sans-serif;`

> Considera **autoalojar la fuente**. Cargarla desde Google Fonts añade una dependencia externa a un CRM que sirves por túnel propio, y es un dato que sale a un tercero en cada carga.

### 0.3 Defaults de componente

| Componente | Actual | Nuevo | Motivo |
|---|---|---|---|
| `VCard` | `elevation 2, rounded lg` | `elevation 0` + sombra Modernize + radio 7px | Es *la* firma visual de la plantilla |
| `VBtn` | `flat, rounded lg, text-none` | *(sin cambio)* | Ya coincide |
| campos | `outlined, compact` | *(sin cambio)* | Ya coincide |
| `VChip` | `variant tonal` | *(sin cambio)* | Los `light*` lo mejoran solos |

El radio de 7px no es un valor estándar de Vuetify: se define como clase de utilidad o variable SCSS, no como `rounded="lg"`.

**Verificación de fase:** `npm run lint:ui` en verde · revisar 3 pantallas en claro y oscuro.

---

## Patrones visuales observados

Capturados con Playwright sobre la demo real (`scripts/mz-capture.mjs`, imágenes en `.mz-ref/`). Esto ya **no es inferencia**.

### Cabecera de página — el patrón más repetido
Una tarjeta ancha con fondo **`lightprimary` (#ECF2FF)**, radio 7px, que contiene:
- Título en negrita (~28px, bastante mayor que tu `text-h5`)
- Migas de pan debajo: `Dashboard • Sección`, la actual en gris
- Una ilustración decorativa a la derecha

Aparece **idéntica en todas las páginas internas**. Es el cambio de mayor retorno: se hace una vez en `PageHeader.vue` y se propaga a las 22 vistas.

### Menú lateral
- Fondo blanco, sin borde derecho
- Rótulos de sección en gris, mayúsculas pequeñas (`HOME`, `APPS`)
- **Ítem activo: píldora sólida `primary` con texto blanco**, radio ~8px (no el resaltado tenue de Vuetify)
- Iconos de línea fina, tamaño uniforme
- Abajo: tarjeta de usuario con avatar, nombre, rol y botón de salir, sobre fondo `lightprimary`

### Barra superior
Blanca, sin sombra. Izquierda: hamburguesa, buscador, accesos directos. Derecha: modo oscuro, idioma, carrito, notificaciones, avatar. Iconos sueltos, sin fondo.

### Tarjetas de métrica (dashboard)
Fila de tarjetas **sin sombra**, cada una con fondo pastel distinto de la familia `light*`, icono ilustrado arriba, rótulo del color base y cifra grande. Es la firma visual del dashboard.

### Tarjetas de contenido
Blancas, radio 7px, borde muy tenue, sombra apenas perceptible. Título dentro, separado por divisor.

### Tablas
- Barra superior con fondo `lightprimary`: título a la izquierda, botón primario a la derecha
- Cabeceras sin fondo, texto gris, flecha de orden
- Filas altas (~52px) con divisor inferior fino
- Acciones: iconos lápiz (primary) y papelera (error), sin botón contenedor

### Pestañas
Sobre tarjeta blanca, icono + rótulo, subrayado inferior en `primary` para la activa.

### ⚠️ Divergencia con tu sistema: densidad de formularios
Modernize usa **etiqueta encima del campo** y densidad normal, con mucho aire.
Tu `UI-UX.md` fija `density: compact` para todos los campos.

Son dos criterios legítimos y **opuestos**. Hay que elegir:
- **Mantener `compact`** — más datos en pantalla, coherente con lo ya escrito (recomendado para un CRM de uso intensivo)
- **Adoptar el aire de Modernize** — más limpio, pero obliga a revisar formularios largos como `InvoiceFormView`

---

## FASE 1 — El armazón (mayor impacto visual)

Aquí está la diferencia real entre "un Vuetify genérico" y "parece Modernize".

### `src/layouts/AppNavigationDrawer.vue`
**Referencia:** `FullLayout` + `MobileSidebar` · ⚠️ tiene `<style>` propio — revisar si sobra

- Ítems con radio 7px y fondo `lightprimary` al estar activos (hoy: resaltado por defecto de Vuetify)
- Rótulos de sección en mayúsculas pequeñas entre grupos
- Ancho ~270px, sin borde derecho: se separa por color de fondo, no por línea
- Modernize agrupa el menú por secciones; tu `navigation.ts` es una lista plana de 11 ítems

### `src/layouts/AppTopBar.vue`
**Referencia:** header de `FullLayout`

- Fondo `containerBg`, sin elevación, borde inferior muy tenue
- Iconos de acción como botones circulares con fondo tonal
- Avatar con menú desplegable (perfil, ajustes, salir)

### `src/menus/navigation.ts`
- **Decisión pendiente:** ¿agrupamos los 11 ítems en secciones (Núcleo / Ventas / Organización) como Modernize, o mantenemos la lista plana?
- Si se pasa a Tabler, aquí hay 11 iconos que cambian
- Respetar `permission`, `plugin` y `soon` — son lógica, no estilo

---

## FASE 2 — Componentes compartidos (14)

| Componente | Referencia Modernize | Trabajo |
|---|---|---|
| `ui/PageHeader.vue` | `BaseBreadcrumb` | **Alto valor.** Modernize usa una cabecera con migas y fondo tonal. Cambiarlo aquí reordena las 22 vistas de golpe |
| `NotificationBell.vue` | header notifications | Menú con lista de avatares + texto secundario |
| `MessageInbox.vue` | `Email` / header messages | Ítems con avatar, título y extracto |
| `LocaleSwitcher.vue` | selector de idioma | Menú con banderas |
| `RoleBadge.vue` | `UiChip` | Aplicar colores `light*` — ganancia directa |
| `RoleSelect.vue` | `Select` | Ya hereda de defaults; sin cambios |
| `PermissionSelector.vue` | `Selectable` / `Treeview` | Revisar densidad |
| `InviteEmployeeDialog.vue` | `UiDialog` | Hereda; verificar radio |
| `RestorePasswordDialog.vue` | `UiDialog` | Hereda; verificar radio |
| `GoogleSignIn.vue` | botones sociales de auth | Alinear con el botón de la plantilla |
| `ImageUploader.vue` | `FileInputs` | ⚠️ tiene `<style>` — revisar si sobra |
| `plugins/MyPluginsTab.vue` | `UiTabs` + cards | Rejilla de tarjetas |
| `plugins/PluginCatalogTab.vue` | `eCommerce` (listado) | Tarjetas con imagen y precio |
| `plugins/CustomRequestsTab.vue` | `tickets` | Lista con chips de estado |

---

## FASE 3 — Vistas (22)

Agrupadas por arquetipo: **lo que se decide en un arquetipo vale para todas sus vistas**.

### Arquetipo A — Autenticación (3)
**Referencia:** `SideLogin` / `BoxedLogin` — panel lateral con ilustración, formulario centrado

| Vista | Trabajo |
|---|---|
| `AuthView.vue` | Layout de dos columnas. Ya tienes el token `auth-panel`, que encaja |
| `ResetPasswordView.vue` | Mismo contenedor |
| `AcceptInviteView.vue` | Mismo contenedor |

### Arquetipo B — Dashboard (1)
**Referencia:** `Modern` dashboard (`TopCards`, `WelcomeCard`, `WeeklyStats`, `YearlySales`)

| Vista | Trabajo |
|---|---|
| `HomeView.vue` | **La de más trabajo y más impacto.** Fila de tarjetas de métrica con fondo `light*` + icono, tarjeta de bienvenida, gráficos ApexCharts. Requiere decidir qué métricas mostrar — es diseño de producto, no solo estilo |

### Arquetipo C — Listados (5)
**Referencia:** `CrudTable` / `dataTable`

| Vista |
|---|
| `CustomersListView.vue` |
| `EmployeesListView.vue` |
| `InvoiceListView.vue` |
| `ProductsListView.vue` |
| `RolesListView.vue` |

Se resuelve **una vez** en el default de `VDataTable` + `PageHeader`: cabecera sin fondo gris, filas más altas, chips de estado tonales, acciones como botones icono al pasar el ratón. **Las 5 vistas heredan sin tocarse.**

### Arquetipo D — Detalle (4)
**Referencia:** `Detail` / `BlogDetails`

| Vista |
|---|
| `CustomerDetailView.vue` |
| `EmployeeDetailView.vue` |
| `InvoiceDetailView.vue` |
| `ProductDetailView.vue` |

Tarjeta de cabecera con avatar/imagen + datos clave, y tarjetas secundarias debajo. Cambio principal: sombra y radio, que vienen de Fase 0.

### Arquetipo E — Formularios (5)
**Referencia:** `FormLayouts` / `FormVertical`

| Vista | Nota |
|---|---|
| `CustomerFormView.vue` | |
| `ProductFormView.vue` | |
| `RoleCreateView.vue` | |
| `RoleEditView.vue` | |
| `InvoiceFormView.vue` | ⚠️ **tiene `<style>` propio** — el único de las vistas. Revisar antes |

Tus campos ya son `outlined` + `compact`, igual que la plantilla. **Cambio casi nulo.**

### Arquetipo F — Ajustes con pestañas (4) ✅
**Referencia:** `AccountSettings` (tabs con iconos)

| Vista | Trabajo |
|---|---|
| `settings/AccountSettingsView.vue` | **Nueva** página única de Ajustes |
| `ProfileView.vue` | Pestaña «Mi perfil» (modo `embedded`) |
| `organization/OrganizationSettingsView.vue` | Pestaña «Configuración de la organización» (modo `embedded`; escondidas las tarjetas de acceso rápido a Establecimientos/Certificado) |
| `organization/EstablishmentsView.vue` | Pestaña «Establecimientos» (modo `embedded`) |
| `organization/CertificatesView.vue` | Pestaña «Certificado electrónico» (modo `embedded`; botón de subida en el título de la tarjeta) |

**Decisión de IA aplicada:** un solo ítem del menú («Ajustes», `/settings`) abre
la vista de pestañas con icono dentro de una tarjeta. Las rutas sueltas
`/profile` y `/organization/settings` **se conservan** porque el onboarding
(`needsOrgSetup`) redirige a ellas; `?tab=` profundiza en una pestaña desde
cualquier enlace. Cada pestaña es una de las vistas originales con la prop
`embedded` (sin container ni `PageHeader` propios). El cambio de pestaña
remonta la vista (clave `:key`): sin datos stale y deteniendo el polling de
emparejamiento al salir.

### Arquetipo G — Pestañas de aplicación (1)

| Vista | Referencia |
|---|---|
| `plugins/PluginsView.vue` | `UiTabs` + rejilla de tarjetas (ver Fase 2) |

---

## Decisión abierta: iconos

**Coste medido: 73 iconos distintos, 130 usos, 31 ficheros.**

| Opción | Pros | Contras |
|---|---|---|
| **A. Quedarse en MDI** | Coste cero | Se nota: Tabler es más fino y es parte del carácter de la plantilla |
| **B. Migrar a Tabler** | Fidelidad visual | 130 sustituciones manuales; no hay mapeo automático fiable |
| **C. Híbrido** | Tabler en armazón (menú + topbar, ~20 iconos), MDI en el resto | Dos sets cargados; mezcla visible si se mira de cerca |

**Recomendación: A ahora, C si tras la Fase 1 se nota la diferencia.** Es reversible y no bloquea nada.

---

## Orden de ejecución y verificación

| Fase | Alcance | Riesgo | Verificación |
|---|---|---|---|
| **0** Tokens | 2 ficheros | Bajo — revertible | `lint:ui`, revisar claro/oscuro |
| **1** Armazón | 3 ficheros | Medio — es la navegación | Probar en móvil y escritorio |
| **2** Componentes | 14 ficheros | Bajo | `test:e2e` |
| **3** Vistas | ~6 reales | Bajo | `test:e2e` + revisión visual |

Tras cada fase: `npm run lint:ui` y `npm run test:e2e`.

---

## Lo que este plan no cubre

Sé honesto sobre los límites de esta investigación:

1. **Cobertura visual parcial.** Con Playwright se descubrieron las **105 rutas** de la plantilla y se capturaron 8 páginas de referencia (dashboard, tabla CRUD, formulario, ajustes con pestañas, factura, detalle de factura, perfil, chips). Los patrones de las secciones anteriores están **verificados sobre captura real**. Las 97 rutas restantes no se han mirado; para cualquier pantalla nueva, captúrala antes de decidir:
   ```
   cd frontend
   MSYS_NO_PATHCONV=1 node scripts/mz-capture.mjs shoot /ruta/deseada
   ```
   (En Git Bash, `MSYS_NO_PATHCONV=1` es obligatorio o convierte `/ruta` en una ruta de Windows.)

2. **`HomeView` es diseño de producto, no estilo.** Decidir qué métricas muestra el dashboard requiere tu criterio de negocio.

3. **Licencia.** Modernize es una plantilla comercial de AdminMart. Reproducir su *look* con tus propios componentes Vuetify es legítimo; copiar su código fuente sin licencia no lo es. Este plan asume lo primero.

4. **Los `<style>` de los 3 ficheros** hay que revisarlos antes de tocarlos: según tu propia checklist de `UI-UX.md`, "casi siempre sobra".

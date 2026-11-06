# Revisión del front de Proyectos contra `REGLAS-FRONT.md`

Estado al 2026-11-06, revisado sobre el código (`components/projects/`, `views/projects/`). Falta la pasada con capturas
(375 / 1366 px, claro y oscuro): el entorno local estaba apagado. Cada punto cita la regla que incumple; se tacha al corregirlo.

## Lo que ya cumple

- Encabezado con `PageHeader` en todas las vistas, vista activa y tarea abierta en la URL (`?view=`, `?task=`) — R-71, R-23.
- Borrados con diálogo propio (proyecto, tarea, campo, lote), no `window.confirm` — R-22.
- Todo el texto por i18n en tres lenguas, con plurales — R-80, R-81.
- Colores del cronograma, calendario y editor con variables del tema — R-97.
- Lo que el rol no permite se oculta (`canEdit`, `canManage`) y el chip de rol avisa del solo lectura — R-05.

## Por corregir

### Alta: se nota al usarlo

1. **Encabezado del proyecto saturado (R-70).** `ProjectView.vue`: chip de salud, avatares de miembros, cronómetro, botón de atajos,
   «Compartir» y menú, seis cosas en `#actions`. En el teléfono ocupan dos o tres filas. Propuesta: salud y miembros debajo del
   título (subtítulo), cronómetro en la barra superior de la app (ya es global), atajos dentro del menú `⋯`.
2. **Panel de tarea angosto en el teléfono (R-23, R-96).** `TaskDetailPanel.vue:210` usa 360 px fijos en `smAndDown`: en 375 px deja
   una franja y en una tableta (768 px) se queda en 360. Debe ser pantalla completa en `mobile` y 560 en el resto.
3. **Faltan vacíos (R-03).** Solo la lista de proyectos tiene uno. No tienen: el tablero (columna vacía), la lista (sección vacía), el
   calendario sin fechas, el panel (sin tareas) y la facturación sin configurar. «Mis tareas» tiene un texto por grupo vacío, pero no
   el vacío de «todo hecho» (R-03, tercer tipo).
4. **Anchos de columna a mano en la lista (R-51).** `ProjectTaskList.vue:114-198`: `style="width: 120px"` / `140px` repetido en
   cabecera y filas (6 sitios). Con varios campos personalizados la fila desborda sin scroll propio. Pasar a una constante de columnas
   y dar a la lista scroll horizontal interno.

### Media: incoherencias que se arrastrarán a otros módulos

0. ~~**Fechas con el calendario del navegador (`UI-UX.md` §1, «Solo componentes de Vuetify»).** 12 `type="date"` nativos en 8 archivos:
   inicio y vencimiento en `TaskDetailPanel`, `TimeTrackingView` (3), `ProjectBilling` (2), `TaskTime`, `TaskBulkBar`, `TaskFieldInput`
   (campo personalizado de fecha), `ProjectTemplateDialog` y el formulario público `FormFillView`. Se ven
   con el idioma y los colores del sistema operativo, no del CRM. Pasan a `<DateField>`; inicio–fin con `:min` enlazado.~~ **Hecho el 2026-11-06**: los 12 son `<DateField>`, los rangos «desde–hasta» (facturación, horas) enlazan `min`/`max`, y en el detalle de tarea se probó elegir en el calendario, escribir la fecha y vaciarla contra la API.

5. **Botones `outlined` (R-10).** `ProjectBilling.vue:359`, `ProjectCalendar.vue:80`, `ProjectTimeline.vue:140`,
   `TaskDetailPanel.vue:280`, `WorkloadView.vue:106`. Los de navegación («Hoy», «Esta semana») → `tonal`; «Pedir cambios» → `text`.
6. **Cinco anchos de diálogo (R-20).** 560 (`ProjectFormDialog`), 600 (`ShareDialog`, `ProjectOverview`), 640, 720
   (`ProjectRulesDialog`, `ProjectFormsDialog`), 880. Y `max-width="480"` repetido en `ProjectView.vue:207` y
   `TimeTrackingView.vue:275` (es el default). Queda: normal / 640 / 880.
7. ~~**Siete formateadores de fecha propios (R-60).** `new Intl.DateTimeFormat` en `DueDateChip`, `ProjectBilling`, `ProjectCalendar`,
   `ProjectDashboard`, `ProjectOverview`, `ProjectTimeline`, y `toLocaleString` en `ProjectBilling:379`. Van a `utils/format.ts`.~~ **Hecho el 2026-11-06**: las fechas concretas (facturas, comentarios, actividad, horas, creación de la tarea, entrega) salen de `formatDate`/`formatDateTime` en `dd/mm/yyyy`; los rótulos de calendario, cronograma y gráficos (nombres de día y mes, semanas) siguen con `Intl`: pasarán a `utils/format.ts` cuando se sume la regla del guardián.
8. ~~**Dos mecanismos de aviso en el mismo módulo (R-31).** `ProjectBilling.vue:429` tiene su propio `<v-snackbar>` además de
   `store.notice` de `ProjectView` y `MyTasksView`.~~ **Hecho el 2026-11-06**: los tres usan `notify`; los errores del store salen en el aviso global (y los diálogos los siguen mostrando dentro). Las cuatro confirmaciones de borrado usan `useConfirm`, con el foco en «Cancelar».
9. **Iconos sin tooltip (R-12).** Solo `UserAvatar` usa `v-tooltip`. Necesitan tooltip: atajos (`mdi-keyboard-outline`), asa de
   arrastre, dependencias, plantillas, «+» de dependencia.
10. **Un icono fuera del glosario (R-13).** Un `mdi-delete-outline` entre nueve `mdi-trash-can-outline`.

### Baja: accesibilidad

11. **Arrastrar es la única forma de mover una tarea suelta (R-91).** Se puede mover en lote seleccionando, pero el menú de la tarea
    no tiene «Mover a sección…». Las columnas del tablero solo se reordenan arrastrando.
12. **El asa de arrastre no es enfocable (R-90).** `ProjectTaskList.vue`: `<v-icon class="task-drag" @click.stop>` no recibe foco
    ni responde al teclado.

## Deudas de toda la app que Proyectos comparte

Se corrigen una vez, con las piezas de `REGLAS-FRONT.md` §1, no módulo por módulo:

| Deuda | Medida hoy | Pieza |
|---|---|---|
| `window.confirm()` | 7 usos en 4 vistas: clientes, productos, establecimientos, temas del POS | `useConfirm` |
| Snackbars sueltos | 24, con tiempos de 3000 / 3500 / 4000 ms | `useNotify` |
| Formateadores locales | más de 20 `formatDate` / `formatMoney` / `formatPrice` | `utils/format.ts` |
| Anchos de diálogo | 13 valores distintos | R-20 en el guardián |
| Botones de icono sin `aria-label` | 18 (restaurante, productos, clientes…) | R-12 en el guardián |
| Iconos duplicados | borrar: `trash-can-outline` 10 / `delete-outline` 10 / `delete` 2; editar: `pencil-outline` 17 / `pencil` 10 | R-13 en el guardián |
| Vacíos | ningún `v-empty-state`; cada vista arma el suyo o no lo tiene | `EmptyState` |

## Orden propuesto

1. **Piezas compartidas** (`useConfirm`, `useNotify`, `EmptyState`, `utils/format.ts`) y las reglas nuevas del guardián, cada una con
   las excepciones de hoy listadas, para que lo nuevo ya no pueda nacer mal.
2. **Proyectos completo** con este documento como lista, más las mejoras de producto que se decidan. Captura antes y después a 375 y
   1366 px, en claro y oscuro.
3. **El resto de módulos**, de a uno, quitando sus excepciones del guardián.

## Segunda pasada (2026-11-06, Vuetify 4.3 y capturas a 1366 y 375 px)

Revisión del código y de las capturas `cmr-proyect/.visual/v4b/`. Cada punto: dónde, qué pasa y con qué pieza de Vue/Vuetify 4 se
resuelve. Sin librerías nuevas; lo marcado *labs* necesita decisión del dueño (UI-UX.md §1).

### P1. Se nota al usarlo

- **P1.1 Fila de la lista en el teléfono.** `ProjectTaskList.vue:153`: cada fila lleva asa, casilla de selección y círculo de
  completar; en 375 px el título queda en ~18 caracteres («Revisar comprobantes»). La casilla solo en modo selección (o desde `md`),
  el asa solo en escritorio, y el título en dos líneas.
- **P1.2 Panel de tarea angosto en teléfono y tableta** (pendiente del punto 2): `TaskDetailPanel.vue:214`, 360 px fijos.
  `:width="mobile ? width : 560"` con `useDisplay()`.
- **P1.3 Encabezado del proyecto** (pendiente del punto 1): en el teléfono ocupa dos filas. Atajos de teclado al menú `⋯`, miembros
  como `v-avatar-group` junto al subtítulo.
- **P1.4 Vacíos** (pendiente del punto 3): columna del tablero, sección de la lista, calendario sin fechas, panel sin tareas y
  facturación sin configurar, con `EmptyState compact`.
- **P1.5 Cronograma: etiquetas cortadas.** `ProjectTimeline.vue:205`: el título va dentro de la barra y en tareas de 1–2 días se ve
  «Revi…», «R…». Si no cabe, a la derecha de la barra.
- **P1.6 Calendario en el teléfono.** El mes en rejilla deja chips de dos letras («Re…»). En `mobile`, vista de agenda (lista de días
  con tareas) en vez de la rejilla.
- **P1.7 Facturación.** `ProjectBilling.vue:325`: el importe del hito es un campo sin etiqueta visible (en la captura, una caja vacía);
  `v-number-input` con `:precision="2"` y etiqueta. `ProjectBilling.vue:397`: la tabla de facturas no tiene encabezados (fecha, estado,
  número, horas, importe).

### P2. Piezas de Vuetify 4.3 que reemplazan código propio

- `ProjectView.vue:143`: pila de avatares a mano (`ml-n2 border` + «+N») → `v-avatar-group`.
- `ShortcutsDialog.vue`: las teclas como `v-chip` → `v-kbd` / `v-hotkey`.
- `TaskAttachments.vue:61`: `<input type="file">` oculto → `v-file-upload` (soltar archivos sobre la tarea).
- `ProjectDashboard.vue:99`: barras de «Completadas por semana» con `div` y `:style` → `v-sparkline type="bar"`.
- `ProjectSearchDialog.vue`: resaltar lo buscado con `v-highlight`.
- Botones solo de icono sin tooltip (`ProjectView.vue:147` atajos, `ProjectCalendar.vue:80/82`, `LinkedTasksCard.vue:69`, diálogos de
  campos, formularios y reglas) → `v-icon-btn` + `v-tooltip` (R-12).
- Teléfono: «Agregar tarea» como `v-fab` en lista y tablero; `v-pull-to-refresh` en «Mis tareas».
- *labs*, a decidir: `v-command-palette` (buscar tareas y proyectos con Ctrl+K), `v-pie` (tareas por estado en el panel).
- A evaluar: `ProjectCalendar.vue` es una rejilla propia con `<style>`; `v-calendar` (núcleo) la reemplazaría si no hace falta
  arrastrar tareas entre días.

### P3. Coherencia con REGLAS-FRONT

- Botones `outlined` (R-10, pendiente del punto 5): `ProjectBilling.vue:360`, `ProjectCalendar.vue:81`, `ProjectTimeline.vue:140`,
  `TaskDetailPanel.vue:284`, `WorkloadView.vue:106` → `tonal` («Hoy») o `text`.
- Anchos de diálogo (R-20, pendiente del punto 6): 560 / 600 / 640 / 720 / 880 → normal / 640 / 880.
- `RunningTimerChip.vue:37`: `mdi-delete-outline` → `mdi-trash-can-outline` (R-13).
- `MyTasksView.vue:100`: «Celebrar al completar» como interruptor en la barra de la página; es una preferencia, va al menú (R-70).
- `ProjectTaskList.vue:114-198`: anchos de columna repetidos a mano y sin scroll horizontal propio (R-51, pendiente del punto 4).
- Mover una tarea solo arrastrando (R-91) y asa no enfocable (R-90): puntos 11 y 12, pendientes.
- Rótulos con `new Intl.*` en `ProjectCalendar`, `ProjectDashboard`, `ProjectTimeline`, `WorkloadView`, `TaskAttachments`: pasarlos a
  `utils/format.ts` (`formatWeekday`, `formatMonth`, `formatBytes`) para poder sumar la regla R-60 al guardián.

### P4. Necesitan backend o decisión

- **Tarjetas de la lista de proyectos**: hoy solo muestran el rol. Para progreso (`v-progress-linear`), tareas abiertas, próxima
  entrega y miembros (`v-avatar-group`), `GET /projects` debe devolver esos totales. También buscar, ordenar y alternar tarjetas/tabla.
- Nombre de las personas: en panel, horas y carga se ve el correo (`admin@admin.com`) porque el usuario de la semilla no tiene
  nombre; confirmar que `displayName` usa el nombre cuando existe.
- En la captura en paralelo (4 navegadores), la lista del proyecto recibió 860 respuestas 429 del gateway; con un navegador hace 20
  peticiones. Revisar qué reintenta sin espera ante un 429.

### Hecho el 2026-11-06 (tras la segunda pasada, revisado a 1366 y 1920 px)

- **Encabezado** (puntos 1 y P1.3): miembros en `v-avatar-group`; atajos de teclado al menú `⋯` con `v-hotkey`. En «Mis tareas», atajos
  y «Celebrar al completar» también al menú.
- **Panel de tarea** (punto 2 y P1.2): ancho completo en el teléfono; título con `title-field text-title-large` (antes salía a 16 px);
  «Mover a» con las demás secciones en su menú (punto 11, R-91); botones sin borde.
- **Lista** (punto 4, P1.1): anchos de columna en una constante, mínimo para el título y scroll horizontal si hay muchos campos; en el
  teléfono sin asa de arrastre y tocar la fila abre el detalle (sin la flecha `>`).
- **Vacíos** (punto 3, P1.4): columna del tablero vacía y panel sin tareas o sin completadas con `EmptyState`.
- **Cronograma** (P1.5): el título que no cabe en la barra, y el de los hitos, va a su derecha.
- **Facturación** (P1.7): importe del hito con `v-number-input` y etiqueta; tabla de facturas con encabezados.
- **Vuetify 4** (P2): `v-file-upload` en adjuntos, `v-sparkline` en el panel, `v-highlight` en la búsqueda, tooltips en los 16 botones
  de icono que no son universales (punto 9).
- **Coherencia** (P3, puntos 5, 6, 10): ningún `v-btn` con borde en toda la app (regla `boton` en `lint:ui`); diálogos de Proyectos en
  normal / 640 / 880; `mdi-trash-can-outline`; rótulos de calendario, cronograma, carga y adjuntos con `utils/format.ts`
  (`formatDayMonth`, `formatMonthYear`, `weekdayLabels`, `formatBytes`, `formatRelative`): ya no queda `new Intl.` en Proyectos.

Pendiente: calendario en el teléfono como agenda (P1.6), `v-fab` y `v-pull-to-refresh` en el teléfono, asa de arrastre enfocable
(punto 12), *labs* (`v-command-palette`, `v-pie`), decidir `v-calendar` (P2) y los totales de la lista de proyectos (P4, backend).

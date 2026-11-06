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

<script setup lang="ts">
/**
 * Lo que se ve mientras una pantalla carga por PRIMERA vez (REGLAS-FRONT.md R-01): la silueta de lo que va a llegar, con el brillo de
 * `v-skeleton-loader`, en vez de una barra suelta o una pantalla en blanco. Así la espera se nota y la página no «salta» cuando
 * llegan los datos, porque el esqueleto ocupa ya el sitio de la tabla, la ficha o el formulario.
 *
 * Dos usos:
 *
 *   <!-- Envolviendo el contenido: esqueleto mientras `loading`, y el contenido entra con un fundido cuando termina. -->
 *   <ViewSkeleton :loading="store.loading && !customer" type="detail">
 *     …contenido…
 *   </ViewSkeleton>
 *
 *   <!-- Solo las filas, dentro del hueco `loading` de un v-data-table. El `v-if` es obligatorio: con el hueco puesto, Vuetify
 *        cambia TODAS las filas por el esqueleto aunque ya haya datos, y una recarga vaciaría la tabla (R-02). -->
 *   <v-data-table :items="items" :loading="store.loading">
 *     <template v-if="!items?.length" #loading><ViewSkeleton type="rows" /></template>
 *   </v-data-table>
 *
 * `loading` es solo la PRIMERA carga (aún no hay nada que enseñar). Al recargar con datos ya en pantalla se dejan los datos y se
 * muestra la barra o el `loading` de la tabla: nunca se vuelve al esqueleto (R-02).
 *
 * Los tipos copian la forma de los arquetipos de pantalla (PLAN-MODERNIZE.md): si una pantalla nueva no encaja en ninguno, se añade
 * aquí, no se arma un esqueleto a mano en la vista.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type SkeletonType = 'table' | 'rows' | 'list' | 'cards' | 'detail' | 'form' | 'board' | 'dashboard' | 'text';

const props = withDefaults(
  defineProps<{
    /** Forma de lo que va a llegar. */
    type?: SkeletonType;
    /** Mientras sea `true` se ve el esqueleto; sin contenido en el hueco por defecto, se ve siempre. */
    loading?: boolean;
    /** Filas, tarjetas o campos que dibuja (cada tipo tiene un número razonable por defecto). */
    count?: number;
    /**
     * Dibuja además el panel de `PageHeader` (tonal, título y subtítulo). Solo cuando el título sale de los datos que se están
     * cargando (el nombre del proyecto, el número de una factura); si el título es fijo, el `PageHeader` real va fuera del esqueleto.
     */
    header?: boolean;
  }>(),
  { type: 'table', loading: true, count: undefined, header: false },
);

const { t } = useI18n();

const DEFAULT_COUNT: Record<SkeletonType, number> = {
  table: 6, rows: 5, list: 5, cards: 6, detail: 4, form: 6, board: 4, dashboard: 4, text: 3,
};
const n = computed(() => props.count ?? DEFAULT_COUNT[props.type]);
</script>

<template>
  <v-fade-transition mode="out-in">
    <div v-if="loading || !$slots.default" key="skeleton" role="status" aria-busy="true" :aria-label="t('common.loading')">
      <!-- La silueta del PageHeader: mismo panel `lightprimary`, mismo relleno y mismo margen inferior. -->
      <v-sheet v-if="header" color="lightprimary" class="pa-6 mb-6">
        <v-skeleton-loader type="heading, text" color="transparent" />
      </v-sheet>

      <!-- Una tabla dentro de su tarjeta: barra de título + cabecera + filas. -->
      <v-card v-if="type === 'table'">
        <v-skeleton-loader :type="`table-heading, table-thead, table-row-divider@${n}`" />
      </v-card>

      <!-- Solo filas: para el hueco `loading` de un v-data-table, que ya pinta su cabecera real. -->
      <v-skeleton-loader v-else-if="type === 'rows'" :type="`table-row-divider@${n}`" />

      <v-card v-else-if="type === 'list'">
        <v-skeleton-loader :type="`list-item-avatar-two-line@${n}`" />
      </v-card>

      <v-row v-else-if="type === 'cards'">
        <v-col v-for="i in n" :key="i" cols="12" sm="6" lg="4">
          <v-card><v-skeleton-loader type="heading, list-item-two-line, chip" /></v-card>
        </v-col>
      </v-row>

      <!-- Ficha: tarjeta de cabecera (avatar y datos clave) y debajo las tarjetas secundarias (arquetipo D). -->
      <v-row v-else-if="type === 'detail'">
        <v-col cols="12">
          <v-card><v-skeleton-loader type="list-item-avatar-three-line" /></v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-card><v-skeleton-loader :type="`heading, list-item-two-line@${n}`" /></v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card><v-skeleton-loader type="heading, list-item-two-line@2, button" /></v-card>
        </v-col>
      </v-row>

      <!-- Formulario: título y una rejilla de campos (etiqueta + caja del alto de un campo compacto, 40 px). -->
      <v-card v-else-if="type === 'form'" class="pa-6">
        <v-skeleton-loader type="heading" class="mb-4" />
        <v-row density="comfortable">
          <v-col v-for="i in n" :key="i" cols="12" md="6">
            <v-skeleton-loader type="ossein" height="40" class="rounded overflow-hidden" />
          </v-col>
        </v-row>
        <div class="d-flex justify-end mt-4">
          <v-skeleton-loader type="button" width="112" />
        </div>
      </v-card>

      <!-- Tablero: columnas de ancho fijo con tarjetas (R-55). -->
      <div v-else-if="type === 'board'" class="d-flex ga-4 overflow-x-hidden">
        <v-sheet v-for="i in n" :key="i" color="grey100" width="280" class="flex-shrink-0 pa-2">
          <v-skeleton-loader type="heading" color="transparent" class="mb-2" />
          <v-card v-for="j in 3" :key="j" class="mb-2"><v-skeleton-loader type="list-item-two-line" /></v-card>
        </v-sheet>
      </div>

      <!-- Tablero de Inicio: fila de indicadores y dos listas. -->
      <v-row v-else-if="type === 'dashboard'">
        <v-col v-for="i in n" :key="`kpi-${i}`" cols="12" sm="6" lg="3">
          <v-card><v-skeleton-loader type="list-item-avatar, heading" /></v-card>
        </v-col>
        <v-col v-for="i in 2" :key="`list-${i}`" cols="12" md="6">
          <v-card><v-skeleton-loader type="heading, list-item-two-line@4" /></v-card>
        </v-col>
      </v-row>

      <!-- Bloque de texto suelto dentro de una tarjeta o un panel ya dibujado. -->
      <v-skeleton-loader v-else :type="`heading, list-item-two-line@${n}`" />
    </div>

    <div v-else key="content">
      <slot />
    </div>
  </v-fade-transition>
</template>

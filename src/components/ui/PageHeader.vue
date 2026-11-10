<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { useStickyHeader } from '@/composable/useStickyHeader';
/**
 * Encabezado canónico de una vista. Toda vista de nivel superior empieza con
 * este componente: fija el nivel del encabezado, la tipografía, el espaciado y
 * la posición de las acciones para que ninguna vista invente los suyos.
 *
 *   <PageHeader :title="$t('customers.title')" :subtitle="$t('customers.intro')">
 *     <template #actions>
 *       <v-btn color="primary" prepend-icon="mdi-plus">Nuevo</v-btn>
 *     </template>
 *   </PageHeader>
 *
 * Se apoya en un panel `lightprimary` en vez de ir suelto sobre el fondo: es el
 * patrón de la referencia visual (ver docs/PLAN-MODERNIZE.md) y además separa
 * la cabecera del contenido sin necesidad de una línea divisoria.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /**
     * El encabezado se queda fijo bajo la barra superior al hacer scroll y, al bajar, crece de forma gradual hasta el 100 % del
     * ancho útil y se compacta. Es el comportamiento de TODAS las pantallas; `:sticky="false"` lo apaga en una excepción. No se
     * fija dentro de tarjetas ni diálogos (secciones embebidas). Ver useStickyHeader.
     */
    sticky?: boolean;
  }>(),
  { sticky: true },
);

const sheet = ref<{ $el: HTMLElement } | null>(null);
const sheetEl = computed(() => sheet.value?.$el ?? null);
const stickyStyle = useStickyHeader(sheetEl, () => props.sticky === true);
/** En el teléfono el titular baja a `text-title-large`: a 24 px, el nombre de un proyecto y sus acciones no cabían en una fila. */
const { xs } = useDisplay();
</script>

<template>
  <v-sheet
    ref="sheet"
    color="lightprimary"
    class="d-flex flex-wrap align-center ga-3 mb-6 pa-6"
    :class="{ 'position-sticky': sticky }"
    :style="stickyStyle"
  >
    <!-- El título crece: en la misma fila empuja las acciones a la derecha, y si no caben, estas bajan a la fila siguiente alineadas
         a la izquierda (antes quedaban sueltas a la derecha, con un hueco grande debajo del título en el teléfono). -->
    <div class="flex-grow-1">
      <!--
        Color forzado, no utilidad de opacidad: sobre `lightprimary` el texto
        hereda `on-lightprimary`, que es el propio azul y deja el título
        lavado contra el panel (ese token es para chips de estado, no para
        titulares), y `text-high-emphasis` solo reduce opacidad, no cambia el
        color base. Forzar `on-surface` a opacidad completa da el negro sólido
        de la referencia y funciona igual en claro y en oscuro.
      -->
      <h1 :class="xs ? 'text-title-large' : 'text-headline-small'" class="font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">{{ title }}</h1>
      <div v-if="subtitle" class="text-body-medium text-medium-emphasis mt-1">
        {{ subtitle }}
      </div>
    </div>

    <!-- flex-wrap: con dos o más acciones, en un teléfono el segundo botón se salía de la pantalla (scroll lateral) -->
    <div v-if="$slots.actions" class="d-flex flex-wrap align-center ga-2">
      <slot name="actions" />
    </div>
  </v-sheet>
</template>

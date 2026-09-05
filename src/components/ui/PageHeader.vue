<script setup lang="ts">
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
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <v-sheet color="lightprimary" class="d-flex flex-wrap align-center ga-3 mb-6 pa-6">
    <div>
      <!--
        Color forzado, no utilidad de opacidad: sobre `lightprimary` el texto
        hereda `on-lightprimary`, que es el propio azul y deja el título
        lavado contra el panel (ese token es para chips de estado, no para
        titulares), y `text-high-emphasis` solo reduce opacidad, no cambia el
        color base. Forzar `on-surface` a opacidad completa da el negro sólido
        de la referencia y funciona igual en claro y en oscuro.
      -->
      <h1 class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">{{ title }}</h1>
      <div v-if="subtitle" class="text-body-2 text-medium-emphasis mt-1">
        {{ subtitle }}
      </div>
    </div>

    <div v-if="$slots.actions" class="d-flex align-center ga-2 ml-auto">
      <slot name="actions" />
    </div>
  </v-sheet>
</template>

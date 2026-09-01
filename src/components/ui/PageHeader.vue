<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

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
 * En vistas de detalle o formulario, `back-to` añade la flecha de retorno:
 *
 *   <PageHeader :title="producto.name" :back-to="{ name: 'products' }" />
 */
defineProps<{
  title: string;
  subtitle?: string;
  /** Destino de la flecha de retorno. Si se omite, no se muestra. */
  backTo?: RouteLocationRaw;
}>();
</script>

<template>
  <div class="d-flex flex-wrap align-center ga-3 mb-6">
    <v-btn
      v-if="backTo"
      icon="mdi-arrow-left"
      variant="text"
      density="comfortable"
      :to="backTo"
    />

    <div>
      <h1 class="text-h5 font-weight-medium">{{ title }}</h1>
      <div v-if="subtitle" class="text-body-2 text-medium-emphasis mt-1">
        {{ subtitle }}
      </div>
    </div>

    <div v-if="$slots.actions" class="d-flex align-center ga-2 ml-auto">
      <slot name="actions" />
    </div>
  </div>
</template>

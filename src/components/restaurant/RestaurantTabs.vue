<script setup lang="ts">
/**
 * Pestañas de las tres pantallas del plugin de restaurantes (mesas, plano y
 * horarios). Se navega entre ellas por ruta, no por estado local, para que el
 * enlace directo a cada una funcione y el botón «atrás» del navegador respete
 * el recorrido.
 */
const tabs = [
  { to: { name: 'restaurant-tables' }, labelKey: 'nav.restaurant', icon: 'mdi-table-furniture' },
  { to: { name: 'restaurant-plan' }, labelKey: 'restaurant.plan.title', icon: 'mdi-vector-rectangle' },
  { to: { name: 'restaurant-schedule' }, labelKey: 'restaurant.schedule.title', icon: 'mdi-clock-outline' },
];
</script>

<template>
  <v-tabs :model-value="$route.name" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

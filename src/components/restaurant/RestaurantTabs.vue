<script setup lang="ts">
/**
 * Pestañas de las pantallas del plugin de restaurantes. Se navega entre ellas por ruta, no por estado local, para que el enlace
 * directo a cada una funcione y el botón «atrás» del navegador respete el recorrido.
 *
 * Mesas, plano y horarios son del módulo del mapa. Las dos pestañas de reservas solo aparecen si la organización tiene
 * contratado `restaurant.reservations` y la persona puede verlas (`reservation:read`): son un módulo y un permiso aparte.
 */
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';

const auth = useAuthStore();
const plugins = usePluginsStore();

const tabs = computed(() => {
  const base = [
    { to: { name: 'restaurant-tables' }, labelKey: 'nav.restaurant', icon: 'mdi-table-furniture' },
    { to: { name: 'restaurant-plan' }, labelKey: 'restaurant.plan.title', icon: 'mdi-vector-rectangle' },
    { to: { name: 'restaurant-schedule' }, labelKey: 'restaurant.schedule.title', icon: 'mdi-clock-outline' },
  ];
  if (!plugins.isActive('restaurant.reservations') || !auth.can('reservation:read')) return base;
  return [
    ...base,
    { to: { name: 'restaurant-reservations' }, labelKey: 'restaurant.reservations.title', icon: 'mdi-calendar-check-outline' },
    { to: { name: 'restaurant-reservation-settings' }, labelKey: 'restaurant.reservations.settings.tab', icon: 'mdi-web' },
  ];
});
</script>

<template>
  <v-tabs :model-value="$route.name" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

<script setup lang="ts">
/**
 * Pestañas de las pantallas de compras. Se navega por ruta (cada pestaña tiene su enlace y «atrás» respeta el recorrido) y cada una
 * aparece solo si la persona tiene el permiso de verla. El alta y el detalle de una orden cuelgan de la pestaña «Órdenes».
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const tabs = computed(() =>
  [
    { to: { name: 'purchasing-orders' }, labelKey: 'purchasing.tabs.orders', icon: 'mdi-clipboard-list-outline', permission: 'purchase:read' },
    { to: { name: 'purchasing-suppliers' }, labelKey: 'purchasing.tabs.suppliers', icon: 'mdi-truck-outline', permission: 'supplier:read' },
  ].filter((tab) => auth.can(tab.permission)),
);

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  return name === 'purchasing-order' || name === 'purchasing-order-new' || name === 'purchasing-order-edit' ? 'purchasing-orders' : name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

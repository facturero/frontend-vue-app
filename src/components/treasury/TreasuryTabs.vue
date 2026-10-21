<script setup lang="ts">
/**
 * Pestañas de las pantallas de tesorería. Se navega por ruta (cada pestaña tiene su enlace y «atrás» respeta el recorrido) y cada una
 * aparece solo si la persona tiene el permiso de verla. El estado de cuenta de un cliente cuelga de la cartera y marca su pestaña.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const tabs = computed(() =>
  [
    { to: { name: 'treasury-receivables' }, labelKey: 'treasury.tabs.receivables', icon: 'mdi-cash-multiple', permission: 'receivable:read' },
    { to: { name: 'treasury-aging' }, labelKey: 'treasury.tabs.aging', icon: 'mdi-timeline-clock-outline', permission: 'receivable:read' },
    { to: { name: 'treasury-opening-balances' }, labelKey: 'treasury.tabs.opening', icon: 'mdi-database-import-outline', permission: 'opening_balance:load' },
  ].filter((tab) => auth.can(tab.permission)),
);

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  return name === 'treasury-customer-statement' ? 'treasury-receivables' : name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

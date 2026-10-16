<script setup lang="ts">
/**
 * Pestañas de las pantallas de contabilidad. Se navega entre ellas por ruta (no por estado local) para que cada pestaña tenga su
 * enlace y el botón «atrás» respete el recorrido. Cada una aparece solo si la persona tiene el permiso de verla.
 */
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAccountingStore } from '@/stores/accounting';

const auth = useAuthStore();
const route = useRoute();
const store = useAccountingStore();

// El globo de «Automática» cuenta lo que espera a una persona. Silencioso: si falla, la pestaña funciona igual.
onMounted(() => {
  if (auth.can('account:read') && store.configured !== false) void store.refreshPendingCount();
});

const tabs = computed(() =>
  [
    { to: { name: 'accounting-accounts' }, labelKey: 'accounting.tabs.accounts', icon: 'mdi-file-tree-outline', permission: 'account:read' },
    { to: { name: 'accounting-journal' }, labelKey: 'accounting.tabs.journal', icon: 'mdi-book-open-page-variant-outline', permission: 'journal:read' },
    { to: { name: 'accounting-automatic' }, labelKey: 'accounting.tabs.automatic', icon: 'mdi-robot-outline', permission: 'account:read', badge: true },
    { to: { name: 'accounting-periods' }, labelKey: 'accounting.tabs.periods', icon: 'mdi-calendar-lock-outline', permission: 'account:read' },
    { to: { name: 'accounting-statements' }, labelKey: 'accounting.tabs.statements', icon: 'mdi-file-chart-outline', permission: 'ledger:read' },
    { to: { name: 'accounting-reports' }, labelKey: 'accounting.tabs.reports', icon: 'mdi-scale-balance', permission: 'ledger:read' },
  ].filter((tab) => auth.can(tab.permission)),
);

/** El detalle y el alta de un asiento cuelgan de la pestaña «Asientos». */
const activeTab = computed(() => {
  const name = String(route.name ?? '');
  return name === 'accounting-entry' || name === 'accounting-entry-new' ? 'accounting-journal' : name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
      <v-badge v-if="tab.badge && store.pendingCount > 0" :content="store.pendingCount" color="warning" inline />
    </v-tab>
  </v-tabs>
</template>

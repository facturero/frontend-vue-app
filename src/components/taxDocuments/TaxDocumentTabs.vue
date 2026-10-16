<script setup lang="ts">
/**
 * Pestañas de los comprobantes que se emiten aparte de la factura: retenciones y guías de remisión. Se navega por ruta (cada
 * pestaña tiene su enlace) y cada una aparece solo si la persona puede verla. El alta cuelga de su pestaña.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const tabs = computed(() =>
  [
    { to: { name: 'tax-withholdings' }, labelKey: 'taxDocuments.tabs.withholdings', icon: 'mdi-percent-outline' },
    { to: { name: 'tax-delivery-guides' }, labelKey: 'taxDocuments.tabs.guides', icon: 'mdi-truck-delivery-outline' },
  ].filter(() => auth.can('fiscal:read')),
);

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  if (name === 'tax-withholding-new') return 'tax-withholdings';
  if (name === 'tax-delivery-guide-new') return 'tax-delivery-guides';
  return name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4">
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

<script setup lang="ts">
/**
 * Pestañas de las pantallas de anexos del SRI. Se navega por ruta (cada pestaña tiene su enlace y «atrás» respeta el recorrido); el
 * detalle de una versión cuelga de «Anexos».
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const tabs = computed(() =>
  [
    { to: { name: 'reporting-annexes' }, labelKey: 'reporting.tabs.annexes', icon: 'mdi-file-document-check-outline', permission: 'tax_annex:read' },
    { to: { name: 'reporting-documents' }, labelKey: 'reporting.tabs.documents', icon: 'mdi-file-search-outline', permission: 'tax_annex:read' },
  ].filter((tab) => auth.can(tab.permission)),
);

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  return name === 'reporting-annex-run' ? 'reporting-annexes' : name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4" show-arrows>
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

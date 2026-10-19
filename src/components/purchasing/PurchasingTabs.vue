<script setup lang="ts">
/**
 * Pestañas de las pantallas de compras. Se navega por ruta (cada pestaña tiene su enlace y «atrás» respeta el recorrido) y cada una
 * aparece solo si la persona tiene el permiso de verla. Las pantallas que cuelgan de una pestaña (el alta y el detalle de una orden,
 * la recepción, las facturas) marcan la suya en vez de quedarse sin ninguna activa.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const tabs = computed(() =>
  [
    { to: { name: 'purchasing-orders' }, labelKey: 'purchasing.tabs.orders', icon: 'mdi-clipboard-list-outline', permission: 'purchase:read' },
    { to: { name: 'purchasing-receipts' }, labelKey: 'purchasing.tabs.receipts', icon: 'mdi-tray-arrow-down-outline', permission: 'purchase:read' },
    { to: { name: 'purchasing-bills' }, labelKey: 'purchasing.tabs.bills', icon: 'mdi-file-document-outline', permission: 'purchase_bill:read' },
    { to: { name: 'purchasing-suppliers' }, labelKey: 'purchasing.tabs.suppliers', icon: 'mdi-truck-outline', permission: 'supplier:read' },
  ].filter((tab) => auth.can(tab.permission)),
);

const ORDER_ROUTES = ['purchasing-order', 'purchasing-order-new', 'purchasing-order-edit', 'purchasing-order-receiving'];
const BILL_ROUTES = ['purchasing-bill', 'purchasing-bill-new', 'purchasing-bill-edit'];

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  if (ORDER_ROUTES.includes(name)) return 'purchasing-orders';
  if (BILL_ROUTES.includes(name)) return 'purchasing-bills';
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

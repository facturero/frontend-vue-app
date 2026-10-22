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
    { to: { name: 'treasury-receipts' }, labelKey: 'treasury.tabs.receipts', icon: 'mdi-receipt-text-outline', permission: 'receipt:read' },
    { to: { name: 'treasury-reminders' }, labelKey: 'treasury.tabs.reminders', icon: 'mdi-bell-ring-outline', permission: 'reminder:manage' },
    { to: { name: 'treasury-payables' }, labelKey: 'treasury.tabs.payables', icon: 'mdi-cash-minus', permission: 'payable:read' },
    { to: { name: 'treasury-payments' }, labelKey: 'treasury.tabs.payments', icon: 'mdi-receipt-text-minus-outline', permission: 'payment:read' },
    { to: { name: 'treasury-aging' }, labelKey: 'treasury.tabs.aging', icon: 'mdi-timeline-clock-outline', permission: 'receivable:read' },
    { to: { name: 'treasury-opening-balances' }, labelKey: 'treasury.tabs.opening', icon: 'mdi-database-import-outline', permission: 'opening_balance:load' },
    { to: { name: 'treasury-payable-opening' }, labelKey: 'treasury.tabs.payableOpening', icon: 'mdi-database-arrow-down-outline', permission: 'opening_balance:load' },
  ].filter((tab) => auth.can(tab.permission)),
);

const activeTab = computed(() => {
  const name = String(route.name ?? '');
  if (name === 'treasury-customer-statement') return 'treasury-receivables';
  // El alta, la edición y el detalle de un cobro cuelgan de la pestaña «Cobros».
  if (['treasury-receipt', 'treasury-receipt-new', 'treasury-receipt-edit'].includes(name)) return 'treasury-receipts';
  // El estado de cuenta de un proveedor cuelga de «Por pagar»; el alta, la edición y el detalle de un pago, de «Pagos».
  if (name === 'treasury-supplier-statement') return 'treasury-payables';
  if (['treasury-payment', 'treasury-payment-new', 'treasury-payment-edit'].includes(name)) return 'treasury-payments';
  return name;
});
</script>

<template>
  <v-tabs :model-value="activeTab" density="comfortable" class="mb-4" show-arrows>
    <v-tab v-for="tab in tabs" :key="String(tab.to.name)" :to="tab.to" :value="tab.to.name" :prepend-icon="tab.icon">
      {{ $t(tab.labelKey) }}
    </v-tab>
  </v-tabs>
</template>

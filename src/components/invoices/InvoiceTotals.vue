<script setup lang="ts">
import { computed } from 'vue';
import { useInvoiceStore } from '@/stores/invoices';

const props = defineProps<{ currencySymbol: string }>();

const store = useInvoiceStore();

// El total de IVA se calcula sumando line.taxes[].amountCents directo de las
// líneas, en vez de confiar ciegamente en el agregado taxTotalCents de la
// factura — así el desglose que ves siempre corresponde a lo que hay en las
// líneas mismas.
const taxTotalCentsComputed = computed(() => {
  const lines = store.current?.lines ?? [];
  return lines.reduce((sum, line) => {
    const lineTaxes = line.taxes ?? [];
    return sum + lineTaxes.reduce((s, t) => s + t.amountCents, 0);
  }, 0);
});

const taxTotalDisplay = computed(() => (taxTotalCentsComputed.value / 100).toFixed(2));

const totalDisplay = computed(() => {
  const subtotalCents = store.current?.subtotalCents ?? 0;
  return ((subtotalCents + taxTotalCentsComputed.value) / 100).toFixed(2);
});
</script>

<template>
  <div class="d-flex justify-end mb-6">
    <v-sheet min-width="260" color="transparent" rounded="0">
      <div class="d-flex justify-space-between text-body-medium text-medium-emphasis py-1">
        <span>{{ $t('invoices.subtotal') }}</span>
        <span class="text-mono">{{ currencySymbol }}{{ store.current?.subtotal ?? '0.00' }}</span>
      </div>
      <div class="d-flex justify-space-between text-body-medium text-medium-emphasis py-1">
        <span>{{ $t('invoices.taxTotal') }}</span>
        <span class="text-mono">{{ currencySymbol }}{{ taxTotalDisplay }}</span>
      </div>
      <v-divider class="my-2" />
      <div class="d-flex justify-space-between text-title-large font-weight-bold">
        <span>{{ $t('invoices.totalDue') }}</span>
        <span class="text-mono">{{ currencySymbol }}{{ totalDisplay }}</span>
      </div>
    </v-sheet>
  </div>
</template>


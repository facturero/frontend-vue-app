<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useInvoiceStore } from '@/stores/invoices';
import { useProductStore } from '@/stores/products';

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ error: [message: string] }>();

const { t } = useI18n();
const store = useInvoiceStore();
const productStore = useProductStore();

const newLine = ref({ productId: '', description: '', quantity: 1, unitPrice: '0.00' });

const lines = computed(() => store.current?.lines ?? []);
const productOptions = computed(() =>
  productStore.list
    .filter(p => p.status === 'active')
    .map(p => ({ title: `${p.name} · ${p.type === 'service' ? t('products.service') : t('products.good')}`, value: p.id })),
);

const canAddLine = computed(() => {
  const price = parseFloat(newLine.value.unitPrice);
  return !!newLine.value.productId && newLine.value.quantity > 0 && !Number.isNaN(price) && price > 0;
});

function lineItemName(line: { productSnapshot: { name: string } | null; productId: string }): string {
  if (line.productSnapshot?.name) return line.productSnapshot.name;
  const product = productStore.list.find(p => p.id === line.productId);
  return product?.name || t('invoices.unnamedProduct');
}

watch(() => newLine.value.productId, (productId) => {
  if (!productId) return;
  const product = productStore.list.find(p => p.id === productId);
  if (product) {
    newLine.value.unitPrice = product.price;
  }
});

async function addLine() {
  if (!store.current || !canAddLine.value) return;
  const product = productStore.list.find(p => p.id === newLine.value.productId);

  try {
    await store.addLine(store.current.id, {
      productId: newLine.value.productId,
      description: newLine.value.description || product?.name || '',
      quantity: newLine.value.quantity,
      unitPrice: newLine.value.unitPrice,
      discountCents: 0,
    });
    newLine.value = { productId: '', description: '', quantity: 1, unitPrice: '0.00' };
  } catch (e: any) {
    emit('error', e.message || t('invoices.addLineError'));
  }
}

async function removeLine(lineId: string) {
  if (!store.current) return;
  await store.removeLine(store.current.id, lineId);
}
</script>

<template>
  <v-table class="mb-2 bg-transparent">
    <thead>
      <tr>
        <th>{{ $t('invoices.item') }}</th>
        <th>{{ $t('common.description') }}</th>
        <th class="text-right">{{ $t('invoices.qtyShort') }}</th>
        <th class="text-right">{{ $t('products.price') }}</th>
        <th class="text-right">{{ $t('invoices.subtotal') }}</th>
        <th />
      </tr>
    </thead>
    <tbody>
      <tr v-for="line in lines" :key="line.id">
        <td>{{ lineItemName(line) }}</td>
        <td class="text-medium-emphasis">{{ line.description }}</td>
        <td class="text-right mono">{{ line.quantity }}</td>
        <td class="text-right mono">{{ (line.unitPriceCents / 100).toFixed(2) }}</td>
        <td class="text-right mono">{{ (line.subtotalCents / 100).toFixed(2) }}</td>
        <td class="text-right">
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            size="x-small"
            color="error"
            :title="$t('invoices.removeLine')"
            @click="removeLine(line.id)"
          />
        </td>
      </tr>
      <tr class="line-input-row">
        <td style="min-width: 220px">
          <v-select
            v-model="newLine.productId"
            :items="productOptions"
            :placeholder="$t('invoices.productOrService')"
            hide-details
            :disabled="disabled"
          />
        </td>
        <td style="min-width: 220px">
          <v-text-field
            v-model="newLine.description"
            :placeholder="$t('invoices.descriptionOptional')"
            hide-details
            :disabled="disabled"
          />
        </td>
        <td style="width: 100px">
          <v-text-field
            v-model.number="newLine.quantity"
            type="number"
            min="1"
            hide-details
            class="mono"
            :disabled="disabled"
          />
        </td>
        <td style="width: 130px">
          <v-text-field
            v-model="newLine.unitPrice"
            hide-details
            class="mono"
            :disabled="disabled"
          />
        </td>
        <td class="text-right mono text-medium-emphasis">—</td>
        <td class="text-right">
          <v-btn
            icon="mdi-plus"
            variant="tonal"
            color="primary"
            size="small"
            :title="$t('invoices.addLine')"
            :disabled="disabled || !canAddLine"
            @click="addLine"
          />
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<style scoped>
/* La fila de captura lleva campos completos, no texto: necesita más aire
   vertical que las filas de sólo lectura de la tabla. */
.line-input-row > td {
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: middle;
}

.mono {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
}
</style>
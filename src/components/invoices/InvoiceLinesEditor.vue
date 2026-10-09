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

const priceOk = computed(() => {
  const price = parseFloat(newLine.value.unitPrice);
  return !Number.isNaN(price) && price > 0;
});
const canAddLine = computed(() => !!newLine.value.productId && newLine.value.quantity > 0 && priceOk.value);
// Un producto con precio 0 deja el botón apagado sin decir por qué: se avisa en el propio campo.
const priceInvalid = computed(() => !!newLine.value.productId && !priceOk.value);

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
  <v-table v-if="lines.length" class="mb-2 bg-transparent">
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
    </tbody>
  </v-table>

  <!-- Captura de la línea nueva: columnas de Vuetify en vez de una fila de la tabla, para que en el teléfono se apile y el botón
       no quede fuera de la pantalla dentro del desplazamiento horizontal de la tabla. -->
  <v-row dense class="mb-2">
    <v-col cols="12" md="4">
      <v-select
        v-model="newLine.productId"
        :items="productOptions"
        :label="$t('invoices.productOrService')"
        hide-details
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="12" md="3">
      <v-text-field
        v-model="newLine.description"
        :label="$t('invoices.descriptionOptional')"
        hide-details
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="4" md="1">
      <v-text-field
        v-model.number="newLine.quantity"
        :label="$t('invoices.qtyShort')"
        type="number"
        min="1"
        hide-details
        class="mono"
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="8" md="2">
      <v-text-field
        v-model="newLine.unitPrice"
        :label="$t('products.price')"
        :error-messages="priceInvalid ? [$t('invoices.priceRequired')] : []"
        :hide-details="!priceInvalid"
        class="mono"
        :disabled="disabled"
      />
    </v-col>
    <v-col cols="12" md="2">
      <v-btn
        block
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        :disabled="disabled || !canAddLine"
        :loading="store.saving"
        @click="addLine"
      >
        {{ $t('invoices.addLine') }}
      </v-btn>
    </v-col>
  </v-row>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
}
</style>
<script setup lang="ts">
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosStore } from '@/stores/pos';
import type { PosLine } from '@/types/pos';
import { lineTotals, parseMoneyToCents } from '@/utils/pos-totals';
import PosCustomerPicker from './PosCustomerPicker.vue';

const emit = defineEmits<{ charge: [] }>();

const pos = usePosStore();
const { money } = usePosMoney();

function onQuantity(line: PosLine, value: string): void {
  const n = Number(value.replace(',', '.'));
  if (Number.isFinite(n)) pos.setQuantity(line.productId, n);
}

/** Un importe inválido deja el descuento en 0 en vez de quedarse con lo escrito a medias. */
function onDiscount(line: PosLine, value: string): void {
  pos.setDiscount(line.productId, parseMoneyToCents(value) ?? 0);
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center ga-2">
      <span class="flex-grow-1">{{ $t('pos.cart.title') }}</span>
      <v-chip v-if="pos.lines.length" size="small">{{ $t('pos.cart.items', { count: pos.itemCount }, pos.itemCount) }}</v-chip>
      <v-btn v-if="pos.lines.length" variant="text" size="small" color="error" @click="pos.clearSale()">{{ $t('pos.cart.clear') }}</v-btn>
    </v-card-title>

    <v-card-text>
      <p v-if="!pos.lines.length" class="text-body-2 text-medium-emphasis text-center pa-6">{{ $t('pos.cart.empty') }}</p>

      <template v-for="(line, i) in pos.lines" :key="line.productId">
        <v-divider v-if="i > 0" class="my-3" />
        <div class="d-flex align-start ga-2">
          <div class="flex-grow-1">
            <div class="text-subtitle-2 text-wrap">{{ line.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ money(line.unitPriceCents) }}</div>
          </div>
          <span class="text-body-1 font-weight-medium">{{ money(lineTotals(line).totalCents) }}</span>
          <v-btn icon="mdi-close" size="x-small" variant="text" :title="$t('pos.cart.remove')" @click="pos.removeLine(line.productId)" />
        </div>
        <div class="d-flex align-center flex-wrap ga-2 mt-2">
          <v-btn icon="mdi-minus" size="x-small" variant="tonal" :title="$t('pos.cart.less')" @click="pos.setQuantity(line.productId, line.quantity - 1)" />
          <v-text-field
            :model-value="line.quantity"
            :label="$t('pos.cart.quantity')"
            type="number"
            min="0"
            :max-width="96"
            @change="(e: Event) => onQuantity(line, (e.target as HTMLInputElement).value)"
          />
          <v-btn icon="mdi-plus" size="x-small" variant="tonal" :title="$t('pos.cart.more')" @click="pos.setQuantity(line.productId, line.quantity + 1)" />
          <v-text-field
            :model-value="(line.discountCents / 100).toFixed(2)"
            :label="$t('pos.cart.discount')"
            prefix="$"
            inputmode="decimal"
            :max-width="120"
            @change="(e: Event) => onDiscount(line, (e.target as HTMLInputElement).value)"
          />
        </div>
      </template>

      <template v-if="pos.lines.length">
        <v-divider class="my-4" />
        <PosCustomerPicker class="mb-4" />

        <div class="d-flex justify-space-between text-body-2 text-medium-emphasis">
          <span>{{ $t('pos.totals.subtotal') }}</span>
          <span>{{ money(pos.totals.baseCents) }}</span>
        </div>
        <div class="d-flex justify-space-between text-body-2 text-medium-emphasis mb-2">
          <span>{{ $t('pos.totals.tax') }}</span>
          <span>{{ money(pos.totals.taxCents) }}</span>
        </div>
        <div class="d-flex justify-space-between text-h5 font-weight-bold mb-4">
          <span>{{ $t('pos.totals.total') }}</span>
          <span>{{ money(pos.totals.totalCents) }}</span>
        </div>

        <v-btn block size="large" color="primary" :disabled="!pos.canCharge" @click="emit('charge')">
          {{ $t('pos.charge') }} {{ money(pos.totals.totalCents) }}
        </v-btn>
        <p v-if="!pos.point" class="text-caption text-error text-center mt-2">{{ $t('pos.setup.required') }}</p>
      </template>
    </v-card-text>
  </v-card>
</template>

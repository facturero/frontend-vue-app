<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PosCustomerPicker from '@/components/pos/PosCustomerPicker.vue';
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosStore } from '@/stores/pos';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import type { PosLine } from '@/types/pos';
import { lineTotals, parseMoneyToCents } from '@/utils/pos-totals';

/**
 * El carrito, como el panel de la caja de escritorio: cabecera con la cuenta de artículos, el cliente, las líneas con − cantidad +,
 * los totales con una fila de IVA por tarifa y el botón «Cobrar». Ancho y lado los decide el tema. A diferencia de la de escritorio,
 * el descuento es por línea (billing-service lo guarda así), no un único importe global.
 */
const emit = defineEmits<{ charge: [] }>();

const { t } = useI18n();
const pos = usePosStore();
const theme = usePosCashierThemeStore();
const { money } = usePosMoney();

const side = computed(() => theme.config.layout.cartPosition);
const width = computed(() => theme.config.layout.cartWidth);

/** Cantidad con hasta 3 decimales, sin ceros de más. */
const qty = (n: number): string => String(Math.round(n * 1000) / 1000);

function setDiscount(line: PosLine, value: string): void {
  // Un importe inválido deja el descuento en 0 en vez de quedarse con lo escrito a medias.
  pos.setDiscount(line.productId, parseMoneyToCents(value) ?? 0);
}

const rateLabel = (rate: number): string => `${t('pos.totals.vat')} ${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`;
</script>

<template>
  <aside class="pk-cart" :class="[width === 'narrow' ? 'pk-cart--narrow' : width === 'wide' ? 'pk-cart--wide' : '', side === 'left' ? 'pk-cart--left' : '']">
    <div class="pk-cart__head">
      <h2 class="pk-cart__title"><i class="mdi mdi-cart-outline" /> {{ $t('pos.cart.title') }} ({{ qty(pos.itemCount) }})</h2>
      <button v-if="pos.lines.length" type="button" class="pk-cart__clear" @click="pos.clearSale()">{{ $t('pos.cart.clear') }}</button>
    </div>

    <div class="pk-cart__list">
      <p v-if="!pos.lines.length" class="pk-empty">{{ $t('pos.cart.empty') }}</p>

      <PosCustomerPicker />

      <div v-for="line in pos.lines" :key="line.productId" class="pk-line">
        <div class="pk-grow">
          <p class="pk-line__name pk-truncate" :title="line.name">{{ line.name }}</p>
          <p class="pk-line__sub">
            <span>{{ money(line.unitPriceCents) }} {{ $t('pos.cart.each') }}</span>
            <label class="pk-line__disc">
              {{ $t('pos.cart.discount') }} $
              <input
                :value="(line.discountCents / 100).toFixed(2)"
                inputmode="decimal"
                :aria-label="$t('pos.cart.discount')"
                @change="(e) => setDiscount(line, (e.target as HTMLInputElement).value)"
              />
            </label>
          </p>
        </div>
        <div class="pk-qty">
          <button type="button" :title="$t('pos.cart.less')" :aria-label="$t('pos.cart.less')" @click="pos.setQuantity(line.productId, line.quantity - 1)"><i class="mdi mdi-minus" /></button>
          <span>{{ qty(line.quantity) }}</span>
          <button type="button" :title="$t('pos.cart.more')" :aria-label="$t('pos.cart.more')" @click="pos.setQuantity(line.productId, line.quantity + 1)"><i class="mdi mdi-plus" /></button>
        </div>
        <span class="pk-line__amount">{{ money(lineTotals(line).totalCents) }}</span>
      </div>
    </div>

    <div class="pk-cart__foot">
      <div class="pk-totals">
        <div class="pk-totals__row">
          <span>{{ $t('pos.totals.subtotal') }}</span>
          <span>{{ money(pos.totals.baseCents) }}</span>
        </div>
        <div v-if="pos.discountTotalCents > 0" class="pk-totals__row pk-totals__row--discount">
          <span>{{ $t('pos.totals.discount') }}</span>
          <span>-{{ money(pos.discountTotalCents) }}</span>
        </div>
        <div v-for="r in pos.taxRows" :key="r.ratePercent" class="pk-totals__row pk-totals__row--tax">
          <span>{{ rateLabel(r.ratePercent) }} <span class="pk-muted-70">({{ $t('pos.totals.base') }} {{ money(r.baseCents) }})</span></span>
          <span>+{{ money(r.amountCents) }}</span>
        </div>
        <div class="pk-totals__total">
          <span>{{ $t('pos.totals.total') }}</span>
          <span>{{ money(pos.totals.totalCents) }}</span>
        </div>
      </div>

      <button type="button" class="pk-btn pk-btn--primary pk-btn--lg pk-btn--block" :disabled="!pos.canCharge" @click="emit('charge')">
        <i class="mdi mdi-cash-register" /> {{ $t('pos.charge') }}
      </button>
      <p v-if="pos.lines.length && !pos.point" class="pk-error">{{ $t('pos.setup.required') }}</p>
    </div>
  </aside>
</template>

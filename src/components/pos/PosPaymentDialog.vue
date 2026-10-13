<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosStore } from '@/stores/pos';
import { PAYMENT_METHODS, type PaymentMethodCode } from '@/types/pos';
import { parseMoneyToCents } from '@/utils/pos-totals';

/**
 * «Confirmar cobro», como el modal de la caja de escritorio: el total, la forma de pago y, en efectivo, cuánto entrega el cliente
 * para ver el vuelto. «Confirmar» manda la venta; si falla (se cayó la red, billing rechazó algo) el modal sigue abierto con el
 * motivo y reintentar es seguro: la venta conserva su id, así que billing devuelve la misma factura en vez de crear otra.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const pos = usePosStore();
const { money } = usePosMoney();

const received = ref('');

const total = computed(() => pos.totals.totalCents);
const isCash = computed(() => pos.paymentMethodCode === '01');
const receivedCents = computed(() => (received.value.trim() === '' ? null : parseMoneyToCents(received.value)));
const typed = computed(() => received.value.trim() !== '');
const insufficient = computed(() => isCash.value && typed.value && (receivedCents.value === null || receivedCents.value < total.value));
const change = computed(() => (isCash.value && receivedCents.value !== null ? Math.max(0, receivedCents.value - total.value) : 0));

/** Billetes que alcanzan para pagar, de menor a mayor (los más probables al frente). */
const quick = computed(() => [5, 10, 20, 50, 100].map((d) => d * 100).filter((c) => c >= total.value).slice(0, 3));

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      received.value = '';
      pos.error = null;
    }
  },
);

function setMethod(event: Event): void {
  pos.setPaymentMethod((event.target as HTMLSelectElement).value as PaymentMethodCode);
}

function close(): void {
  if (!pos.submitting) emit('update:modelValue', false);
}

async function confirm(): Promise<void> {
  if (insufficient.value) return;
  try {
    await pos.submit(isCash.value ? receivedCents.value : null);
    emit('update:modelValue', false);
  } catch {
    // el motivo queda en pos.error y se muestra abajo; el modal sigue abierto para reintentar
  }
}
</script>

<template>
  <div v-if="modelValue" class="pk-overlay" @click.self="close" @keydown.esc="close">
    <div class="pk-modal" role="dialog" aria-modal="true" :aria-label="$t('pos.payment.title')">
      <h2 class="pk-modal__title">{{ $t('pos.payment.title') }}</h2>
      <p class="pk-modal__total">{{ money(total) }}</p>

      <label class="pk-label" for="pk-method">{{ $t('pos.payment.method') }}</label>
      <select id="pk-method" class="pk-select" :value="pos.paymentMethodCode" :disabled="pos.submitting" @change="setMethod">
        <option v-for="m in PAYMENT_METHODS" :key="m.code" :value="m.code">{{ $t(m.labelKey) }}</option>
      </select>

      <template v-if="isCash">
        <label class="pk-label" for="pk-received">{{ $t('pos.payment.received') }}</label>
        <input
          id="pk-received"
          v-model="received"
          class="pk-input"
          inputmode="decimal"
          autofocus
          autocomplete="off"
          placeholder="0.00"
          @keyup.enter="confirm"
        />
        <p v-if="insufficient" class="pk-error">{{ $t('pos.payment.insufficient') }}</p>
        <div class="pk-quick">
          <button type="button" @click="received = (total / 100).toFixed(2)">{{ $t('pos.payment.exact') }}</button>
          <button v-for="c in quick" :key="c" type="button" @click="received = (c / 100).toFixed(2)">{{ money(c) }}</button>
        </div>
        <div v-if="typed && !insufficient" class="pk-change">
          <span>{{ $t('pos.payment.change') }}</span>
          <span>{{ money(change) }}</span>
        </div>
      </template>

      <div v-if="pos.error" class="pk-banner pk-banner--err" :style="{ margin: '0 0 1rem' }" role="alert">
        <div class="pk-grow">
          <strong>{{ pos.errorIsNetwork ? $t('pos.payment.network') : pos.error }}</strong>
          <span>{{ $t('pos.payment.retryHint') }}</span>
        </div>
      </div>

      <div class="pk-modal__actions">
        <button type="button" class="pk-btn pk-btn--alt" :disabled="pos.submitting" @click="close">{{ $t('common.cancel') }}</button>
        <button type="button" class="pk-btn pk-btn--primary" :disabled="insufficient || pos.submitting || (!pos.canCharge && !pos.submitting)" @click="confirm">
          <i class="mdi mdi-cash-register" />
          {{ pos.submitting ? $t('pos.payment.processing') : pos.error ? $t('pos.payment.retry') : $t('pos.payment.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

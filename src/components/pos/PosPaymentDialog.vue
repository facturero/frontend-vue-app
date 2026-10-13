<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePosMoney } from '@/composable/usePosMoney';
import { usePosStore } from '@/stores/pos';
import { PAYMENT_METHODS, type PaymentMethodCode } from '@/types/pos';
import { parseMoneyToCents } from '@/utils/pos-totals';

/**
 * Cobro: elegir la forma de pago y, en efectivo, cuánto entrega el cliente para ver el vuelto. «Facturar» manda la venta; si
 * falla (se cayó la red, billing rechazó algo) el diálogo sigue abierto con el motivo y reintentar es seguro: la venta conserva
 * su id, así que billing devuelve la misma factura en vez de crear otra.
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

function method(code: PaymentMethodCode): void {
  pos.setPaymentMethod(code);
}

async function confirm(): Promise<void> {
  if (insufficient.value) return;
  try {
    await pos.submit(isCash.value ? receivedCents.value : null);
    emit('update:modelValue', false);
  } catch {
    // el motivo queda en pos.error y se muestra abajo; el diálogo sigue abierto para reintentar
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" :persistent="pos.submitting" @update:model-value="(v) => emit('update:modelValue', v)">
    <v-card>
      <v-card-title>{{ $t('pos.payment.title') }}</v-card-title>
      <v-card-text>
        <div class="d-flex justify-space-between align-baseline text-h5 font-weight-bold mb-4">
          <span>{{ $t('pos.totals.total') }}</span>
          <span>{{ money(total) }}</span>
        </div>

        <div class="d-flex flex-wrap ga-2 mb-4">
          <v-btn
            v-for="m in PAYMENT_METHODS"
            :key="m.code"
            :prepend-icon="m.icon"
            :variant="pos.paymentMethodCode === m.code ? 'flat' : 'tonal'"
            :color="pos.paymentMethodCode === m.code ? 'primary' : undefined"
            :disabled="pos.submitting"
            @click="method(m.code)"
          >
            {{ $t(m.labelKey) }}
          </v-btn>
        </div>

        <template v-if="isCash">
          <v-text-field
            v-model="received"
            :label="$t('pos.payment.received')"
            prefix="$"
            inputmode="decimal"
            autofocus
            :error-messages="insufficient ? [$t('pos.payment.insufficient')] : []"
            @keyup.enter="confirm"
          />
          <div class="d-flex flex-wrap ga-2 mt-2">
            <v-btn size="small" variant="tonal" @click="received = (total / 100).toFixed(2)">{{ $t('pos.payment.exact') }}</v-btn>
            <v-btn v-for="c in quick" :key="c" size="small" variant="tonal" @click="received = (c / 100).toFixed(2)">{{ money(c) }}</v-btn>
          </div>
          <div v-if="typed && !insufficient" class="d-flex justify-space-between text-h6 mt-4">
            <span>{{ $t('pos.payment.change') }}</span>
            <span class="text-success">{{ money(change) }}</span>
          </div>
        </template>

        <v-alert v-if="pos.error" type="error" class="mt-4">
          <div>{{ pos.errorIsNetwork ? $t('pos.payment.network') : pos.error }}</div>
          <div class="text-caption">{{ $t('pos.payment.retryHint') }}</div>
        </v-alert>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" :disabled="pos.submitting" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="tonal" :loading="pos.submitting" :disabled="insufficient || (!pos.canCharge && !pos.submitting)" @click="confirm">
          {{ pos.error ? $t('pos.payment.retry') : $t('pos.payment.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

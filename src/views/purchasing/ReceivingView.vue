<script setup lang="ts">
/**
 * Recepción de mercadería de una orden: qué se pidió, qué llegó y qué falta por facturar, línea a línea. Desde aquí se registra la
 * entrega del proveedor (dentro de la tolerancia que la empresa fija en ajustes) y se cierra lo que ya no llegará. Qué botones
 * aparecen depende del estado y de los permisos (`receivingActions`); el servidor vuelve a comprobarlo: ocultar un botón no es seguridad.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import { ORDER_STATUS_COLOR, parseQuantityMicros, receivingActions } from '@/utils/purchasing';
import { todayIso } from '@/utils/taxDocuments';
import type { OrderReceivingLine } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = usePurchasingStore();

const id = computed(() => route.params.id as string);
const order = computed(() => store.current);
const tracking = computed(() => store.receiving);
const actions = computed(() => (order.value ? receivingActions(order.value, (p) => auth.can(p)) : null));
const canBill = computed(() => auth.can('purchase_bill:create'));

const toleranceBp = computed(() => store.settings?.overReceiptToleranceBp ?? 0);
const tolerancePct = computed(() => toleranceBp.value / 100);

/** El seguimiento trae las cantidades; la descripción vive en la línea de la orden. */
const rows = computed(() => {
  const description = new Map((order.value?.lines ?? []).map((l) => [l.id, l.description]));
  return (tracking.value?.lines ?? []).map((line) => ({ ...line, description: description.get(line.lineId) ?? '—' }));
});

const headers = computed(() => [
  { title: t('common.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('purchasing.receiving.ordered'), key: 'ordered', sortable: false, align: 'end' as const },
  { title: t('purchasing.receiving.received'), key: 'received', sortable: false, align: 'end' as const },
  { title: t('purchasing.receiving.pending'), key: 'pending', sortable: false, align: 'end' as const },
  { title: t('purchasing.receiving.billed'), key: 'billed', sortable: false, align: 'end' as const },
]);

const nothingPending = computed(() => rows.value.every((line) => (parseQuantityMicros(line.pending) ?? 0n) === 0n));
const clearError = (): void => {
  store.error = null;
};

onMounted(async () => {
  store.error = null;
  await Promise.all([store.fetchOrder(id.value), store.fetchReceiving(id.value), store.fetchSettings()]);
});

// ── Registrar recepción ──────────────────────────────────────────────────────
const receiveDialog = ref(false);
const receiptDate = ref(todayIso());
const deliveryRef = ref('');
const quantities = ref<Record<string, string>>({});
const receiveError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

const entered = (line: OrderReceivingLine) => parseQuantityMicros(quantities.value[line.lineId] ?? '') ?? 0n;
const pendingOf = (line: OrderReceivingLine) => parseQuantityMicros(line.pending) ?? 0n;
/** Más de lo pendiente pero todavía dentro de la tolerancia: se avisa, no se bloquea. */
const overPending = (line: OrderReceivingLine) => entered(line) > pendingOf(line);

/** Lo máximo que admite el servidor para esta línea: lo pedido más la tolerancia, menos lo ya recibido. */
function maxNew(line: OrderReceivingLine): bigint {
  const ordered = parseQuantityMicros(line.ordered) ?? 0n;
  const received = parseQuantityMicros(line.received) ?? 0n;
  const limit = ordered + (ordered * BigInt(toleranceBp.value)) / 10000n - received;
  return limit > 0n ? limit : 0n;
}

const overTolerance = computed(() => rows.value.some((line) => entered(line) > maxNew(line)));
const anyEntered = computed(() => rows.value.some((line) => entered(line) > 0n));
const receiveValid = computed(() => receiptDate.value !== '' && anyEntered.value && !overTolerance.value);

function openReceive(): void {
  receiptDate.value = todayIso();
  deliveryRef.value = '';
  // Se precarga lo pendiente: lo normal es recibir exactamente lo que falta; si llega de más, se corrige aquí.
  quantities.value = Object.fromEntries(rows.value.map((line) => [line.lineId, line.pending]));
  receiveError.value = null;
  receiveDialog.value = true;
}

async function confirmReceive(): Promise<void> {
  if (!receiveValid.value) return;
  receiveError.value = null;
  try {
    const result = await store.receiveOrder(id.value, {
      receiptDate: receiptDate.value,
      supplierDeliveryRef: deliveryRef.value.trim() || null,
      lines: rows.value
        .filter((line) => entered(line) > 0n)
        .map((line) => ({ orderLineId: line.lineId, quantity: (quantities.value[line.lineId] ?? '').trim().replace(',', '.') })),
    });
    receiveDialog.value = false;
    snackbar.value = t('purchasing.receiving.done', { number: result.receiptNumber });
    await Promise.all([store.fetchOrder(id.value), store.fetchReceiving(id.value)]);
  } catch {
    receiveError.value = store.error;
  }
}

// ── Cerrar lo pendiente ──────────────────────────────────────────────────────
const closeDialog = ref(false);
const closeReason = ref('');
const closeError = ref<string | null>(null);
const closeValid = computed(() => closeReason.value.trim().length >= 5);

function openClose(): void {
  closeReason.value = '';
  closeError.value = null;
  closeDialog.value = true;
}

async function confirmClose(): Promise<void> {
  if (!closeValid.value) return;
  closeError.value = null;
  try {
    await store.closeOrder(id.value, closeReason.value.trim());
    closeDialog.value = false;
    snackbar.value = t('purchasing.receiving.closed');
    await store.fetchOrder(id.value);
  } catch {
    closeError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader
      :title="$t('purchasing.receiving.title')"
      :subtitle="order ? `${$t('purchasing.orders.singular')} ${order.number ?? $t('purchasing.orders.draft')}` : undefined"
    >
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push({ name: 'purchasing-order', params: { id } })">{{ $t('common.back') }}</v-btn>
        <v-btn v-if="actions?.receive" color="primary" prepend-icon="mdi-tray-arrow-down" @click="openReceive">{{ $t('purchasing.receiving.receive') }}</v-btn>
        <v-btn
          v-if="canBill"
          variant="tonal"
          prepend-icon="mdi-file-document-outline"
          @click="router.push({ name: 'purchasing-bill-new', query: { order: id } })"
        >
          {{ $t('purchasing.receiving.registerBill') }}
        </v-btn>
        <v-btn v-if="actions?.close" variant="text" color="error" prepend-icon="mdi-check-circle-outline" @click="openClose">
          {{ $t('purchasing.receiving.close') }}
        </v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-progress-linear v-if="store.loading" indeterminate class="mb-4" />
    <v-alert v-if="!order && !store.loading && store.error" type="error" class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="store.error && order && !receiveDialog && !closeDialog" type="error" closable class="mb-4" @click:close="clearError">{{ store.error }}</v-alert>

    <template v-if="order">
      <v-card>
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ order.number ?? $t('purchasing.orders.draft') }}
          <v-chip :color="ORDER_STATUS_COLOR[order.status]" variant="flat" size="small">{{ $t(`purchasing.status.${order.status}`) }}</v-chip>
          <v-spacer />
          <span class="text-body-2 text-medium-emphasis">{{ $t('purchasing.receiving.toleranceLabel', { pct: tolerancePct }) }}</span>
        </v-card-title>
        <v-card-text>
          <v-alert v-if="order.status === 'closed'" type="info" class="mb-4">{{ $t('purchasing.receiving.closedHint') }}</v-alert>
          <v-alert v-else-if="nothingPending" type="success" class="mb-4">{{ $t('purchasing.receiving.nothingPending') }}</v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('purchasing.receiving.intro') }}</p>

          <v-data-table :headers="headers" :items="rows" :loading="store.loading" :items-per-page="-1" hide-default-footer>
            <template #no-data>{{ $t('purchasing.receiving.noLines') }}</template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="receiveDialog" max-width="720">
      <v-card>
        <v-card-title>{{ $t('purchasing.receiving.dialogTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="receiveError" type="error" class="mb-4">{{ receiveError }}</v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('purchasing.receiving.dialogIntro') }}</p>
          <v-row class="mb-2">
            <v-col cols="12" sm="6">
              <v-text-field v-model="receiptDate" type="date" :label="$t('purchasing.receiving.receiptDate')" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="deliveryRef" :label="$t('purchasing.receiving.deliveryRef')" />
            </v-col>
          </v-row>

          <v-table v-if="rows.length">
            <thead>
              <tr>
                <th class="text-start">{{ $t('common.description') }}</th>
                <th class="text-end">{{ $t('purchasing.receiving.pending') }}</th>
                <th class="text-end">{{ $t('purchasing.receiving.quantity') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in rows" :key="line.lineId">
                <td>{{ line.description }}</td>
                <td class="text-end">{{ line.pending }}</td>
                <td>
                  <v-text-field
                    v-model="quantities[line.lineId]"
                    inputmode="decimal"
                    :error-messages="overPending(line) ? $t('purchasing.receiving.overHint') : undefined"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>

          <v-alert v-if="overTolerance" type="warning" class="mt-4">
            {{ $t('purchasing.receiving.toleranceLabel', { pct: tolerancePct }) }}
          </v-alert>
          <v-alert v-else-if="!anyEntered" type="info" class="mt-4">{{ $t('purchasing.receiving.noLines') }}</v-alert>
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="receiveDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!receiveValid" @click="confirmReceive">{{ $t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="closeDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('purchasing.receiving.closeTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="closeError" type="error" class="mb-4">{{ closeError }}</v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('purchasing.receiving.closeHint') }}</p>
          <v-textarea v-model="closeReason" :label="$t('purchasing.receiving.closeReason')" :hint="$t('purchasing.receiving.reasonMin')" persistent-hint rows="3" auto-grow maxlength="300" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="closeDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" :disabled="!closeValid" @click="confirmClose">{{ $t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

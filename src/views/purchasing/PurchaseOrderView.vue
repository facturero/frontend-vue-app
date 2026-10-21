<script setup lang="ts">
/**
 * Detalle de una orden de compra y las decisiones sobre ella: enviar, aprobar, rechazar, reabrir y cancelar. Qué botones aparecen
 * depende del estado y de los permisos (`orderActions`); el servidor vuelve a comprobarlo todo: ocultar un botón no es seguridad.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { ORDER_STATUS_COLOR, orderActions, RECEIVING_VISIBLE_STATUSES } from '@/utils/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = usePurchasingStore();

const id = computed(() => route.params.id as string);
const order = computed(() => store.current);
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

const userId = computed(() => (auth.user as { id?: string } | null)?.id ?? null);
const actions = computed(() => (order.value ? orderActions(order.value, (p) => auth.can(p), userId.value) : null));
/** Aprobada en adelante ya hay (o puede haber) recepciones: se abre el seguimiento por línea. */
const canSeeReceiving = computed(() => !!order.value && RECEIVING_VISIBLE_STATUSES.includes(order.value.status));
const money = (cents: number) => formatMoney(cents, locale.value, order.value?.currencyCode ?? 'USD');
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** `AAAA-MM-DD` → fecha legible sin pasar por la zona horaria. */
function day(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

const lineHeaders = computed(() => [
  { title: '#', key: 'lineNumber', sortable: false, align: 'start' as const },
  { title: t('common.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('invoices.quantity'), key: 'quantity', sortable: false, align: 'end' as const },
  { title: t('purchasing.form.unitCost'), key: 'unitCostCents', sortable: false, align: 'end' as const },
  { title: t('invoices.discount'), key: 'discountCents', sortable: false, align: 'end' as const },
  { title: t('purchasing.form.vat'), key: 'taxPercent', sortable: false, align: 'end' as const },
  { title: t('invoices.total'), key: 'totalCents', sortable: false, align: 'end' as const },
]);

onMounted(async () => {
  store.error = null;
  await store.fetchOrder(id.value);
});

async function run(work: () => Promise<unknown>, message: string): Promise<void> {
  actionError.value = null;
  try {
    await work();
    snackbar.value = t(message);
  } catch {
    actionError.value = store.error;
  }
}

const submit = () => run(() => store.transition('submit', id.value), 'purchasing.orders.submitted');
const approve = () => run(() => store.transition('approve', id.value), 'purchasing.orders.approved');
const reopen = () => run(() => store.transition('reopen', id.value), 'purchasing.orders.reopened');

// Rechazar y cancelar piden un motivo.
const reasonDialog = ref<'reject' | 'cancel' | null>(null);
const reason = ref('');
const reasonValid = computed(() => reason.value.trim().length >= 3);

function askReason(kind: 'reject' | 'cancel'): void {
  reason.value = '';
  actionError.value = null;
  reasonDialog.value = kind;
}

async function confirmReason(): Promise<void> {
  const kind = reasonDialog.value;
  if (!kind || !reasonValid.value) return;
  await run(() => store.transitionWithReason(kind, id.value, reason.value.trim()), kind === 'reject' ? 'purchasing.orders.rejected' : 'purchasing.orders.cancelled');
  if (!actionError.value) reasonDialog.value = null;
}
</script>

<template>
  <v-container>
    <PageHeader
      :title="$t('purchasing.title')"
      :subtitle="order ? `${$t('purchasing.orders.singular')} ${order.number ?? $t('purchasing.orders.draft')}` : undefined"
    >
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push({ name: 'purchasing-orders' })">{{ $t('common.back') }}</v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-progress-linear v-if="store.loading" indeterminate class="mb-4" />
    <v-alert v-if="!order && !store.loading && store.error" type="error" class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="actionError && !reasonDialog" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <template v-if="order && actions">
      <v-card class="mb-4">
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ order.number ?? $t('purchasing.orders.draft') }}
          <v-chip :color="ORDER_STATUS_COLOR[order.status]" variant="flat" size="small">{{ $t(`purchasing.status.${order.status}`) }}</v-chip>
          <v-spacer />
          <div class="d-flex flex-wrap ga-2">
            <v-btn v-if="canSeeReceiving" variant="tonal" prepend-icon="mdi-tray-arrow-down" @click="router.push({ name: 'purchasing-order-receiving', params: { id } })">{{ $t('purchasing.receiving.track') }}</v-btn>
            <v-btn v-if="actions.edit" variant="tonal" prepend-icon="mdi-pencil" @click="router.push({ name: 'purchasing-order-edit', params: { id } })">{{ $t('common.edit') }}</v-btn>
            <v-btn v-if="actions.submit" color="primary" prepend-icon="mdi-send-outline" :loading="store.saving" @click="submit">{{ $t('purchasing.orders.submit') }}</v-btn>
            <v-btn v-if="actions.approve" color="success" prepend-icon="mdi-check" :loading="store.saving" @click="approve">{{ $t('purchasing.orders.approve') }}</v-btn>
            <v-btn v-if="actions.reject" variant="tonal" color="error" prepend-icon="mdi-close" @click="askReason('reject')">{{ $t('purchasing.orders.reject') }}</v-btn>
            <v-btn v-if="actions.reopen" variant="tonal" prepend-icon="mdi-restore" :loading="store.saving" @click="reopen">{{ $t('purchasing.orders.reopen') }}</v-btn>
            <v-btn v-if="actions.cancel" variant="text" color="error" prepend-icon="mdi-cancel" @click="askReason('cancel')">{{ $t('purchasing.orders.cancel') }}</v-btn>
          </div>
        </v-card-title>
        <v-card-text>
          <v-alert v-if="order.status === 'pending_approval'" type="info" class="mb-4">{{ $t('purchasing.orders.pendingHint') }}</v-alert>
          <v-alert v-if="order.status === 'rejected'" type="warning" class="mb-4">
            {{ $t('purchasing.orders.rejectedHint', { reason: order.rejectionReason ?? '' }) }}
          </v-alert>
          <v-alert v-if="order.status === 'cancelled'" type="error" class="mb-4">
            {{ $t('purchasing.orders.cancelledHint', { reason: order.cancelReason ?? '' }) }}
          </v-alert>

          <v-row>
            <v-col cols="12" md="4">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.orders.supplier') }}</div>
              <div>{{ order.supplier.legalName }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ order.supplier.identification }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.form.orderDate') }}</div>
              <div>{{ day(order.orderDate) }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.form.expectedDate') }}</div>
              <div>{{ day(order.expectedDate) }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.suppliers.creditDays') }}</div>
              <div>{{ order.paymentTermDays === 0 ? $t('purchasing.suppliers.cash') : $t('purchasing.suppliers.days', { n: order.paymentTermDays }) }}</div>
            </v-col>
            <v-col v-if="order.notes" cols="12">
              <div class="text-body-2 text-medium-emphasis">{{ $t('common.notes') }}</div>
              <div>{{ order.notes }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.orders.lines') }}</v-card-title>
        <v-data-table :headers="lineHeaders" :items="order.lines ?? []" :items-per-page="-1" hide-default-footer>
          <template #item.unitCostCents="{ item }">{{ money(item.unitCostCents) }}</template>
          <template #item.discountCents="{ item }">{{ money(item.discountCents) }}</template>
          <template #item.taxPercent="{ item }">{{ Number(item.taxPercent) }}%</template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents) }}</template>
        </v-data-table>
        <v-card-text class="d-flex flex-column align-end ga-2">
          <div>{{ $t('invoices.subtotal') }}: {{ money(order.subtotalCents) }}</div>
          <div>{{ $t('invoices.taxTotal') }}: {{ money(order.taxCents) }}</div>
          <div class="text-h6">{{ $t('invoices.total') }}: {{ money(order.totalCents) }}</div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title class="text-h6">{{ $t('purchasing.orders.history') }}</v-card-title>
        <v-card-text>
          <div>{{ $t('purchasing.orders.createdAt') }}: {{ date(order.createdAt) }}</div>
          <div v-if="order.submittedAt">{{ $t('purchasing.orders.submittedAt') }}: {{ date(order.submittedAt) }}</div>
          <div v-if="order.approvedAt">
            {{ $t('purchasing.orders.approvedAt') }}: {{ date(order.approvedAt) }}
            <span v-if="order.approvedByPolicy" class="text-medium-emphasis"> · {{ $t('purchasing.orders.byPolicy') }}</span>
          </div>
          <div v-if="order.cancelledAt">{{ $t('purchasing.orders.cancelledAt') }}: {{ date(order.cancelledAt) }}</div>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog :model-value="reasonDialog !== null" max-width="520" @update:model-value="reasonDialog = null">
      <v-card>
        <v-card-title>{{ $t(reasonDialog === 'reject' ? 'purchasing.orders.rejectTitle' : 'purchasing.orders.cancelTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" class="mb-4">{{ actionError }}</v-alert>
          <v-textarea v-model="reason" :label="$t('purchasing.orders.reason')" counter="300" maxlength="300" rows="3" auto-grow />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="reasonDialog = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" :disabled="!reasonValid" @click="confirmReason">{{ $t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

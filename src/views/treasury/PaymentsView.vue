<script setup lang="ts">
/**
 * Pagos a proveedores. Un pago nace en borrador (no toca saldos ni gasta número) y al contabilizarse recibe su `PG-AAAA-NNNNNN`, baja lo
 * que se debe y genera su asiento. Con un umbral de aprobación definido, un pago que lo alcanza necesita que OTRA persona lo apruebe.
 * El umbral solo lo ve y lo cambia quien tiene `payment:approve` (el Administrador): nace apagado.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryPayablesStore } from '@/stores/treasuryPayables';
import { centsToInput, formatMoney } from '@/utils/accounting';
import { parseApprovalThreshold, PAYMENT_STATUS_COLOR } from '@/utils/treasury-payments';
import { PAYMENT_STATUSES, type Payment, type PaymentStatus } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useTreasuryPayablesStore();

const canCreate = computed(() => auth.can('payment:create'));
const canApprove = computed(() => auth.can('payment:approve'));
const search = ref('');
const status = ref<PaymentStatus | null>(null);
const from = ref('');
const to = ref('');
const pages = computed(() => Math.max(1, Math.ceil(store.paymentsTotal / store.pageSize)));

const headers = computed(() => [
  { title: t('treasury.payments.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('treasury.payments.date'), key: 'paymentDate', sortable: false, align: 'start' as const },
  { title: t('treasury.payments.supplier'), key: 'supplierName', sortable: false, align: 'start' as const },
  { title: t('treasury.payments.method'), key: 'method', sortable: false, align: 'start' as const },
  { title: t('treasury.payments.paid'), key: 'totalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.payments.applied'), key: 'appliedCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const statusItems = computed(() => PAYMENT_STATUSES.map((value) => ({ value, title: t(`treasury.payments.status.${value}`) })));

const load = (page = 1) =>
  store.fetchPayments({ q: search.value || undefined, status: status.value ? [status.value] : undefined, from: from.value || undefined, to: to.value || undefined, page });

let timer: ReturnType<typeof setTimeout> | null = null;
watch([search, status, from, to], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(1), 300);
});
onMounted(() => {
  void load(1);
  if (canApprove.value) void store.fetchSettings();
});

const open = (payment: Payment) => router.push({ name: 'treasury-payment', params: { id: payment.id } });
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);

// ── Umbral de aprobación (solo quien tiene `payment:approve`) ──
const dialog = ref(false);
const threshold = ref('');
const thresholdError = ref<string | null>(null);
const parsed = computed(() => parseApprovalThreshold(threshold.value));
const snackbar = ref<string | null>(null);

function openThreshold(): void {
  threshold.value = store.settings?.approvalThresholdCents != null ? centsToInput(store.settings.approvalThresholdCents) : '';
  thresholdError.value = null;
  dialog.value = true;
}

async function saveThreshold(): Promise<void> {
  if (parsed.value === undefined) return;
  thresholdError.value = null;
  try {
    await store.saveSettings(parsed.value);
    dialog.value = false;
    snackbar.value = t('treasury.payments.thresholdSaved');
  } catch {
    thresholdError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.payments.intro')">
      <template #actions>
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" :to="{ name: 'treasury-payment-new' }">{{ $t('treasury.payments.new') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !dialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card v-if="canApprove" class="mb-4">
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.payments.approvalTitle') }}
        <v-spacer />
        <v-btn variant="tonal" size="small" prepend-icon="mdi-pencil-outline" @click="openThreshold">{{ $t('common.edit') }}</v-btn>
      </v-card-title>
      <v-card-text>
        <div v-if="store.settings?.approvalThresholdCents != null">
          {{ $t('treasury.payments.approvalOn', { amount: money(store.settings.approvalThresholdCents) }) }}
        </div>
        <div v-else class="text-medium-emphasis">{{ $t('treasury.payments.approvalOff') }}</div>
        <div class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.payments.approvalHint') }}</div>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="search" :label="$t('treasury.payments.search')" prepend-inner-icon="mdi-magnify" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="status" :items="statusItems" :label="$t('common.status')" clearable />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="from" type="date" :label="$t('treasury.payments.from')" />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="to" type="date" :label="$t('treasury.payments.to')" />
          </v-col>
        </v-row>

        <v-data-table :headers="headers" :items="store.payments" :loading="store.loading" :items-per-page="-1" hide-default-footer @click:row="(_: Event, { item }: { item: Payment }) => open(item)">
          <template #item.number="{ item }">{{ item.number ?? $t('treasury.payments.draft') }}</template>
          <template #item.supplierName="{ item }">
            {{ item.supplierName }}
            <div v-if="item.supplierIdentification" class="text-body-2 text-medium-emphasis">{{ item.supplierIdentification }}</div>
          </template>
          <template #item.method="{ item }">
            {{ $t(`treasury.payments.methods.${item.method}`) }}
            <div v-if="item.reference" class="text-body-2 text-medium-emphasis">{{ item.reference }}</div>
          </template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents, item.currencyCode) }}</template>
          <template #item.appliedCents="{ item }">
            {{ money(item.appliedCents, item.currencyCode) }}
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.lines', { n: item.lineCount }) }}</div>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="PAYMENT_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.payments.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.payments.empty') }}</template>
        </v-data-table>

        <div v-if="pages > 1" class="d-flex justify-center mt-4">
          <v-pagination :model-value="store.paymentsPage" :length="pages" density="comfortable" @update:model-value="load" />
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.payments.thresholdTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="thresholdError" type="error" class="mb-4">{{ thresholdError }}</v-alert>
          <v-text-field
            v-model="threshold"
            :label="$t('treasury.payments.threshold')"
            :hint="$t('treasury.payments.thresholdHint')"
            :error="parsed === undefined"
            :error-messages="parsed === undefined ? $t('treasury.payments.thresholdInvalid') : undefined"
            persistent-hint
            inputmode="decimal"
          />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="parsed === undefined" @click="saveThreshold">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

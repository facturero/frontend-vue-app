<script setup lang="ts">
/**
 * Detalle de una factura de compra con la conciliación a tres vías: lo pedido, lo recibido y lo facturado. Desde aquí se
 * contabiliza, se aprueba con excepción y se anula. Qué botones aparecen depende del estado y de los
 * permisos (`billActions`); el servidor vuelve a comprobarlo: ocultar un botón no es seguridad.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { billActions, BILL_STATUS_COLOR, MATCH_STATUS_COLOR } from '@/utils/purchasing';
import type { MatchReason, PurchaseBill } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = usePurchasingStore();

const id = computed(() => route.params.id as string);
const bill = computed(() => store.currentBill);
const userId = computed(() => (auth.user as { id?: string } | null)?.id ?? null);
const actions = computed(() => (bill.value ? billActions(bill.value, (p) => auth.can(p), userId.value) : null));
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

const money = (cents: number) => formatMoney(cents, locale.value, bill.value?.currencyCode ?? 'USD');
const documentOf = (b: PurchaseBill) => `${b.establishment}-${b.emissionPoint}-${b.sequential}`;

/** `AAAA-MM-DD` → fecha legible sin pasar por la zona horaria. */
function day(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

/** La razón llega con un código; si la traducción no existe, se muestra el detalle del servidor. */
function reasonLabel(reason: MatchReason): string {
  const key = `purchasing.bills.reasons.${reason.code}`;
  const label = t(key);
  return label === key ? reason.detail : label;
}

const matchMessage = computed(() => {
  const b = bill.value;
  if (!b) return '';
  if (b.matchStatus === 'not_applicable') return t('purchasing.bills.matchNone');
  if (b.matchStatus === 'overridden') return t('purchasing.bills.matchOverridden', { reason: b.overrideReason ?? '' });
  if (b.matchStatus === 'matched') return t('purchasing.bills.matchOk');
  return t('purchasing.bills.blockedHint');
});

const lineHeaders = computed(() => [
  { title: '#', key: 'lineNumber', sortable: false, align: 'start' as const },
  { title: t('common.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('invoices.quantity'), key: 'quantity', sortable: false, align: 'end' as const },
  { title: t('purchasing.bills.unitCost'), key: 'unitCostCents', sortable: false, align: 'end' as const },
  { title: t('invoices.discount'), key: 'discountCents', sortable: false, align: 'end' as const },
  { title: t('purchasing.bills.taxPct'), key: 'taxRatePct', sortable: false, align: 'end' as const },
  { title: t('invoices.taxTotal'), key: 'taxCents', sortable: false, align: 'end' as const },
  { title: t('purchasing.bills.variance'), key: 'priceVarianceCents', sortable: false, align: 'end' as const },
  { title: t('invoices.total'), key: 'totalCents', sortable: false, align: 'end' as const },
]);

onMounted(async () => {
  store.error = null;
  await store.fetchBill(id.value);
});

// ── Contabilizar ─────────────────────────────────────────────────────────────
async function post(): Promise<void> {
  actionError.value = null;
  try {
    const updated = await store.postBill(id.value);
    snackbar.value = t(updated.matchStatus === 'blocked' ? 'purchasing.bills.blockedNow' : 'purchasing.bills.postedOk');
  } catch {
    actionError.value = store.error;
  }
}

// ── Aprobar con excepción y anular (piden motivo) ────────────────────────────
const overrideDialog = ref(false);
const overrideReason = ref('');
const overrideValid = computed(() => overrideReason.value.trim().length >= 5);

function askOverride(): void {
  overrideReason.value = '';
  actionError.value = null;
  overrideDialog.value = true;
}

async function confirmOverride(): Promise<void> {
  if (!overrideValid.value) return;
  actionError.value = null;
  try {
    await store.overrideBill(id.value, overrideReason.value.trim());
    overrideDialog.value = false;
    snackbar.value = t('purchasing.bills.overridden');
  } catch {
    actionError.value = store.error;
  }
}

const voidDialog = ref(false);
const voidReason = ref('');
const voidValid = computed(() => voidReason.value.trim().length >= 5);

function askVoid(): void {
  voidReason.value = '';
  actionError.value = null;
  voidDialog.value = true;
}

async function confirmVoid(): Promise<void> {
  if (!voidValid.value) return;
  actionError.value = null;
  try {
    await store.voidBill(id.value, voidReason.value.trim());
    voidDialog.value = false;
    snackbar.value = t('purchasing.bills.voided');
  } catch {
    actionError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="bill ? `${$t('purchasing.bills.singular')} ${bill.internalNumber ?? ''}` : undefined">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push({ name: 'purchasing-bills' })">{{ $t('common.back') }}</v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-progress-linear v-if="store.loading" indeterminate class="mb-4" />
    <v-alert v-if="!bill && !store.loading && store.error" type="error" class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="actionError && !overrideDialog && !voidDialog" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <template v-if="bill && actions">
      <v-card class="mb-4">
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ bill.internalNumber ?? documentOf(bill) }}
          <v-chip :color="BILL_STATUS_COLOR[bill.status]" variant="flat" size="small">{{ $t(`purchasing.bills.status.${bill.status}`) }}</v-chip>
          <v-chip :color="MATCH_STATUS_COLOR[bill.matchStatus]" variant="flat" size="small">{{ $t(`purchasing.bills.match.${bill.matchStatus}`) }}</v-chip>
          <v-spacer />
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-if="bill.purchaseOrderId"
              variant="text"
              prepend-icon="mdi-clipboard-list-outline"
              @click="router.push({ name: 'purchasing-order', params: { id: bill.purchaseOrderId! } })"
            >
              {{ $t('purchasing.bills.viewOrder') }}
            </v-btn>
            <v-btn v-if="actions.edit" variant="tonal" prepend-icon="mdi-pencil" @click="router.push({ name: 'purchasing-bill-edit', params: { id } })">
              {{ $t('common.edit') }}
            </v-btn>
            <v-btn v-if="actions.post" color="primary" prepend-icon="mdi-check" :loading="store.saving" @click="post">{{ $t('purchasing.bills.post') }}</v-btn>
            <v-btn v-if="actions.override" variant="tonal" color="warning" prepend-icon="mdi-shield-check-outline" @click="askOverride">
              {{ $t('purchasing.bills.override') }}
            </v-btn>
            <v-btn v-if="actions.void" variant="text" color="error" prepend-icon="mdi-cancel" @click="askVoid">{{ $t('purchasing.bills.void') }}</v-btn>
          </div>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.orders.supplier') }}</div>
              <div>{{ bill.supplier?.legalName ?? '—' }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ bill.supplier?.identification }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.bills.docType') }}</div>
              <div>{{ $t(`purchasing.bills.docTypes.${bill.docType}`) }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.bills.supplierDocument') }}</div>
              <div>{{ documentOf(bill) }}</div>
            </v-col>
            <v-col cols="12" md="4">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.bills.authorization') }}</div>
              <div>{{ bill.authorizationNumber ?? '—' }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.bills.issueDate') }}</div>
              <div>{{ day(bill.issueDate) }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('purchasing.bills.dueDate') }}</div>
              <div>{{ day(bill.dueDate) }}</div>
            </v-col>
            <v-col cols="6" md="2">
              <div class="text-body-2 text-medium-emphasis">{{ $t('products.currency') }}</div>
              <div>{{ bill.currencyCode }}</div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.bills.matchPanel') }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ matchMessage }}</p>
          <div v-if="bill.matchReasons.length" class="d-flex flex-column ga-2">
            <div v-for="(reason, i) in bill.matchReasons" :key="i" class="d-flex align-start ga-2">
              <v-icon icon="mdi-alert-circle-outline" size="small" />
              <div>
                <div>{{ reasonLabel(reason) }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ reason.detail }}</div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.bills.lines') }}</v-card-title>
        <v-data-table :headers="lineHeaders" :items="bill.lines" :items-per-page="-1" hide-default-footer>
          <template #item.unitCostCents="{ item }">{{ money(item.unitCostCents) }}</template>
          <template #item.discountCents="{ item }">{{ money(item.discountCents) }}</template>
          <template #item.taxRatePct="{ item }">{{ Number(item.taxRatePct) }}%</template>
          <template #item.taxCents="{ item }">{{ money(item.taxCents) }}</template>
          <template #item.priceVarianceCents="{ item }">{{ money(item.priceVarianceCents) }}</template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents) }}</template>
        </v-data-table>
        <v-card-text class="d-flex flex-column align-end ga-2">
          <div>{{ $t('invoices.subtotal') }}: {{ money(bill.subtotalCents) }}</div>
          <div>{{ $t('invoices.taxTotal') }}: {{ money(bill.taxCents) }}</div>
          <div class="text-h6">{{ $t('invoices.total') }}: {{ money(bill.totalCents) }}</div>
          <div v-if="bill.supplierTotalCents != null">{{ $t('purchasing.bills.supplierTotal') }}: {{ money(bill.supplierTotalCents) }}</div>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="overrideDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('purchasing.bills.overrideTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" class="mb-4">{{ actionError }}</v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('purchasing.bills.overrideHint') }}</p>
          <v-textarea v-model="overrideReason" :label="$t('purchasing.bills.reason')" :hint="$t('purchasing.bills.reasonMin')" persistent-hint rows="3" auto-grow maxlength="300" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="overrideDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!overrideValid" @click="confirmOverride">{{ $t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="voidDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('purchasing.bills.voidTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="actionError" type="error" class="mb-4">{{ actionError }}</v-alert>
          <v-textarea v-model="voidReason" :label="$t('purchasing.bills.reason')" :hint="$t('purchasing.bills.reasonMin')" persistent-hint rows="3" auto-grow maxlength="300" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="voidDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" :disabled="!voidValid" @click="confirmVoid">{{ $t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

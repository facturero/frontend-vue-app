<script setup lang="ts">
/**
 * Un pago: a qué facturas se aplicó, cuánto salió y de dónde, el anticipo que dejó o consumió, y su historia (quién lo creó, quién lo
 * aprobó, quién lo contabilizó y, si se anuló, quién y por qué). Un borrador se edita, se aprueba (otra persona, si llega al umbral) o se
 * contabiliza; uno contabilizado ya no se edita: se anula (con motivo, solo el Administrador) y se rehace. Anular NO borra nada: la
 * aplicación queda en la historia y contabilidad reversa el asiento.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryPayablesStore } from '@/stores/treasuryPayables';
import { formatMoney } from '@/utils/accounting';
import { paymentActions, PAYMENT_STATUS_COLOR } from '@/utils/treasury-payments';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useTreasuryPayablesStore();

const paymentId = computed(() => route.params.id as string);
const payment = computed(() => store.currentPayment);
const threshold = computed(() => store.settings?.approvalThresholdCents ?? null);
const actions = computed(() =>
  payment.value
    ? paymentActions(payment.value, { can: (p) => auth.can(p), userId: auth.user?.id ?? null, thresholdCents: threshold.value })
    : { edit: false, approve: false, post: false, void: false, awaitingApproval: false },
);
/** Quien no gestiona el umbral no lo conoce: si el servidor ya dijo que falta la aprobación (o el pago está aprobado) se muestra el aviso. */
const needsApprovalNotice = computed(() => payment.value?.status === 'draft' && (actions.value.awaitingApproval || route.query.approval === '1'));
const snackbar = ref<string | null>(null);
const actionError = ref<string | null>(null);

const money = (cents: number) => formatMoney(cents, locale.value, payment.value?.currencyCode ?? 'USD');
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale.value) : '—');

onMounted(async () => {
  await store.fetchPayment(paymentId.value);
  if (auth.can('payment:approve')) await store.fetchSettings();
  // Las líneas solo traen el id de la factura: el estado de cuenta del proveedor las nombra (número de factura, vencimiento).
  if (store.currentPayment) await store.fetchSupplier(store.currentPayment.supplierId);
});

function debtLabel(payableId: string): string {
  const p = store.statement?.payables.find((x) => x.id === payableId);
  if (!p) return t('treasury.payments.debt');
  return p.documentNumber ?? p.internalNumber ?? t(`treasury.payables.source.${p.sourceType}`);
}
function advanceLabel(advanceId: string): string {
  return store.statement?.advances.find((x) => x.id === advanceId)?.documentNumber ?? t('treasury.payments.advance');
}

async function run(work: () => Promise<unknown>, doneMessage: () => string): Promise<void> {
  actionError.value = null;
  try {
    await work();
    snackbar.value = doneMessage();
    if (store.currentPayment) await store.fetchSupplier(store.currentPayment.supplierId);
  } catch {
    actionError.value = store.error;
  }
}
const approve = () => run(() => store.approvePayment(paymentId.value), () => t('treasury.payments.approvedDone'));
const post = () => run(() => store.postPayment(paymentId.value), () => t('treasury.payments.posted', { number: store.currentPayment?.number }));

// ── Anular ──
const voidDialog = ref(false);
const reason = ref('');
const reasonOk = computed(() => reason.value.trim().length >= 5);
const voidError = ref<string | null>(null);

function openVoid(): void {
  reason.value = '';
  voidError.value = null;
  voidDialog.value = true;
}
async function confirmVoid(): Promise<void> {
  if (!reasonOk.value) return;
  voidError.value = null;
  try {
    await store.voidPayment(paymentId.value, reason.value.trim());
    voidDialog.value = false;
    snackbar.value = t('treasury.payments.voidedDone');
    if (store.currentPayment) await store.fetchSupplier(store.currentPayment.supplierId);
  } catch {
    voidError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="payment?.number ?? $t('treasury.payments.draft')" :subtitle="payment ? payment.supplierName : $t('treasury.title')">
      <template #actions>
        <v-btn v-if="actions.edit" variant="tonal" prepend-icon="mdi-pencil-outline" :to="{ name: 'treasury-payment-edit', params: { id: paymentId } }">{{ $t('common.edit') }}</v-btn>
        <v-btn v-if="actions.approve" color="primary" variant="tonal" prepend-icon="mdi-check-decagram-outline" :loading="store.saving" @click="approve">{{ $t('treasury.payments.approve') }}</v-btn>
        <v-btn v-if="actions.post" color="primary" prepend-icon="mdi-cash-check" :loading="store.saving" @click="post">{{ $t('treasury.payments.pay') }}</v-btn>
        <v-btn v-if="actions.void" color="error" variant="tonal" prepend-icon="mdi-cancel" @click="openVoid">{{ $t('treasury.payments.void') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !voidDialog && !actionError" type="error" closable class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <template v-if="payment">
      <v-alert v-if="payment.status === 'voided'" type="warning" class="mb-4" :title="$t('treasury.payments.voidedTitle')">
        {{ $t('treasury.payments.voidedText', { reason: payment.voidReason, when: dateTime(payment.voidedAt) }) }}
      </v-alert>
      <v-alert v-else-if="needsApprovalNotice" type="warning" class="mb-4" :title="$t('treasury.payments.needsApprovalTitle')">
        {{ $t(actions.approve ? 'treasury.payments.needsApprovalYou' : 'treasury.payments.needsApprovalText') }}
      </v-alert>
      <v-alert v-else-if="payment.status === 'draft'" type="info" class="mb-4">{{ $t('treasury.payments.draftNote') }}</v-alert>
      <v-alert v-else-if="payment.status === 'approved'" type="info" class="mb-4">{{ $t('treasury.payments.approvedNote', { when: dateTime(payment.approvedAt) }) }}</v-alert>

      <v-row class="mb-2">
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.paid') }}</div>
            <div class="text-h6">{{ money(payment.totalCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t(`treasury.payments.accounts.${payment.accountRole}`) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.applied') }}</div>
            <div class="text-h6">{{ money(payment.appliedCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.lines', { n: payment.lineCount }) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.advanceUsed') }}</div>
            <div class="text-h6">{{ money(payment.advanceUsedCents) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.excess') }}</div>
            <div class="text-h6">{{ money(payment.advanceCents) }}</div>
            <div v-if="payment.advanceCents > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.becameAdvance') }}</div>
          </v-card-text></v-card>
        </v-col>
      </v-row>

      <v-card class="mb-4">
        <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
          {{ $t('treasury.payments.data') }}
          <v-chip :color="PAYMENT_STATUS_COLOR[payment.status]" variant="flat" size="small">{{ $t(`treasury.payments.status.${payment.status}`) }}</v-chip>
        </v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap ga-6">
            <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.date') }}</div>{{ payment.paymentDate }}</div>
            <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.method') }}</div>{{ $t(`treasury.payments.methods.${payment.method}`) }}</div>
            <div v-if="payment.reference"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.reference') }}</div>{{ payment.reference }}</div>
            <div v-if="payment.notes"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.notes') }}</div>{{ payment.notes }}</div>
          </div>
          <div class="text-body-2 text-medium-emphasis mt-3">
            {{ $t('treasury.payments.history', { created: dateTime(payment.createdAt), posted: dateTime(payment.postedAt) }) }}
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('treasury.payments.appliedTo') }}</v-card-title>
        <v-card-text>
          <div v-if="payment.lines.length === 0" class="text-medium-emphasis">{{ $t('treasury.payments.noLines') }}</div>
          <v-table v-else density="comfortable">
            <thead><tr><th class="text-start">{{ $t('treasury.payments.debt') }}</th><th class="text-end">{{ $t('treasury.payments.apply') }}</th></tr></thead>
            <tbody>
              <tr v-for="line in payment.lines" :key="line.payableId">
                <td>{{ debtLabel(line.payableId) }}</td>
                <td class="text-end">{{ money(line.appliedCents) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <v-card v-if="payment.advanceUses.length > 0">
        <v-card-title class="text-h6">{{ $t('treasury.payments.advancesConsumed') }}</v-card-title>
        <v-card-text>
          <v-table density="comfortable">
            <tbody>
              <tr v-for="use in payment.advanceUses" :key="use.advanceId">
                <td>{{ advanceLabel(use.advanceId) }}</td>
                <td class="text-end">{{ money(use.usedCents) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="voidDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.payments.voidTitle', { number: payment?.number }) }}</v-card-title>
        <v-card-text>
          <v-alert v-if="voidError" type="error" class="mb-4">{{ voidError }}</v-alert>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.payments.voidHint') }}</div>
          <v-textarea v-model="reason" :label="$t('treasury.payments.voidReason')" :hint="$t('treasury.payments.voidReasonHint')" persistent-hint rows="2" auto-grow maxlength="300" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="voidDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" :disabled="!reasonOk" @click="confirmVoid">{{ $t('treasury.payments.void') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

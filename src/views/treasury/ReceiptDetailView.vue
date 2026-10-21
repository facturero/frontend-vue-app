<script setup lang="ts">
/**
 * Un cobro: a qué deudas se aplicó, cuánto entró y a dónde, el anticipo que dejó o consumió, y su historia (quién lo contabilizó y,
 * si se anuló, quién y por qué). Un borrador se edita o se contabiliza; uno contabilizado ya no se edita: se anula (con motivo, solo el
 * Administrador) y se rehace. Anular NO borra nada: la aplicación queda en la historia y contabilidad reversa el asiento.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryStore } from '@/stores/treasury';
import { formatMoney } from '@/utils/accounting';
import { receiptActions, RECEIPT_STATUS_COLOR } from '@/utils/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useTreasuryStore();

const receiptId = computed(() => route.params.id as string);
const receipt = computed(() => store.currentReceipt);
const actions = computed(() => (receipt.value ? receiptActions(receipt.value, (p) => auth.can(p)) : { edit: false, post: false, void: false }));
const snackbar = ref<string | null>(null);
const actionError = ref<string | null>(null);

const money = (cents: number) => formatMoney(cents, locale.value, receipt.value?.currencyCode ?? 'USD');
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale.value) : '—');

onMounted(async () => {
  await store.fetchReceipt(receiptId.value);
  // Las líneas solo traen el id de la deuda: el estado de cuenta del cliente las nombra (número de factura, vencimiento).
  if (store.currentReceipt) await store.fetchCustomer(store.currentReceipt.customerId);
});

/** Nombre legible de la deuda a la que se aplicó una línea. */
function debtLabel(receivableId: string): string {
  const r = store.statement?.receivables.find((x) => x.id === receivableId);
  if (!r) return t('treasury.receipts.debt');
  return r.documentNumber ?? t(`treasury.receivables.source.${r.sourceType}`);
}
function advanceLabel(advanceId: string): string {
  return store.statement?.advances.find((x) => x.id === advanceId)?.documentNumber ?? t('treasury.receipts.advance');
}

async function post(): Promise<void> {
  actionError.value = null;
  try {
    const posted = await store.postReceipt(receiptId.value);
    snackbar.value = t('treasury.receipts.posted', { number: posted.number });
    await store.fetchCustomer(posted.customerId);
  } catch {
    actionError.value = store.error;
  }
}

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
    await store.voidReceipt(receiptId.value, reason.value.trim());
    voidDialog.value = false;
    snackbar.value = t('treasury.receipts.voidedDone');
    if (store.currentReceipt) await store.fetchCustomer(store.currentReceipt.customerId);
  } catch {
    voidError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="receipt?.number ?? $t('treasury.receipts.draft')" :subtitle="receipt ? receipt.customerName : $t('treasury.title')">
      <template #actions>
        <v-btn v-if="actions.edit" variant="tonal" prepend-icon="mdi-pencil-outline" :to="{ name: 'treasury-receipt-edit', params: { id: receiptId } }">{{ $t('common.edit') }}</v-btn>
        <v-btn v-if="actions.post" color="primary" prepend-icon="mdi-cash-check" :loading="store.saving" @click="post">{{ $t('treasury.receipts.charge') }}</v-btn>
        <v-btn v-if="actions.void" color="error" variant="tonal" prepend-icon="mdi-cancel" @click="openVoid">{{ $t('treasury.receipts.void') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !voidDialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <template v-if="receipt">
      <v-alert v-if="receipt.status === 'voided'" type="warning" class="mb-4" :title="$t('treasury.receipts.voidedTitle')">
        {{ $t('treasury.receipts.voidedText', { reason: receipt.voidReason, when: dateTime(receipt.voidedAt) }) }}
      </v-alert>
      <v-alert v-else-if="receipt.status === 'draft'" type="info" class="mb-4">{{ $t('treasury.receipts.draftNote') }}</v-alert>

      <v-row class="mb-2">
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.received') }}</div>
            <div class="text-h6">{{ money(receipt.totalCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t(`treasury.receipts.accounts.${receipt.accountRole}`) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.applied') }}</div>
            <div class="text-h6">{{ money(receipt.appliedCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.lines', { n: receipt.lineCount }) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.advanceUsed') }}</div>
            <div class="text-h6">{{ money(receipt.advanceUsedCents) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.excess') }}</div>
            <div class="text-h6">{{ money(receipt.advanceCents) }}</div>
            <div v-if="receipt.advanceCents > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.becameAdvance') }}</div>
          </v-card-text></v-card>
        </v-col>
      </v-row>

      <v-card class="mb-4">
        <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
          {{ $t('treasury.receipts.data') }}
          <v-chip :color="RECEIPT_STATUS_COLOR[receipt.status]" variant="flat" size="small">{{ $t(`treasury.receipts.status.${receipt.status}`) }}</v-chip>
        </v-card-title>
        <v-card-text>
          <div class="d-flex flex-wrap ga-6">
            <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.date') }}</div>{{ receipt.receiptDate }}</div>
            <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.method') }}</div>{{ $t(`treasury.receipts.methods.${receipt.method}`) }}</div>
            <div v-if="receipt.reference"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.reference') }}</div>{{ receipt.reference }}</div>
            <div v-if="receipt.notes"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.notes') }}</div>{{ receipt.notes }}</div>
          </div>
          <div class="text-body-2 text-medium-emphasis mt-3">
            {{ $t('treasury.receipts.history', { created: dateTime(receipt.createdAt), posted: dateTime(receipt.postedAt) }) }}
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('treasury.receipts.appliedTo') }}</v-card-title>
        <v-card-text>
          <div v-if="receipt.lines.length === 0" class="text-medium-emphasis">{{ $t('treasury.receipts.noLines') }}</div>
          <v-table v-else density="comfortable">
            <thead><tr><th class="text-start">{{ $t('treasury.receipts.debt') }}</th><th class="text-end">{{ $t('treasury.receipts.apply') }}</th></tr></thead>
            <tbody>
              <tr v-for="line in receipt.lines" :key="line.receivableId">
                <td>{{ debtLabel(line.receivableId) }}</td>
                <td class="text-end">{{ money(line.appliedCents) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <v-card v-if="receipt.advanceUses.length > 0">
        <v-card-title class="text-h6">{{ $t('treasury.receipts.advancesConsumed') }}</v-card-title>
        <v-card-text>
          <v-table density="comfortable">
            <tbody>
              <tr v-for="use in receipt.advanceUses" :key="use.advanceId">
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
        <v-card-title>{{ $t('treasury.receipts.voidTitle', { number: receipt?.number }) }}</v-card-title>
        <v-card-text>
          <v-alert v-if="voidError" type="error" class="mb-4">{{ voidError }}</v-alert>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.receipts.voidHint') }}</div>
          <v-textarea v-model="reason" :label="$t('treasury.receipts.voidReason')" :hint="$t('treasury.receipts.voidReasonHint')" persistent-hint rows="2" auto-grow maxlength="300" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="voidDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" :disabled="!reasonOk" @click="confirmVoid">{{ $t('treasury.receipts.void') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Conciliación bancaria de una cuenta. A una fecha de corte se compara el extracto del banco con el registro de tesorería:
 *
 *     diferencia = saldo del extracto − (saldo del registro − movimientos pendientes)
 *
 * Los PENDIENTES son lo que la empresa ya registró y el banco todavía no refleja (un cheque en circulación, un depósito en tránsito). Cada
 * renglón del extracto se resuelve de una de tres formas: se EMPAREJA con uno o varios movimientos (que sumen exacto), se registra como
 * AJUSTE (una comisión o un interés que la empresa no tenía: contabilidad lo asienta), o se marca «ya contabilizado fuera de tesorería»
 * (una venta cobrada con tarjeta que ya está en el mayor). Solo se cierra con diferencia cero y nada sin resolver; cerrar congela.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryBankingStore } from '@/stores/treasuryBanking';
import { centsToInput, formatMoney } from '@/utils/accounting';
import {
  adjustmentKindsFor,
  defaultAdjustmentKind,
  LINE_STATUS_COLOR,
  movementsMatchableTo,
  parseSignedMoney,
  reconciliationBlockers,
  selectionSummary,
} from '@/utils/treasury-banking';
import type { AdjustmentKind, BankLineStatus, BankLineView, BankMovement } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';
import ReasonDialog from '@/components/treasury/ReasonDialog.vue';

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useTreasuryBankingStore();

const accountId = computed(() => route.params.id as string);
const account = computed(() => store.detail);
const canReconcile = computed(() => auth.can('reconciliation:manage'));
const canImport = computed(() => auth.can('bank_account:manage'));
const currency = computed(() => account.value?.currencyCode ?? 'USD');
const money = (cents: number) => formatMoney(cents, locale.value, currency.value);
const today = () => new Date().toLocaleDateString('en-CA');

const cutoff = ref(today());
const balanceText = ref('');
const lineFilter = ref<BankLineStatus | 'all'>('unmatched');
const selectedLineId = ref<string | null>(null);
const selectedMovementIds = ref<string[]>([]);
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

const preview = computed(() => store.preview);
const result = computed(() => preview.value?.result ?? null);
const typedBalance = computed(() => (balanceText.value.trim() === '' ? undefined : (parseSignedMoney(balanceText.value) ?? undefined)));
const balanceInvalid = computed(() => balanceText.value.trim() !== '' && parseSignedMoney(balanceText.value) === null);
const blockers = computed(() => reconciliationBlockers(result.value));
const selectedLine = computed<BankLineView | null>(() => store.lines.find((l) => l.id === selectedLineId.value) ?? null);
const movementChoices = computed(() => (selectedLine.value ? movementsMatchableTo(selectedLine.value, store.movements) : store.movements));
const selectedMovements = computed(() => store.movements.filter((m) => selectedMovementIds.value.includes(m.id)));
const summary = computed(() => (selectedLine.value ? selectionSummary(selectedLine.value, selectedMovements.value) : null));
const latestClosed = computed(() => preview.value?.latestClosed ?? null);
const lastClosedRow = computed(() => store.reconciliations.find((r) => r.status === 'closed') ?? null);

async function refreshPreview(): Promise<void> {
  if (balanceInvalid.value) return;
  await store.fetchPreview(accountId.value, cutoff.value, typedBalance.value);
}
async function refreshLines(): Promise<void> {
  await store.fetchLines(accountId.value, { status: lineFilter.value === 'all' ? undefined : [lineFilter.value], pageSize: 200 });
  if (selectedLineId.value && !store.lines.some((l) => l.id === selectedLineId.value)) selectedLineId.value = null;
}
const refreshMovements = () => store.fetchMovements({ bankAccountId: accountId.value, matched: false, status: ['active'], pageSize: 200 });
async function refreshAll(): Promise<void> {
  await Promise.all([store.fetchAccount(accountId.value), refreshPreview(), refreshLines(), refreshMovements(), store.fetchSuggestions(accountId.value), store.fetchReconciliations(accountId.value)]);
}

onMounted(async () => {
  await refreshAll();
  if (balanceText.value === '' && preview.value?.suggestedStatementBalance) balanceText.value = centsToInput(preview.value.suggestedStatementBalance.cents) || '0';
});

let timer: ReturnType<typeof setTimeout> | null = null;
watch([cutoff, balanceText], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void refreshPreview(), 400);
});
watch(lineFilter, () => void refreshLines());

/** Elegir un renglón sin resolver preselecciona el movimiento que el sistema le sugiere (la persona lo confirma). */
function selectLine(line: BankLineView): void {
  actionError.value = null;
  selectedLineId.value = line.id;
  const suggestion = store.suggestions.find((s) => s.line.id === line.id);
  selectedMovementIds.value = line.status === 'unmatched' && suggestion ? [suggestion.movement.id] : [];
}
function toggleMovement(movement: BankMovement): void {
  selectedMovementIds.value = selectedMovementIds.value.includes(movement.id)
    ? selectedMovementIds.value.filter((id) => id !== movement.id)
    : [...selectedMovementIds.value, movement.id];
}

/** Ejecuta una acción de escritura: si falla deja el mensaje junto al panel; si sale bien, recarga todo (el servidor es la verdad). */
async function act(work: () => Promise<unknown>, done: string): Promise<boolean> {
  actionError.value = null;
  try {
    await work();
    snackbar.value = done;
    selectedMovementIds.value = [];
    await refreshAll();
    return true;
  } catch {
    actionError.value = store.error;
    await refreshAll();
    return false;
  }
}

const doMatch = () => selectedLine.value && act(() => store.matchLine(selectedLine.value!.id, selectedMovementIds.value), t('treasury.banking.reconcile.matched'));
const doUnmatch = (line: BankLineView) => act(() => store.unmatchLine(line.id), t('treasury.banking.reconcile.unmatched'));
const doUnexternal = (line: BankLineView) => act(() => store.unmarkLineExternal(line.id), t('treasury.banking.reconcile.unmarked'));

// ── Sugerencias ──
const suggestionsDialog = ref(false);
const acceptedSuggestions = ref<string[]>([]);
function openSuggestions(): void {
  acceptedSuggestions.value = store.suggestions.map((s) => s.line.id);
  suggestionsDialog.value = true;
}
async function confirmSuggestions(): Promise<void> {
  const pairs = store.suggestions.filter((s) => acceptedSuggestions.value.includes(s.line.id)).map((s) => ({ lineId: s.line.id, movementIds: [s.movement.id] }));
  actionError.value = null;
  try {
    const out = await store.matchMany(pairs);
    snackbar.value = out.failed.length > 0 ? t('treasury.banking.reconcile.suggestionsPartial', { ok: out.matched.length, failed: out.failed.length }) : t('treasury.banking.reconcile.suggestionsDone', { n: out.matched.length });
    suggestionsDialog.value = false;
  } catch {
    actionError.value = store.error;
  }
  await refreshAll();
}

// ── Ajuste bancario desde un renglón ──
const adjustDialog = ref(false);
const adjustKind = ref<AdjustmentKind>('bank_fee');
const adjustDescription = ref('');
const adjustReference = ref('');
const adjustError = ref<string | null>(null);
const adjustKindItems = computed(() => (selectedLine.value ? adjustmentKindsFor(selectedLine.value.amountCents) : []).map((value) => ({ value, title: t(`treasury.banking.adjustments.kinds.${value}`) })));
function openAdjust(): void {
  const line = selectedLine.value;
  if (!line) return;
  adjustKind.value = defaultAdjustmentKind(line.amountCents);
  adjustDescription.value = line.description;
  adjustReference.value = line.reference ?? '';
  adjustError.value = null;
  adjustDialog.value = true;
}
async function doAdjust(): Promise<void> {
  const line = selectedLine.value;
  if (!line) return;
  adjustError.value = null;
  try {
    await store.postAdjustment({
      bankAccountId: accountId.value,
      kind: adjustKind.value,
      date: line.lineDate,
      amountCents: Math.abs(line.amountCents),
      description: adjustDescription.value.trim(),
      reference: adjustReference.value.trim() || null,
      lineId: line.id,
    });
    adjustDialog.value = false;
    snackbar.value = t('treasury.banking.adjustments.posted');
    await refreshAll();
  } catch {
    adjustError.value = store.error;
  }
}

// ── Motivo (externo / anular ajuste / reabrir) ──
type ReasonKind = 'external' | 'voidAdjustment' | 'reopen';
const reasonKind = ref<ReasonKind | null>(null);
const reasonTarget = ref<string | null>(null);
const reasonError = ref<string | null>(null);
const reasonOpen = computed({ get: () => reasonKind.value !== null, set: (v: boolean) => { if (!v) reasonKind.value = null; } });
function askReason(kind: ReasonKind, target: string): void {
  reasonKind.value = kind;
  reasonTarget.value = target;
  reasonError.value = null;
}
async function confirmReason(reason: string): Promise<void> {
  if (!reasonKind.value || !reasonTarget.value) return;
  reasonError.value = null;
  const kind = reasonKind.value;
  const target = reasonTarget.value;
  try {
    if (kind === 'external') await store.markLineExternal(target, reason);
    else if (kind === 'voidAdjustment') await store.voidAdjustment(target, reason);
    else await store.reopenReconciliation(target, reason);
    reasonKind.value = null;
    snackbar.value = t(`treasury.banking.reasons.${kind}.done`);
    selectedMovementIds.value = [];
    await refreshAll();
  } catch {
    reasonError.value = store.error;
  }
}

// ── Cerrar ──
const closeDialog = ref(false);
const closeNotes = ref('');
const closeError = ref<string | null>(null);
const canClose = computed(() => canReconcile.value && blockers.value.length === 0 && !balanceInvalid.value && !!result.value);
async function doClose(): Promise<void> {
  if (!result.value || preview.value?.statementBalanceCents == null) return;
  closeError.value = null;
  try {
    await store.closeReconciliation(accountId.value, { cutoffDate: cutoff.value, statementBalanceCents: preview.value.statementBalanceCents, notes: closeNotes.value.trim() || null });
    closeDialog.value = false;
    closeNotes.value = '';
    snackbar.value = t('treasury.banking.reconcile.closed');
    await refreshAll();
  } catch {
    closeError.value = store.error;
  }
}

const sourceIcon = (m: BankMovement) => (m.sourceType === 'receipt' ? 'mdi-cash-plus' : m.sourceType === 'payment' ? 'mdi-cash-minus' : 'mdi-bank-transfer');
const amountClass = (cents: number) => (cents < 0 ? 'text-error' : 'text-success');
const filterItems = computed(() => (['unmatched', 'matched', 'external', 'all'] as const).map((value) => ({ value, title: t(`treasury.banking.reconcile.filters.${value}`) })));
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.banking.reconcile.intro', { account: account?.name ?? '' })">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'treasury-bank-accounts' }">{{ $t('treasury.banking.back') }}</v-btn>
        <v-btn v-if="canImport && account?.isActive" variant="tonal" prepend-icon="mdi-file-upload-outline" :to="{ name: 'treasury-bank-import', params: { id: accountId } }">{{ $t('treasury.banking.importStatement') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !actionError" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <!-- Fecha de corte y saldo del extracto -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="4" md="3">
            <v-text-field v-model="cutoff" type="date" :label="$t('treasury.banking.reconcile.cutoff')" :hint="latestClosed ? $t('treasury.banking.reconcile.cutoffAfter', { date: latestClosed.cutoffDate }) : undefined" persistent-hint />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <v-text-field
              v-model="balanceText"
              :label="$t('treasury.banking.reconcile.statementBalance')"
              :error-messages="balanceInvalid ? $t('treasury.banking.errors.opening') : undefined"
              :hint="preview?.suggestedStatementBalance ? $t('treasury.banking.reconcile.suggestedBalance', { date: preview.suggestedStatementBalance.date }) : $t('treasury.banking.reconcile.balanceHint')"
              persistent-hint
              inputmode="decimal"
            />
          </v-col>
          <v-col cols="12" md="6" class="d-flex flex-wrap align-center justify-md-end ga-2">
            <v-btn v-if="lastClosedRow && canReconcile" variant="text" prepend-icon="mdi-lock-open-outline" @click="askReason('reopen', lastClosedRow.id)">{{ $t('treasury.banking.reconcile.reopenLast', { date: lastClosedRow.cutoffDate }) }}</v-btn>
            <v-btn v-if="canReconcile" color="primary" prepend-icon="mdi-lock-check-outline" :disabled="!canClose" @click="closeDialog = true">{{ $t('treasury.banking.reconcile.close') }}</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-row v-if="result" class="mb-2">
      <v-col cols="6" md="3">
        <v-card><v-card-text>
          <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.reconcile.statementBalance') }}</div>
          <div class="text-h6">{{ money(preview!.statementBalanceCents ?? 0) }}</div>
        </v-card-text></v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card><v-card-text>
          <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.registerBalance') }}</div>
          <div class="text-h6">{{ money(result.registerBalanceCents) }}</div>
        </v-card-text></v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card><v-card-text>
          <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.reconcile.pending', { n: result.pendingCount }) }}</div>
          <div class="text-h6">{{ money(result.pendingCents) }}</div>
          <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.reconcile.pendingHint') }}</div>
        </v-card-text></v-card>
      </v-col>
      <v-col cols="6" md="3">
        <v-card :color="result.differenceCents === 0 ? 'lightsuccess' : 'lighterror'" variant="flat"><v-card-text>
          <div class="text-body-2">{{ $t('treasury.banking.reconcile.difference') }}</div>
          <div class="text-h6">{{ money(result.differenceCents) }}</div>
          <div class="text-body-2">{{ result.unresolvedLines > 0 ? $t('treasury.banking.reconcile.unresolved', { n: result.unresolvedLines }) : $t('treasury.banking.reconcile.allResolved') }}</div>
        </v-card-text></v-card>
      </v-col>
    </v-row>
    <v-alert v-else-if="preview && !balanceInvalid" type="info" class="mb-4">{{ $t('treasury.banking.reconcile.needBalance') }}</v-alert>

    <v-alert v-if="canReconcile && store.suggestions.length > 0" type="info" class="mb-4">
      <div class="d-flex flex-wrap align-center ga-2">
        <span class="flex-grow-1">{{ $t('treasury.banking.reconcile.suggestions', { n: store.suggestions.length }) }}</span>
        <v-btn size="small" variant="flat" color="info" @click="openSuggestions">{{ $t('treasury.banking.reconcile.reviewSuggestions') }}</v-btn>
      </div>
    </v-alert>

    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <v-row>
      <!-- Extracto del banco -->
      <v-col cols="12" lg="7">
        <v-card>
          <v-card-title class="d-flex flex-wrap align-center ga-2">
            <span class="text-h6 flex-grow-1">{{ $t('treasury.banking.reconcile.linesTitle') }}</span>
            <v-btn-toggle v-model="lineFilter" mandatory density="compact" variant="outlined" divided>
              <v-btn v-for="f in filterItems" :key="f.value" :value="f.value" size="small">{{ f.title }}</v-btn>
            </v-btn-toggle>
          </v-card-title>
          <v-card-text>
            <v-list v-if="store.lines.length > 0" lines="two" class="pa-0">
              <v-list-item v-for="line in store.lines" :key="line.id" :active="line.id === selectedLineId" rounded @click="selectLine(line)">
                <template #prepend>
                  <v-chip :color="LINE_STATUS_COLOR[line.status]" variant="flat" size="small" class="mr-3">{{ $t(`treasury.banking.lineStatus.${line.status}`) }}</v-chip>
                </template>
                <v-list-item-title>{{ line.description }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ line.lineDate }}<template v-if="line.reference"> · {{ line.reference }}</template>
                  <template v-if="line.status === 'external' && line.externalReason"> · {{ line.externalReason }}</template>
                  <template v-if="line.reconciled"> · <v-icon icon="mdi-lock-outline" size="x-small" /> {{ $t('treasury.banking.reconcile.locked') }}</template>
                </v-list-item-subtitle>
                <template #append>
                  <span class="font-weight-medium" :class="amountClass(line.amountCents)">{{ money(line.amountCents) }}</span>
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-body-2 text-medium-emphasis py-4 text-center">{{ $t('treasury.banking.reconcile.noLines') }}</div>
            <div v-if="store.linesTotal > store.lines.length" class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.banking.reconcile.onlyFirst', { n: store.lines.length }) }}</div>
          </v-card-text>

          <!-- Qué se hace con el renglón elegido -->
          <v-divider v-if="selectedLine" />
          <v-card-text v-if="selectedLine">
            <div class="text-subtitle-1 mb-1">{{ selectedLine.description }} · <span :class="amountClass(selectedLine.amountCents)">{{ money(selectedLine.amountCents) }}</span></div>

            <template v-if="selectedLine.status === 'unmatched'">
              <div v-if="summary" class="text-body-2 mb-2" :class="summary.exact ? 'text-success' : 'text-medium-emphasis'">
                {{ $t('treasury.banking.reconcile.selection', { n: selectedMovements.length, sum: money(summary.sumCents), remaining: money(summary.remainingCents) }) }}
              </div>
              <div v-if="canReconcile" class="d-flex flex-wrap ga-2">
                <v-btn color="primary" prepend-icon="mdi-link-variant" :disabled="!summary?.exact" :loading="store.saving" @click="doMatch">{{ $t('treasury.banking.reconcile.match') }}</v-btn>
                <v-btn variant="tonal" prepend-icon="mdi-bank-transfer" @click="openAdjust">{{ $t('treasury.banking.reconcile.registerAdjustment') }}</v-btn>
                <v-btn variant="tonal" prepend-icon="mdi-check-decagram-outline" @click="askReason('external', selectedLine.id)">{{ $t('treasury.banking.reconcile.markExternal') }}</v-btn>
              </div>
              <div class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.banking.reconcile.pickHint') }}</div>
            </template>

            <template v-else-if="selectedLine.status === 'matched'">
              <div v-for="m in selectedLine.movements" :key="m.id" class="text-body-2 mb-1">
                <v-icon :icon="sourceIcon(m)" size="small" class="mr-1" />{{ m.description }}<template v-if="m.reference"> · {{ m.reference }}</template> · {{ m.movementDate }} · {{ money(m.amountCents) }}
              </div>
              <v-btn v-if="canReconcile && !selectedLine.reconciled" variant="tonal" prepend-icon="mdi-link-variant-off" :loading="store.saving" @click="doUnmatch(selectedLine)">{{ $t('treasury.banking.reconcile.unmatch') }}</v-btn>
            </template>

            <template v-else>
              <div class="text-body-2 mb-2">{{ selectedLine.externalReason }}</div>
              <v-btn v-if="canReconcile && !selectedLine.reconciled" variant="tonal" prepend-icon="mdi-undo" :loading="store.saving" @click="doUnexternal(selectedLine)">{{ $t('treasury.banking.reconcile.unmarkExternal') }}</v-btn>
            </template>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Registro de tesorería: lo pendiente -->
      <v-col cols="12" lg="5">
        <v-card>
          <v-card-title class="text-h6">{{ $t('treasury.banking.reconcile.movementsTitle') }}</v-card-title>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis mb-2">{{ $t('treasury.banking.reconcile.movementsHint') }}</div>
            <v-list v-if="movementChoices.length > 0" lines="two" class="pa-0">
              <v-list-item v-for="m in movementChoices" :key="m.id" rounded @click="selectedLine?.status === 'unmatched' && toggleMovement(m)">
                <template #prepend>
                  <v-checkbox-btn v-if="selectedLine?.status === 'unmatched' && canReconcile" :model-value="selectedMovementIds.includes(m.id)" class="mr-2" @click.stop="toggleMovement(m)" />
                  <v-icon v-else :icon="sourceIcon(m)" class="mr-3" />
                </template>
                <v-list-item-title>{{ m.description }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ m.movementDate }}<template v-if="m.reference"> · {{ m.reference }}</template> · {{ $t(`treasury.banking.sources.${m.sourceType}`) }}
                </v-list-item-subtitle>
                <template #append>
                  <span class="font-weight-medium" :class="amountClass(m.amountCents)">{{ money(m.amountCents) }}</span>
                  <v-btn v-if="m.sourceType === 'adjustment' && canReconcile" icon="mdi-close-circle-outline" variant="text" size="small" :aria-label="$t('treasury.banking.adjustments.void')" @click.stop="askReason('voidAdjustment', m.id)" />
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-body-2 text-medium-emphasis py-4 text-center">{{ $t('treasury.banking.reconcile.noMovements') }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Historial -->
    <v-card v-if="store.reconciliations.length > 0" class="mt-4">
      <v-card-title class="text-h6">{{ $t('treasury.banking.reconcile.history') }}</v-card-title>
      <v-card-text>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th class="text-left">{{ $t('treasury.banking.reconcile.cutoff') }}</th>
              <th class="text-right">{{ $t('treasury.banking.reconcile.statementBalance') }}</th>
              <th class="text-right">{{ $t('treasury.banking.registerBalance') }}</th>
              <th class="text-right">{{ $t('treasury.banking.reconcile.pendingShort') }}</th>
              <th class="text-left">{{ $t('common.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in store.reconciliations" :key="r.id">
              <td>{{ r.cutoffDate }}</td>
              <td class="text-right">{{ money(r.statementBalanceCents) }}</td>
              <td class="text-right">{{ money(r.registerBalanceCents) }}</td>
              <td class="text-right">{{ money(r.pendingCents) }}</td>
              <td>
                <v-chip size="small" variant="flat" :color="r.status === 'closed' ? 'lightsuccess' : 'lightsecondary'">{{ $t(`treasury.banking.reconcile.statuses.${r.status}`) }}</v-chip>
                <div v-if="r.status === 'reopened' && r.notes" class="text-body-2 text-medium-emphasis">{{ r.notes }}</div>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <!-- Sugerencias -->
    <v-dialog v-model="suggestionsDialog" max-width="760" scrollable>
      <v-card>
        <v-card-title>{{ $t('treasury.banking.reconcile.suggestionsTitle') }}</v-card-title>
        <v-card-text>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.banking.reconcile.suggestionsHint') }}</div>
          <v-list class="pa-0">
            <v-list-item v-for="s in store.suggestions" :key="s.line.id" lines="three">
              <template #prepend>
                <v-checkbox-btn v-model="acceptedSuggestions" :value="s.line.id" class="mr-2" />
              </template>
              <v-list-item-title>{{ s.line.description }} · {{ money(s.line.amountCents) }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.line.lineDate }}<template v-if="s.line.reference"> · {{ s.line.reference }}</template></v-list-item-subtitle>
              <v-list-item-subtitle>
                <v-icon icon="mdi-arrow-right" size="x-small" /> {{ s.movement.description }} · {{ s.movement.movementDate }}<template v-if="s.movement.reference"> · {{ s.movement.reference }}</template>
                <v-chip size="x-small" variant="flat" color="lightinfo" class="ml-2">{{ $t(`treasury.banking.reconcile.reasons.${s.reason}`) }}</v-chip>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="suggestionsDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :disabled="acceptedSuggestions.length === 0" :loading="store.saving" @click="confirmSuggestions">{{ $t('treasury.banking.reconcile.confirmSuggestions', { n: acceptedSuggestions.length }) }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Ajuste bancario -->
    <v-dialog v-model="adjustDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.banking.adjustments.title') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="adjustError" type="error" class="mb-4">{{ adjustError }}</v-alert>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.banking.adjustments.hint') }}</div>
          <v-select v-model="adjustKind" :items="adjustKindItems" :label="$t('treasury.banking.adjustments.kind')" />
          <v-text-field v-model="adjustDescription" :label="$t('treasury.banking.adjustments.description')" :hint="$t('treasury.banking.adjustments.descriptionHint')" persistent-hint maxlength="200" />
          <v-text-field v-model="adjustReference" :label="$t('treasury.banking.lines.reference')" maxlength="100" class="mt-2" />
          <div v-if="selectedLine" class="text-body-2 mt-2">{{ $t('treasury.banking.adjustments.amountDate', { amount: money(Math.abs(selectedLine.amountCents)), date: selectedLine.lineDate }) }}</div>
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="adjustDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="adjustDescription.trim().length < 3" @click="doAdjust">{{ $t('treasury.banking.adjustments.post') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Cerrar -->
    <v-dialog v-model="closeDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.banking.reconcile.closeTitle', { date: cutoff }) }}</v-card-title>
        <v-card-text>
          <v-alert v-if="closeError" type="error" class="mb-4">{{ closeError }}</v-alert>
          <div class="text-body-2 mb-3">{{ $t('treasury.banking.reconcile.closeHint') }}</div>
          <v-textarea v-model="closeNotes" :label="$t('treasury.banking.reconcile.notes')" rows="2" auto-grow maxlength="500" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="closeDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" @click="doClose">{{ $t('treasury.banking.reconcile.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ReasonDialog
      v-if="reasonKind"
      v-model="reasonOpen"
      :title="$t(`treasury.banking.reasons.${reasonKind}.title`)"
      :hint="$t(`treasury.banking.reasons.${reasonKind}.hint`)"
      :label="$t(`treasury.banking.reasons.${reasonKind}.label`)"
      :confirm-label="$t(`treasury.banking.reasons.${reasonKind}.confirm`)"
      :confirm-color="reasonKind === 'external' ? 'primary' : 'error'"
      :saving="store.saving"
      :server-error="reasonError"
      @confirm="confirmReason"
    />

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

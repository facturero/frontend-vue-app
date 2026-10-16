<script setup lang="ts">
/**
 * Un asiento: alta, edición del borrador y consulta del contabilizado.
 *
 * Partida doble: la suma del DEBE tiene que ser igual a la del HABER, y cada línea lleva el importe en un solo lado. Mientras no
 * cuadre, el botón de contabilizar queda apagado y la barra de abajo dice cuánto falta. Un asiento contabilizado es de solo
 * lectura: se corrige con una reversa, que deja ambos a la vista.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { todayLocal, useAccountingStore } from '@/stores/accounting';
import { centsToInput, formatMoney, isLineComplete, lineTotals, parseMoneyToCents, postableAccounts } from '@/utils/accounting';
import type { JournalEntry } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';

interface FormLine {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
  costCenterId: string | null;
}

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useAccountingStore();
/** En el teléfono la tabla de líneas no cabe (los campos quedan en «C…» y «De…»): cada línea pasa a ser una tarjeta apilada. */
const { xs } = useDisplay();

const entryId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const entry = ref<JournalEntry | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

const entryDate = ref(todayLocal());
const description = ref('');
const reference = ref('');
let seq = 0;
const newLine = (): FormLine => ({ key: (seq += 1), accountId: '', debit: '', credit: '', description: '', costCenterId: null });
const lines = ref<FormLine[]>([newLine(), newLine()]);

const readonly = computed(() => entry.value?.status === 'posted');
const isDraft = computed(() => entry.value?.status === 'draft');
const canCreate = computed(() => auth.can('journal:create'));
const canPost = computed(() => auth.can('journal:post'));
const canReverse = computed(
  () => auth.can('journal:reverse') && entry.value?.status === 'posted' && entry.value.kind !== 'reversal' && !entry.value.reversedByEntryId,
);

const accountOptions = computed(() =>
  postableAccounts(store.accounts).map((a) => ({ value: a.id, title: `${a.code}  ${a.name}` })),
);
const costCenterOptions = computed(() => store.costCenters.filter((c) => c.status === 'active').map((c) => ({ value: c.id, title: `${c.code}  ${c.name}` })));

const parsed = computed(() =>
  lines.value.map((l) => ({ ...l, debitCents: parseMoneyToCents(l.debit), creditCents: parseMoneyToCents(l.credit) })),
);
const hasInvalidAmount = computed(() => parsed.value.some((l) => l.debitCents === null || l.creditCents === null));
const cents = computed(() => parsed.value.map((l) => ({ ...l, debitCents: l.debitCents ?? 0, creditCents: l.creditCents ?? 0 })));
const totals = computed(() => lineTotals(cents.value));
const filled = computed(() => cents.value.filter((l) => l.accountId || l.debitCents || l.creditCents));
const allComplete = computed(() => filled.value.length >= 2 && filled.value.every(isLineComplete));
const valid = computed(() => !!description.value.trim() && !!entryDate.value && !hasInvalidAmount.value && allComplete.value);
const canSave = computed(() => valid.value && !readonly.value);
const canPostNow = computed(() => canSave.value && totals.value.balanced && canPost.value);

function fromEntry(e: JournalEntry): void {
  entryDate.value = e.entryDate;
  description.value = e.description;
  reference.value = e.reference ?? '';
  lines.value = (e.lines ?? []).map((l) => ({
    key: (seq += 1),
    accountId: l.accountId,
    debit: centsToInput(l.debitCents),
    credit: centsToInput(l.creditCents),
    description: l.description ?? '',
    costCenterId: l.costCenterId,
  }));
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    if (store.configured === null) await store.fetchSettings();
    if (!store.configured) {
      await router.replace({ name: 'accounting-accounts' });
      return;
    }
    await Promise.all([store.fetchAccounts(), store.fetchCostCenters()]);
    if (entryId.value) {
      entry.value = await store.getEntry(entryId.value);
      fromEntry(entry.value);
    }
  } catch {
    loadError.value = store.error;
  }
}
onMounted(load);

function setSide(line: FormLine, side: 'debit' | 'credit', value: string): void {
  line[side] = value;
  // Un importe en un lado vacía el otro: así una línea nunca queda en los dos.
  if (value.trim()) line[side === 'debit' ? 'credit' : 'debit'] = '';
}

function addLine(): void {
  lines.value.push(newLine());
}

function removeLine(key: number): void {
  if (lines.value.length > 2) lines.value = lines.value.filter((l) => l.key !== key);
}

/** Pone en la línea la diferencia que falta para que cuadre. */
function balanceWith(line: FormLine): void {
  const diff = totals.value.difference;
  if (diff === 0) return;
  // Si falta haber, la línea lleva el importe en el haber; si falta debe, en el debe.
  const own = parseMoneyToCents(diff > 0 ? line.credit : line.debit) ?? 0;
  const amount = Math.abs(diff) + own;
  if (diff > 0) setSide(line, 'credit', centsToInput(amount));
  else setSide(line, 'debit', centsToInput(amount));
}

function payload() {
  return {
    entryDate: entryDate.value,
    description: description.value.trim(),
    reference: reference.value.trim() || null,
    lines: filled.value.map((l) => ({
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      description: l.description.trim() || null,
      costCenterId: l.costCenterId,
    })),
  };
}

async function saveDraft(): Promise<void> {
  actionError.value = null;
  try {
    if (entryId.value) {
      entry.value = await store.updateEntry(entryId.value, payload());
      snackbar.value = t('accounting.entry.saved');
    } else {
      const created = await store.createEntry({ ...payload(), post: false });
      snackbar.value = t('accounting.entry.saved');
      await router.replace({ name: 'accounting-entry', params: { id: created.id } });
      entry.value = created;
    }
  } catch {
    actionError.value = store.error;
  }
}

async function post(): Promise<void> {
  actionError.value = null;
  try {
    let saved: JournalEntry;
    if (entryId.value) {
      await store.updateEntry(entryId.value, payload());
      saved = await store.postEntry(entryId.value);
    } else {
      saved = await store.createEntry({ ...payload(), post: true });
    }
    snackbar.value = t('accounting.entry.posted', { number: saved.number ?? '' });
    await router.replace({ name: 'accounting-entry', params: { id: saved.id } });
    entry.value = await store.getEntry(saved.id);
    fromEntry(entry.value);
  } catch {
    actionError.value = store.error;
  }
}

const deleteDialog = ref(false);
async function remove(): Promise<void> {
  if (!entryId.value) return;
  actionError.value = null;
  try {
    await store.deleteEntry(entryId.value);
    deleteDialog.value = false;
    await router.replace({ name: 'accounting-journal' });
  } catch {
    deleteDialog.value = false;
    actionError.value = store.error;
  }
}

const reverseDialog = ref(false);
const reverseReason = ref('');
const reverseDate = ref('');
async function reverse(): Promise<void> {
  if (!entryId.value) return;
  actionError.value = null;
  try {
    const res = await store.reverseEntry(entryId.value, { reason: reverseReason.value.trim(), entryDate: reverseDate.value || undefined });
    reverseDialog.value = false;
    snackbar.value = t('accounting.entry.reversedDone', { number: res.reversal.number ?? '' });
    entry.value = await store.getEntry(entryId.value);
  } catch {
    reverseDialog.value = false;
    actionError.value = store.error;
  }
}

const accountLabel = (id: string): string => {
  const a = store.accountById.get(id);
  return a ? `${a.code}  ${a.name}` : id;
};
const costCenterLabel = (id: string | null): string => store.costCenters.find((c) => c.id === id)?.code ?? '';
const money = (c: number): string => formatMoney(c, locale.value, store.currency);
</script>

<template>
  <v-container>
    <PageHeader
      :title="entry?.number ?? (entryId ? $t('accounting.entry.draft') : $t('accounting.entry.newTitle'))"
      :subtitle="readonly ? $t('accounting.entry.readonlyIntro') : $t('accounting.entry.intro')"
    >
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'accounting-journal' }">{{ $t('common.back') }}</v-btn>
        <v-btn v-if="canReverse" color="warning" prepend-icon="mdi-undo-variant" @click="reverseDialog = true">{{ $t('accounting.entry.reverse') }}</v-btn>
      </template>
    </PageHeader>

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <v-alert v-if="entry?.kind === 'automatic'" type="info" class="mb-4">
      {{ $t('accounting.entry.autoOrigin', { source: $t(`accounting.entry.sourceTypes.${entry.sourceType ?? 'other'}`) }) }}
    </v-alert>
    <v-alert v-if="entry?.kind === 'reversal'" type="info" class="mb-4">
      {{ $t('accounting.entry.isReversal') }}
      <router-link v-if="entry.reversesEntryId" :to="{ name: 'accounting-entry', params: { id: entry.reversesEntryId } }">{{ $t('accounting.entry.seeOriginal') }}</router-link>
    </v-alert>
    <v-alert v-else-if="entry?.reversedByEntryId" type="warning" class="mb-4">
      {{ $t('accounting.entry.wasReversed') }}
      <router-link :to="{ name: 'accounting-entry', params: { id: entry.reversedByEntryId } }">{{ $t('accounting.entry.seeReversal') }}</router-link>
    </v-alert>

    <v-card>
      <v-card-text class="d-flex flex-column ga-4">
        <v-row>
          <v-col cols="12" sm="3"><v-text-field v-model="entryDate" type="date" :label="$t('accounting.entry.date')" :readonly="readonly" /></v-col>
          <v-col cols="12" sm="6"><v-text-field v-model="description" :label="$t('common.description')" :readonly="readonly" maxlength="255" /></v-col>
          <v-col cols="12" sm="3"><v-text-field v-model="reference" :label="$t('accounting.entry.reference')" :readonly="readonly" maxlength="60" /></v-col>
        </v-row>

        <v-table v-if="!xs" density="compact">
          <thead>
            <tr>
              <th>{{ $t('accounting.entry.account') }}</th>
              <th>{{ $t('common.description') }}</th>
              <th v-if="costCenterOptions.length > 0 || readonly">{{ $t('accounting.entry.costCenter') }}</th>
              <th class="text-end">{{ $t('accounting.entry.debit') }}</th>
              <th class="text-end">{{ $t('accounting.entry.credit') }}</th>
              <th v-if="!readonly" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.key">
              <template v-if="readonly">
                <td>{{ accountLabel(line.accountId) }}</td>
                <td>{{ line.description }}</td>
                <td>{{ costCenterLabel(line.costCenterId) }}</td>
                <td class="text-end">{{ line.debit ? money(parseMoneyToCents(line.debit) ?? 0) : '' }}</td>
                <td class="text-end">{{ line.credit ? money(parseMoneyToCents(line.credit) ?? 0) : '' }}</td>
              </template>
              <template v-else>
                <td class="py-1"><v-autocomplete v-model="line.accountId" :items="accountOptions" :label="$t('accounting.entry.account')" /></td>
                <td class="py-1"><v-text-field v-model="line.description" :label="$t('common.description')" maxlength="255" /></td>
                <td v-if="costCenterOptions.length > 0" class="py-1"><v-select v-model="line.costCenterId" :items="costCenterOptions" :label="$t('accounting.entry.costCenter')" clearable /></td>
                <td class="py-1">
                  <v-text-field :model-value="line.debit" inputmode="decimal" class="text-end" :label="$t('accounting.entry.debit')" :error="parseMoneyToCents(line.debit) === null" @update:model-value="setSide(line, 'debit', $event)" />
                </td>
                <td class="py-1">
                  <v-text-field :model-value="line.credit" inputmode="decimal" class="text-end" :label="$t('accounting.entry.credit')" :error="parseMoneyToCents(line.credit) === null" @update:model-value="setSide(line, 'credit', $event)" />
                </td>
                <td class="py-1 text-no-wrap">
                  <v-btn icon="mdi-equal" size="small" variant="text" :disabled="totals.difference === 0" :title="$t('accounting.entry.balanceHere')" :aria-label="$t('accounting.entry.balanceHere')" @click="balanceWith(line)" />
                  <v-btn icon="mdi-close" size="small" variant="text" :disabled="lines.length <= 2" :title="$t('common.delete')" :aria-label="$t('common.delete')" @click="removeLine(line.key)" />
                </td>
              </template>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td :colspan="costCenterOptions.length > 0 || readonly ? 3 : 2">
                <v-btn v-if="!readonly" variant="text" prepend-icon="mdi-plus" @click="addLine">{{ $t('accounting.entry.addLine') }}</v-btn>
              </td>
              <td class="text-end font-weight-medium">{{ money(totals.debit) }}</td>
              <td class="text-end font-weight-medium">{{ money(totals.credit) }}</td>
              <td v-if="!readonly" />
            </tr>
          </tfoot>
        </v-table>

        <div v-else class="d-flex flex-column ga-3">
          <v-sheet v-for="line in lines" :key="line.key" border rounded class="pa-3 d-flex flex-column ga-3">
            <template v-if="readonly">
              <div class="font-weight-medium">{{ accountLabel(line.accountId) }}</div>
              <div v-if="line.description" class="text-body-2 text-medium-emphasis">{{ line.description }}</div>
              <div class="d-flex justify-space-between">
                <span>{{ $t('accounting.entry.debit') }}: {{ money(parseMoneyToCents(line.debit) ?? 0) }}</span>
                <span>{{ $t('accounting.entry.credit') }}: {{ money(parseMoneyToCents(line.credit) ?? 0) }}</span>
              </div>
            </template>
            <template v-else>
              <v-autocomplete v-model="line.accountId" :items="accountOptions" :label="$t('accounting.entry.account')" />
              <v-text-field v-model="line.description" :label="$t('common.description')" maxlength="255" />
              <v-select v-if="costCenterOptions.length > 0" v-model="line.costCenterId" :items="costCenterOptions" :label="$t('accounting.entry.costCenter')" clearable />
              <div class="d-flex ga-3">
                <v-text-field :model-value="line.debit" inputmode="decimal" :label="$t('accounting.entry.debit')" :error="parseMoneyToCents(line.debit) === null" @update:model-value="setSide(line, 'debit', $event)" />
                <v-text-field :model-value="line.credit" inputmode="decimal" :label="$t('accounting.entry.credit')" :error="parseMoneyToCents(line.credit) === null" @update:model-value="setSide(line, 'credit', $event)" />
              </div>
              <div class="d-flex justify-end ga-2">
                <v-btn size="small" variant="text" prepend-icon="mdi-equal" :disabled="totals.difference === 0" @click="balanceWith(line)">{{ $t('accounting.entry.balanceHere') }}</v-btn>
                <v-btn size="small" variant="text" prepend-icon="mdi-close" :disabled="lines.length <= 2" @click="removeLine(line.key)">{{ $t('common.delete') }}</v-btn>
              </div>
            </template>
          </v-sheet>
          <div class="d-flex justify-space-between font-weight-medium">
            <span>{{ $t('accounting.entry.debit') }}: {{ money(totals.debit) }}</span>
            <span>{{ $t('accounting.entry.credit') }}: {{ money(totals.credit) }}</span>
          </div>
          <v-btn v-if="!readonly" variant="text" prepend-icon="mdi-plus" @click="addLine">{{ $t('accounting.entry.addLine') }}</v-btn>
        </div>

        <div v-if="!readonly" class="d-flex flex-wrap align-center ga-2">
          <v-chip v-if="totals.balanced" variant="flat" color="lightsuccess">{{ $t('accounting.entry.balanced') }}</v-chip>
          <v-chip v-else variant="flat" color="lightwarning">{{ $t('accounting.entry.difference', { amount: money(Math.abs(totals.difference)) }) }}</v-chip>
          <span v-if="hasInvalidAmount" class="text-body-2 text-error">{{ $t('accounting.entry.invalidAmount') }}</span>
        </div>
      </v-card-text>

      <v-card-actions v-if="!readonly && canCreate" class="flex-wrap ga-2">
        <v-btn v-if="isDraft" color="error" variant="text" prepend-icon="mdi-delete-outline" @click="deleteDialog = true">{{ $t('accounting.entry.deleteDraft') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" :disabled="!canSave" :loading="store.saving" @click="saveDraft">{{ $t('accounting.entry.saveDraft') }}</v-btn>
        <v-btn v-if="canPost" color="primary" :disabled="!canPostNow" :loading="store.saving" @click="post">{{ $t('accounting.entry.post') }}</v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog v-model="deleteDialog">
      <v-card>
        <v-card-title>{{ $t('accounting.entry.deleteDraft') }}</v-card-title>
        <v-card-text>{{ $t('accounting.entry.deleteConfirm') }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :loading="store.saving" @click="remove">{{ $t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="reverseDialog">
      <v-card>
        <v-card-title>{{ $t('accounting.entry.reverse') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <p class="text-body-2 text-medium-emphasis">{{ $t('accounting.entry.reverseIntro') }}</p>
          <v-textarea v-model="reverseReason" :label="$t('accounting.entry.reverseReason')" rows="2" maxlength="200" />
          <v-text-field v-model="reverseDate" type="date" :label="$t('accounting.entry.reverseDate')" :hint="$t('accounting.entry.reverseDateHint')" persistent-hint />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="reverseDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="warning" :disabled="reverseReason.trim().length < 3" :loading="store.saving" @click="reverse">{{ $t('accounting.entry.reverse') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" timeout="4000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

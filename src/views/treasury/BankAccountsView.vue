<script setup lang="ts">
/**
 * Bancos: las cuentas bancarias de la organización con su saldo SEGÚN EL REGISTRO de tesorería (apertura + lo cobrado y pagado por banco +
 * los renglones del extracto marcados como contabilizados fuera de tesorería). No es el saldo del banco: ese lo dice el extracto, y lo que
 * separa a uno del otro es justo lo que se concilia. Los cobros y pagos anteriores a este módulo, o elegidos sin cuenta, esperan aquí a que
 * alguien les asigne la suya.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryBankingStore } from '@/stores/treasuryBanking';
import { formatMoney } from '@/utils/accounting';
import type { BankAccount, BankAccountInput, BankAccountSummary, BankMovementView } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';
import BankAccountDialog from '@/components/treasury/BankAccountDialog.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useTreasuryBankingStore();

const canManage = computed(() => auth.can('bank_account:manage'));
const canReconcile = computed(() => auth.can('reconciliation:manage'));
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);

const dialog = ref(false);
const editing = ref<BankAccountSummary | null>(null);
const dialogError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

onMounted(() => void store.fetchAccounts());

function openNew(): void {
  editing.value = null;
  dialogError.value = null;
  dialog.value = true;
}
function openEdit(account: BankAccountSummary): void {
  editing.value = account;
  dialogError.value = null;
  dialog.value = true;
}
/** La apertura queda fija cuando la cuenta ya tiene extractos o conciliaciones: moverla cambiaría en silencio lo ya conciliado. */
const openingLocked = computed(() => editing.value !== null && (editing.value.lastStatementDate !== null || editing.value.lastReconciledOn !== null));

async function save(input: BankAccountInput, isActive: boolean): Promise<void> {
  dialogError.value = null;
  try {
    if (editing.value) {
      const patch: Record<string, unknown> = { ...input, isActive, expectedVersion: editing.value.version };
      if (openingLocked.value) {
        delete patch.openingBalanceCents;
        delete patch.openingDate;
      }
      await store.updateAccount(editing.value.id, patch as never);
    } else {
      await store.createAccount(input);
    }
    dialog.value = false;
    snackbar.value = t('treasury.banking.saved');
    await store.fetchAccounts();
  } catch {
    dialogError.value = store.error;
  }
}

// ── Movimientos sin cuenta ──
const unassignedDialog = ref(false);
const unassigned = ref<BankMovementView[]>([]);
const assignError = ref<string | null>(null);
const activeAccounts = computed(() => store.accounts.filter((a) => a.isActive));
const accountItems = computed(() => activeAccounts.value.map((a) => ({ value: a.id, title: a.name })));

async function openUnassigned(): Promise<void> {
  assignError.value = null;
  unassigned.value = await store.fetchMovements({ bankAccountId: 'none', status: ['active'], pageSize: 100 });
  unassignedDialog.value = true;
}
async function assign(movement: BankMovementView, bankAccountId: string | null): Promise<void> {
  if (!bankAccountId) return;
  assignError.value = null;
  try {
    await store.assignMovementAccount(movement.id, bankAccountId);
    unassigned.value = unassigned.value.filter((m) => m.id !== movement.id);
    await store.fetchAccounts();
    if (unassigned.value.length === 0) unassignedDialog.value = false;
  } catch {
    assignError.value = store.error;
  }
}

const unassignedHeaders = computed(() => [
  { title: t('treasury.banking.movements.date'), key: 'movementDate', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.movements.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.movements.amount'), key: 'amountCents', sortable: false, align: 'end' as const },
  { title: t('treasury.banking.movements.account'), key: 'account', sortable: false, align: 'start' as const },
]);
const typeLabel = (a: BankAccount) => t(`treasury.banking.types.${a.accountType}`);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.banking.intro')">
      <template #actions>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-bank-plus" @click="openNew">{{ $t('treasury.banking.newAccount') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !dialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-alert v-if="store.unassignedMovements > 0" type="warning" class="mb-4">
      <div class="d-flex flex-wrap align-center ga-2">
        <span class="flex-grow-1">{{ $t('treasury.banking.unassigned', { n: store.unassignedMovements }) }}</span>
        <v-btn v-if="canManage && activeAccounts.length > 0" size="small" variant="flat" color="warning" @click="openUnassigned">{{ $t('treasury.banking.assignAccount') }}</v-btn>
      </div>
    </v-alert>

    <v-row>
      <v-col v-for="account in store.accounts" :key="account.id" cols="12" md="6" lg="4">
        <v-card :class="{ 'text-medium-emphasis': !account.isActive }">
          <v-card-text>
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon icon="mdi-bank-outline" />
              <div class="text-h6 flex-grow-1">{{ account.name }}</div>
              <v-chip v-if="!account.isActive" size="x-small" variant="flat" color="lightsecondary">{{ $t('treasury.banking.inactive') }}</v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ account.bankName }} · {{ typeLabel(account) }}<template v-if="account.accountLast4"> · ••{{ account.accountLast4 }}</template>
            </div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.registerBalance') }}</div>
            <div class="text-h5 mb-3" :class="{ 'text-error': account.registerBalanceCents < 0 }">{{ money(account.registerBalanceCents, account.currencyCode) }}</div>
            <div class="d-flex flex-wrap ga-2 mb-2">
              <v-chip size="small" variant="flat" :color="account.unmatchedLines > 0 ? 'lightwarning' : 'lightsuccess'">{{ $t('treasury.banking.unmatchedLines', { n: account.unmatchedLines }) }}</v-chip>
              <v-chip size="small" variant="flat" :color="account.unmatchedMovements > 0 ? 'lightinfo' : 'lightsuccess'">{{ $t('treasury.banking.unmatchedMovements', { n: account.unmatchedMovements }) }}</v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ account.lastReconciledOn ? $t('treasury.banking.lastReconciled', { date: account.lastReconciledOn }) : $t('treasury.banking.neverReconciled') }}
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ account.lastStatementDate ? $t('treasury.banking.lastStatement', { date: account.lastStatementDate }) : $t('treasury.banking.noStatement') }}
            </div>
          </v-card-text>
          <v-card-actions class="flex-wrap ga-2">
            <v-btn variant="tonal" prepend-icon="mdi-scale-balance" :to="{ name: 'treasury-bank-reconcile', params: { id: account.id } }">{{ canReconcile ? $t('treasury.banking.reconcile.open') : $t('treasury.banking.reconcile.view') }}</v-btn>
            <v-btn v-if="canManage && account.isActive" variant="text" prepend-icon="mdi-file-upload-outline" :to="{ name: 'treasury-bank-import', params: { id: account.id } }">{{ $t('treasury.banking.importStatement') }}</v-btn>
            <v-spacer />
            <v-btn v-if="canManage" variant="text" icon="mdi-pencil-outline" :aria-label="$t('common.edit')" @click="openEdit(account)" />
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-if="!store.loading && store.accounts.length === 0">
      <v-card-text class="text-center py-8">
        <v-icon icon="mdi-bank-outline" size="48" class="mb-2 text-medium-emphasis" />
        <div class="text-h6">{{ $t('treasury.banking.emptyTitle') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ $t('treasury.banking.empty') }}</div>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-bank-plus" @click="openNew">{{ $t('treasury.banking.newAccount') }}</v-btn>
      </v-card-text>
    </v-card>

    <BankAccountDialog v-model="dialog" :account="editing" :saving="store.saving" :server-error="dialogError" :opening-locked="openingLocked" @save="save" />

    <v-dialog v-model="unassignedDialog" max-width="860" scrollable>
      <v-card>
        <v-card-title>{{ $t('treasury.banking.assignTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="assignError" type="error" class="mb-4">{{ assignError }}</v-alert>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.banking.assignHint') }}</div>
          <v-data-table :headers="unassignedHeaders" :items="unassigned" :items-per-page="-1" hide-default-footer>
            <template #item.amountCents="{ item }">
              <span :class="item.amountCents < 0 ? 'text-error' : 'text-success'">{{ money(item.amountCents) }}</span>
            </template>
            <template #item.account="{ item }">
              <v-select :items="accountItems" :label="$t('treasury.banking.chooseAccount')" hide-details style="min-width: 200px" @update:model-value="(v: string | null) => assign(item, v)" />
            </template>
          </v-data-table>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="unassignedDialog = false">{{ $t('common.close') }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

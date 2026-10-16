<script setup lang="ts">
/**
 * Balance de comprobación y libro mayor.
 *
 * El balance muestra, por cuenta, el saldo inicial, lo movido en el rango y el saldo final, sumando las cuentas de detalle en las
 * de agrupación. Pulsar el código de una cuenta de detalle abre su libro mayor con el saldo acumulado línea a línea. Los
 * importes salen como «Deudor»/«Acreedor» (el saldo neto con su signo en columnas separadas).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { todayLocal, useAccountingStore } from '@/stores/accounting';
import { formatMoney, splitBalance } from '@/utils/accounting';
import type { TrialBalanceRow } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useAccountingStore();

const loadError = ref<string | null>(null);
const from = ref(`${new Date().getFullYear()}-01-01`);
const to = ref(todayLocal());
const costCenterId = ref<string | null>(null);
const includeZero = ref(false);
const level = ref<number | null>(null);
const ledgerPage = ref(1);
const ledgerPageSize = 50;

const accountId = computed(() => (typeof route.query.account === 'string' ? route.query.account : null));
const ledgerAccount = computed(() => store.accountById.get(accountId.value ?? '') ?? null);

const money = (cents: number): string => (cents === 0 ? '' : formatMoney(cents, locale.value, store.currency));
const costCenterOptions = computed(() => store.costCenters.map((c) => ({ value: c.id, title: `${c.code}  ${c.name}` })));
const levelOptions = computed(() => [
  { value: null, title: t('accounting.reports.allLevels') },
  ...[1, 2, 3, 4].map((n) => ({ value: n, title: t('accounting.reports.upToLevel', { n }) })),
]);

const headers = computed(() => [
  { title: t('accounting.accounts.code'), key: 'code', sortable: false, align: 'start' as const },
  { title: t('common.name'), key: 'name', sortable: false, align: 'start' as const },
  { title: t('accounting.reports.openingDebit'), key: 'od', sortable: false, align: 'end' as const },
  { title: t('accounting.reports.openingCredit'), key: 'oc', sortable: false, align: 'end' as const },
  { title: t('accounting.entry.debit'), key: 'debitCents', sortable: false, align: 'end' as const },
  { title: t('accounting.entry.credit'), key: 'creditCents', sortable: false, align: 'end' as const },
  { title: t('accounting.reports.closingDebit'), key: 'cd', sortable: false, align: 'end' as const },
  { title: t('accounting.reports.closingCredit'), key: 'cc', sortable: false, align: 'end' as const },
]);
const ledgerHeaders = computed(() => [
  { title: t('common.date'), key: 'entryDate', sortable: false, align: 'start' as const },
  { title: t('accounting.journal.number'), key: 'entryNumber', sortable: false, align: 'start' as const },
  { title: t('common.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('accounting.entry.debit'), key: 'debitCents', sortable: false, align: 'end' as const },
  { title: t('accounting.entry.credit'), key: 'creditCents', sortable: false, align: 'end' as const },
  { title: t('accounting.reports.balance'), key: 'runningCents', sortable: false, align: 'end' as const },
]);

const rows = computed(() =>
  (store.trialBalance?.rows ?? []).map((r) => ({
    ...r,
    od: splitBalance(r.openingCents).debit,
    oc: splitBalance(r.openingCents).credit,
    cd: splitBalance(r.closingCents).debit,
    cc: splitBalance(r.closingCents).credit,
  })),
);
const totals = computed(() => {
  const tot = store.trialBalance?.totals;
  if (!tot) return null;
  return {
    od: splitBalance(tot.openingCents).debit,
    oc: splitBalance(tot.openingCents).credit,
    debit: tot.debitCents,
    credit: tot.creditCents,
    cd: splitBalance(tot.closingCents).debit,
    cc: splitBalance(tot.closingCents).credit,
  };
});

async function loadReport(): Promise<void> {
  loadError.value = null;
  try {
    if (store.configured === null) await store.fetchSettings();
    if (!store.configured) return;
    if (store.accounts.length === 0) await Promise.all([store.fetchAccounts(), store.fetchCostCenters()]);
    if (accountId.value) {
      await store.fetchLedger({ accountId: accountId.value, from: from.value, to: to.value, page: ledgerPage.value, pageSize: ledgerPageSize });
    } else {
      await store.fetchTrialBalance({
        from: from.value,
        to: to.value,
        costCenterId: costCenterId.value ?? undefined,
        includeZero: includeZero.value || undefined,
        maxLevel: level.value ?? undefined,
      });
    }
  } catch {
    loadError.value = store.error;
  }
}

onMounted(loadReport);
watch([from, to, costCenterId, includeZero, level, accountId], () => {
  ledgerPage.value = 1;
  void loadReport();
});
watch(ledgerPage, loadReport);

function openLedger(row: TrialBalanceRow): void {
  if (row.accountId && row.isPostable) void router.push({ query: { account: row.accountId } });
}
function closeLedger(): void {
  void router.push({ query: {} });
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="accountId ? $t('accounting.reports.ledgerIntro') : $t('accounting.reports.intro')">
      <template #actions>
        <v-btn v-if="accountId" variant="text" prepend-icon="mdi-arrow-left" @click="closeLedger">{{ $t('accounting.reports.backToBalance') }}</v-btn>
      </template>
    </PageHeader>

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>

    <AccountingSetupCard v-if="store.configured === false" @done="loadReport" />

    <template v-else-if="store.configured">
      <v-card class="mb-4">
        <v-card-text>
          <v-row>
            <v-col cols="6" sm="2"><v-text-field v-model="from" type="date" :label="$t('accounting.journal.from')" /></v-col>
            <v-col cols="6" sm="2"><v-text-field v-model="to" type="date" :label="$t('accounting.journal.to')" /></v-col>
            <template v-if="!accountId">
              <v-col cols="12" sm="3"><v-select v-model="costCenterId" :items="costCenterOptions" :label="$t('accounting.entry.costCenter')" clearable /></v-col>
              <v-col cols="12" sm="2"><v-select v-model="level" :items="levelOptions" :label="$t('accounting.reports.level')" /></v-col>
              <v-col cols="12" sm="3" class="d-flex align-center"><v-switch v-model="includeZero" color="primary" :label="$t('accounting.reports.includeZero')" hide-details /></v-col>
            </template>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Libro mayor de una cuenta -->
      <v-card v-if="accountId">
        <v-card-title>{{ ledgerAccount ? `${ledgerAccount.code}  ${ledgerAccount.name}` : '' }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ $t('accounting.reports.opening') }}:
            <span class="font-weight-medium">{{ formatMoney(store.ledger?.openingCents ?? 0, locale, store.currency) }}</span>
          </p>
          <v-data-table-server
            v-model:page="ledgerPage"
            :items-per-page="ledgerPageSize"
            :headers="ledgerHeaders"
            :items="store.ledger?.lines ?? []"
            :items-length="store.ledger?.total ?? 0"
            :loading="store.loading"
          >
            <template #item.entryNumber="{ item }">
              <router-link v-if="item.entryNumber" :to="{ name: 'accounting-entry', params: { id: item.entryId } }">{{ item.entryNumber }}</router-link>
            </template>
            <template #item.debitCents="{ item }">{{ money(item.debitCents) }}</template>
            <template #item.creditCents="{ item }">{{ money(item.creditCents) }}</template>
            <template #item.runningCents="{ item }">
              <span class="font-weight-medium">{{ formatMoney(item.runningCents, locale, store.currency) }}</span>
            </template>
            <template #no-data>{{ $t('accounting.reports.noMovements') }}</template>
          </v-data-table-server>
        </v-card-text>
      </v-card>

      <!-- Balance de comprobación -->
      <v-card v-else>
        <v-card-text>
          <v-data-table :headers="headers" :items="rows" :items-per-page="-1" hide-default-footer :loading="store.loading">
            <template #item.code="{ item }">
              <a v-if="item.isPostable" class="cursor-pointer" @click="openLedger(item)">{{ item.code }}</a>
              <span v-else :class="{ 'font-weight-medium': !item.synthetic }">{{ item.code }}</span>
            </template>
            <template #item.name="{ item }">
              <span :class="{ 'font-weight-medium': !item.isPostable, 'text-medium-emphasis': item.synthetic }">{{ item.name }}</span>
            </template>
            <template #item.od="{ item }">{{ money(item.od) }}</template>
            <template #item.oc="{ item }">{{ money(item.oc) }}</template>
            <template #item.debitCents="{ item }">{{ money(item.debitCents) }}</template>
            <template #item.creditCents="{ item }">{{ money(item.creditCents) }}</template>
            <template #item.cd="{ item }">{{ money(item.cd) }}</template>
            <template #item.cc="{ item }">{{ money(item.cc) }}</template>
            <template #bottom>
              <div v-if="totals" class="d-flex flex-wrap justify-end ga-6 pa-4 font-weight-medium">
                <span>{{ $t('accounting.reports.totals') }}</span>
                <span>{{ $t('accounting.entry.debit') }}: {{ formatMoney(totals.debit, locale, store.currency) }}</span>
                <span>{{ $t('accounting.entry.credit') }}: {{ formatMoney(totals.credit, locale, store.currency) }}</span>
                <v-chip variant="flat" :color="totals.debit === totals.credit ? 'lightsuccess' : 'lighterror'">
                  {{ totals.debit === totals.credit ? $t('accounting.reports.balanced') : $t('accounting.reports.unbalanced') }}
                </v-chip>
              </div>
            </template>
            <template #no-data>{{ $t('accounting.reports.empty') }}</template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>

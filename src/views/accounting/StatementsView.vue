<script setup lang="ts">
/**
 * Estados financieros: balance general y estado de resultados, con comparación contra otra fecha o periodo, exportación a CSV
 * (se abre en Excel) e impresión / PDF.
 *
 * Todos los importes salen en el sentido NATURAL de su cuenta (lo normal es positivo): un activo con saldo deudor, un pasivo con
 * saldo acreedor. Una cuenta regularizadora (depreciación acumulada, devoluciones en ventas) sale en negativo y resta.
 * En el balance, el resultado del ejercicio y los resultados de ejercicios anteriores sin cerrar van DENTRO del patrimonio: por eso
 * activo = pasivo + patrimonio.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { todayLocal, useAccountingStore } from '@/stores/accounting';
import { formatMoney } from '@/utils/accounting';
import { downloadText, previousRange, sameDayLastYear, sameRangeLastYear, statementToCsv, variation } from '@/utils/statements';
import type { StatementSection } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t, locale } = useI18n();
const store = useAccountingStore();

const tab = ref<'balance' | 'income'>('balance');
const loadError = ref<string | null>(null);

const today = todayLocal();
const year = today.slice(0, 4);
const asOf = ref(today);
const from = ref(`${year}-01-01`);
const to = ref(today);
const compareMode = ref<'none' | 'previous' | 'lastYear'>('none');
const costCenterId = ref<string | null>(null);
const level = ref<number | null>(null);
const includeZero = ref(false);

const compareOptions = computed(() => [
  { value: 'none', title: t('accounting.statements.compare.none') },
  { value: 'previous', title: tab.value === 'balance' ? t('accounting.statements.compare.yearEnd') : t('accounting.statements.compare.previousPeriod') },
  { value: 'lastYear', title: t('accounting.statements.compare.lastYear') },
]);
const levelOptions = computed(() => [
  { value: null, title: t('accounting.reports.allLevels') },
  ...[1, 2, 3, 4].map((n) => ({ value: n, title: t('accounting.reports.upToLevel', { n }) })),
]);
const costCenterOptions = computed(() => store.costCenters.map((c) => ({ value: c.id, title: `${c.code}  ${c.name}` })));

/** La fecha de comparación del balance: el cierre del año anterior (31/12) o la misma fecha un año antes. */
const compareAsOf = computed(() => {
  if (compareMode.value === 'none') return undefined;
  return compareMode.value === 'previous' ? `${Number(asOf.value.slice(0, 4)) - 1}-12-31` : sameDayLastYear(asOf.value);
});
const compareRange = computed(() => {
  if (compareMode.value === 'none') return undefined;
  return compareMode.value === 'previous' ? previousRange(from.value, to.value) : sameRangeLastYear(from.value, to.value);
});

const money = (cents: number): string => formatMoney(cents, locale.value, store.currency);
const comparing = computed(() => compareMode.value !== 'none');

async function load(): Promise<void> {
  loadError.value = null;
  try {
    if (store.configured === null) await store.fetchSettings();
    if (!store.configured) return;
    if (store.accounts.length === 0) await Promise.all([store.fetchAccounts(), store.fetchCostCenters()]);
    const common = { costCenterId: costCenterId.value ?? undefined, includeZero: includeZero.value || undefined, maxLevel: level.value ?? undefined };
    if (tab.value === 'balance') {
      await store.fetchBalanceSheet({ asOf: asOf.value, compareAsOf: compareAsOf.value, ...common });
    } else {
      await store.fetchIncomeStatement({
        from: from.value,
        to: to.value,
        compareFrom: compareRange.value?.from,
        compareTo: compareRange.value?.to,
        ...common,
      });
    }
  } catch {
    loadError.value = store.error;
  }
}

onMounted(load);
let timer: ReturnType<typeof setTimeout> | undefined;
watch([tab, asOf, from, to, compareMode, costCenterId, level, includeZero], () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});

function quickRange(kind: 'month' | 'year' | 'lastYear'): void {
  const [y, m] = today.split('-').map(Number);
  if (kind === 'month') {
    from.value = `${y}-${String(m).padStart(2, '0')}-01`;
    to.value = today;
  } else if (kind === 'year') {
    from.value = `${y}-01-01`;
    to.value = today;
  } else {
    from.value = `${y! - 1}-01-01`;
    to.value = `${y! - 1}-12-31`;
  }
}

const sectionTitle = (s: StatementSection): string => t(`accounting.statements.sections.${s.key}`);

function pct(amount: number, compare: number | null): string {
  const v = variation(amount, compare);
  if (!v || v.pct === null) return '';
  return `${v.pct > 0 ? '+' : ''}${v.pct.toFixed(1)} %`;
}
const diffMoney = (amount: number, compare: number | null): string => {
  const v = variation(amount, compare);
  return v ? money(v.diff) : '';
};

function exportCsv(): void {
  const statement = tab.value === 'balance' ? store.balanceSheet : store.incomeStatement;
  if (!statement) return;
  const titles: Record<string, string> = {
    assets: t('accounting.statements.sections.assets'),
    liabilities: t('accounting.statements.sections.liabilities'),
    equity: t('accounting.statements.sections.equity'),
    income: t('accounting.statements.sections.income'),
    costs: t('accounting.statements.sections.costs'),
    expenses: t('accounting.statements.sections.expenses'),
    grossProfit: t('accounting.statements.grossProfit'),
    netResult: t('accounting.statements.netResult'),
  };
  const csv = statementToCsv(statement, {
    code: t('accounting.accounts.code'),
    account: t('accounting.entry.account'),
    amount: t('accounting.statements.amount'),
    compare: t('accounting.statements.comparison'),
    variation: t('accounting.statements.variation'),
    titles,
    total: t('accounting.statements.total'),
  });
  const name = tab.value === 'balance' ? `balance-general-${asOf.value}` : `estado-de-resultados-${from.value}_${to.value}`;
  downloadText(`${name}.csv`, csv);
}

const print = (): void => window.print();

const isCurrentBalanced = computed(() => (store.balanceSheet?.totals.differenceCents ?? 0) === 0);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="$t('accounting.statements.intro')" class="d-print-none" />

    <div class="d-print-none"><AccountingTabs /></div>

    <v-alert v-if="loadError" type="error" class="mb-4 d-print-none">{{ loadError }}</v-alert>

    <AccountingSetupCard v-if="store.configured === false" @done="load" />

    <template v-else-if="store.configured">
      <v-card class="mb-4 d-print-none">
        <v-tabs v-model="tab" density="comfortable">
          <v-tab value="balance">{{ $t('accounting.statements.balanceSheet') }}</v-tab>
          <v-tab value="income">{{ $t('accounting.statements.incomeStatement') }}</v-tab>
        </v-tabs>
        <v-divider />
        <v-card-text>
          <v-row>
            <template v-if="tab === 'balance'">
              <v-col cols="12" sm="3"><v-text-field v-model="asOf" type="date" :label="$t('accounting.statements.asOf')" /></v-col>
            </template>
            <template v-else>
              <v-col cols="6" sm="2"><v-text-field v-model="from" type="date" :label="$t('accounting.journal.from')" /></v-col>
              <v-col cols="6" sm="2"><v-text-field v-model="to" type="date" :label="$t('accounting.journal.to')" /></v-col>
            </template>
            <v-col cols="12" sm="3"><v-select v-model="compareMode" :items="compareOptions" :label="$t('accounting.statements.compareWith')" /></v-col>
            <v-col cols="12" sm="3"><v-select v-model="costCenterId" :items="costCenterOptions" :label="$t('accounting.entry.costCenter')" clearable /></v-col>
            <v-col cols="12" sm="2"><v-select v-model="level" :items="levelOptions" :label="$t('accounting.reports.level')" /></v-col>
          </v-row>
          <div class="d-flex flex-wrap align-center ga-2">
            <template v-if="tab === 'income'">
              <v-btn size="small" variant="text" @click="quickRange('month')">{{ $t('accounting.statements.thisMonth') }}</v-btn>
              <v-btn size="small" variant="text" @click="quickRange('year')">{{ $t('accounting.statements.thisYear') }}</v-btn>
              <v-btn size="small" variant="text" @click="quickRange('lastYear')">{{ $t('accounting.statements.lastYear') }}</v-btn>
            </template>
            <v-switch v-model="includeZero" color="primary" :label="$t('accounting.reports.includeZero')" hide-details class="mr-4" />
            <v-spacer />
            <v-btn variant="text" prepend-icon="mdi-download" :disabled="!(tab === 'balance' ? store.balanceSheet : store.incomeStatement)" @click="exportCsv">{{ $t('accounting.statements.exportCsv') }}</v-btn>
            <v-btn variant="text" prepend-icon="mdi-printer-outline" @click="print">{{ $t('accounting.statements.print') }}</v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- Balance general -->
      <v-card v-if="tab === 'balance' && store.balanceSheet">
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ $t('accounting.statements.balanceSheet') }} · {{ $t('accounting.statements.asOfDate', { date: store.balanceSheet.asOf }) }}
          <v-chip variant="flat" :color="isCurrentBalanced ? 'lightsuccess' : 'lighterror'" size="small">
            {{ isCurrentBalanced ? $t('accounting.statements.balanced') : $t('accounting.statements.unbalanced', { amount: money(store.balanceSheet.totals.differenceCents) }) }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>{{ $t('accounting.accounts.code') }}</th>
                <th>{{ $t('accounting.entry.account') }}</th>
                <th class="text-end">{{ store.balanceSheet.asOf }}</th>
                <template v-if="comparing">
                  <th class="text-end">{{ store.balanceSheet.compareAsOf }}</th>
                  <th class="text-end">{{ $t('accounting.statements.variation') }}</th>
                  <th class="text-end">%</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <template v-for="section in store.balanceSheet.sections" :key="section.key">
                <tr class="bg-lightprimary">
                  <td colspan="2" class="font-weight-medium">{{ sectionTitle(section) }}</td>
                  <td class="text-end font-weight-medium">{{ money(section.totalCents) }}</td>
                  <template v-if="comparing">
                    <td class="text-end font-weight-medium">{{ section.compareTotalCents === null ? '' : money(section.compareTotalCents) }}</td>
                    <td class="text-end">{{ diffMoney(section.totalCents, section.compareTotalCents) }}</td>
                    <td class="text-end">{{ pct(section.totalCents, section.compareTotalCents) }}</td>
                  </template>
                </tr>
                <tr v-for="r in section.rows" :key="`${section.key}-${r.accountId ?? r.name}`">
                  <td :class="{ 'font-weight-medium': !r.isPostable && !r.synthetic }">{{ r.code }}</td>
                  <td :class="{ 'font-weight-medium': !r.isPostable && !r.synthetic, 'text-medium-emphasis': r.synthetic }">
                    <span :class="`pl-${Math.min((r.level - 1) * 4, 12)}`">{{ r.name }}</span>
                  </td>
                  <td class="text-end">{{ money(r.amountCents) }}</td>
                  <template v-if="comparing">
                    <td class="text-end">{{ r.compareAmountCents === null ? '' : money(r.compareAmountCents) }}</td>
                    <td class="text-end">{{ diffMoney(r.amountCents, r.compareAmountCents) }}</td>
                    <td class="text-end">{{ pct(r.amountCents, r.compareAmountCents) }}</td>
                  </template>
                </tr>
              </template>
              <tr class="font-weight-medium">
                <td colspan="2">{{ $t('accounting.statements.liabilitiesAndEquity') }}</td>
                <td class="text-end">{{ money(store.balanceSheet.totals.liabilitiesAndEquityCents) }}</td>
                <template v-if="comparing">
                  <td class="text-end">{{ store.balanceSheet.totals.compareLiabilitiesAndEquityCents === null ? '' : money(store.balanceSheet.totals.compareLiabilitiesAndEquityCents) }}</td>
                  <td colspan="2" />
                </template>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <!-- Estado de resultados -->
      <v-card v-if="tab === 'income' && store.incomeStatement">
        <v-card-title>{{ $t('accounting.statements.incomeStatement') }} · {{ store.incomeStatement.from }} – {{ store.incomeStatement.to }}</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>{{ $t('accounting.accounts.code') }}</th>
                <th>{{ $t('accounting.entry.account') }}</th>
                <th class="text-end">{{ store.incomeStatement.from }} – {{ store.incomeStatement.to }}</th>
                <template v-if="comparing">
                  <th class="text-end">{{ store.incomeStatement.compareFrom }} – {{ store.incomeStatement.compareTo }}</th>
                  <th class="text-end">{{ $t('accounting.statements.variation') }}</th>
                  <th class="text-end">%</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <template v-for="section in store.incomeStatement.sections" :key="section.key">
                <tr class="bg-lightprimary">
                  <td colspan="2" class="font-weight-medium">{{ sectionTitle(section) }}</td>
                  <td class="text-end font-weight-medium">{{ money(section.totalCents) }}</td>
                  <template v-if="comparing">
                    <td class="text-end font-weight-medium">{{ section.compareTotalCents === null ? '' : money(section.compareTotalCents) }}</td>
                    <td class="text-end">{{ diffMoney(section.totalCents, section.compareTotalCents) }}</td>
                    <td class="text-end">{{ pct(section.totalCents, section.compareTotalCents) }}</td>
                  </template>
                </tr>
                <tr v-for="r in section.rows" :key="`${section.key}-${r.accountId}`">
                  <td :class="{ 'font-weight-medium': !r.isPostable }">{{ r.code }}</td>
                  <td :class="{ 'font-weight-medium': !r.isPostable }"><span :class="`pl-${Math.min((r.level - 1) * 4, 12)}`">{{ r.name }}</span></td>
                  <td class="text-end">{{ money(r.amountCents) }}</td>
                  <template v-if="comparing">
                    <td class="text-end">{{ r.compareAmountCents === null ? '' : money(r.compareAmountCents) }}</td>
                    <td class="text-end">{{ diffMoney(r.amountCents, r.compareAmountCents) }}</td>
                    <td class="text-end">{{ pct(r.amountCents, r.compareAmountCents) }}</td>
                  </template>
                </tr>
                <tr v-if="section.key === 'costs'" class="font-weight-medium">
                  <td colspan="2">{{ $t('accounting.statements.grossProfit') }}</td>
                  <td class="text-end">{{ money(store.incomeStatement.grossProfitCents) }}</td>
                  <template v-if="comparing">
                    <td class="text-end">{{ store.incomeStatement.compareGrossProfitCents === null ? '' : money(store.incomeStatement.compareGrossProfitCents) }}</td>
                    <td class="text-end">{{ diffMoney(store.incomeStatement.grossProfitCents, store.incomeStatement.compareGrossProfitCents) }}</td>
                    <td class="text-end">{{ pct(store.incomeStatement.grossProfitCents, store.incomeStatement.compareGrossProfitCents) }}</td>
                  </template>
                </tr>
              </template>
              <tr class="font-weight-medium" :class="store.incomeStatement.netResultCents >= 0 ? 'bg-lightsuccess' : 'bg-lighterror'">
                <td colspan="2">{{ $t('accounting.statements.netResult') }}</td>
                <td class="text-end">{{ money(store.incomeStatement.netResultCents) }}</td>
                <template v-if="comparing">
                  <td class="text-end">{{ store.incomeStatement.compareNetResultCents === null ? '' : money(store.incomeStatement.compareNetResultCents) }}</td>
                  <td class="text-end">{{ diffMoney(store.incomeStatement.netResultCents, store.incomeStatement.compareNetResultCents) }}</td>
                  <td class="text-end">{{ pct(store.incomeStatement.netResultCents, store.incomeStatement.compareNetResultCents) }}</td>
                </template>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </template>
  </v-container>
</template>

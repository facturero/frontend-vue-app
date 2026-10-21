<script setup lang="ts">
/**
 * Antigüedad de la cartera: lo que está corriente y lo que está vencido, por tramos de días. Solo entra la deuda con saldo a favor de
 * la empresa; una partida anulada con una nota de crédito encima (saldo en contra) no es cartera vencida.
 */
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useTreasuryStore } from '@/stores/treasury';
import { formatMoney } from '@/utils/accounting';
import { agingShares, AGING_BUCKETS } from '@/utils/treasury';
import type { AgingCustomer } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const router = useRouter();
const store = useTreasuryStore();

onMounted(() => void store.fetchAging());

const aging = computed(() => store.aging);
const shares = computed(() => (aging.value ? agingShares(aging.value.totals) : {}));
const headers = computed(() => [
  { title: t('treasury.aging.customer'), key: 'customerName', sortable: false, align: 'start' as const },
  ...AGING_BUCKETS.map((b) => ({ title: t(b.labelKey), key: b.key, sortable: false, align: 'end' as const })),
  { title: t('treasury.aging.total'), key: 'totalCents', sortable: false, align: 'end' as const },
]);
const money = (cents: number) => formatMoney(cents, locale.value);
const openCustomer = (item: AgingCustomer) => router.push({ name: 'treasury-customer-statement', params: { id: item.customerId } });
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.aging.intro')" />
    <TreasuryTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-row v-if="aging" class="mb-2">
      <v-col v-for="bucket in AGING_BUCKETS" :key="bucket.key" cols="12" sm="6" md>
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t(bucket.labelKey) }}</div>
            <div class="text-h6">{{ money(aging.totals[bucket.key]) }}</div>
            <v-progress-linear :model-value="shares[bucket.key] ?? 0" :color="bucket.color" height="6" class="mt-2" />
            <div class="text-body-2 text-medium-emphasis mt-1">{{ shares[bucket.key] ?? 0 }} %</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card>
      <v-card-title class="text-h6">
        {{ $t('treasury.aging.byCustomer') }}
        <span v-if="aging" class="text-body-2 text-medium-emphasis ml-2">{{ $t('treasury.aging.asOf', { date: aging.asOf }) }}</span>
      </v-card-title>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="aging?.customers ?? []"
          :loading="store.loading"
          :items-per-page="-1"
          hide-default-footer
          @click:row="(_: Event, { item }: { item: AgingCustomer }) => openCustomer(item)"
        >
          <template v-for="bucket in AGING_BUCKETS" :key="bucket.key" #[`item.${bucket.key}`]="{ item }">
            <span :class="item[bucket.key] === 0 ? 'text-medium-emphasis' : undefined">{{ money(item[bucket.key]) }}</span>
          </template>
          <template #item.totalCents="{ item }"><strong>{{ money(item.totalCents) }}</strong></template>
          <template #body.append>
            <tr v-if="aging && aging.customers.length > 0" class="font-weight-bold">
              <td>{{ $t('treasury.aging.total') }}</td>
              <td v-for="bucket in AGING_BUCKETS" :key="bucket.key" class="text-end">{{ money(aging.totals[bucket.key]) }}</td>
              <td class="text-end">{{ money(aging.totals.totalCents) }}</td>
            </tr>
          </template>
          <template #no-data>{{ $t('treasury.aging.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

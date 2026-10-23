<script setup lang="ts">
/**
 * Compara la versión con lo que registró el libro mayor en el mismo periodo. Una diferencia NO se oculta ni se corrige aquí: se muestra
 * para que el contador la explique. Se consulta a pedido (contabilidad es otro servicio y puede tardar o no estar).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatMoney } from '@/utils/accounting';
import { useReportingStore } from '@/stores/reporting';
import type { AnnexType } from '@/types/reporting';

const props = defineProps<{ annex: AnnexType; period: string }>();

const { t, locale } = useI18n();
const store = useReportingStore();
const money = (cents: number) => formatMoney(cents, locale.value);
const result = computed(() => store.reconciliation);

const headers = computed(() => [
  { key: 'label', title: t('reporting.reconciliation.item'), sortable: false },
  { key: 'annexCents', title: t('reporting.reconciliation.annex'), sortable: false, align: 'end' as const },
  { key: 'accountingCents', title: t('reporting.reconciliation.accounting'), sortable: false, align: 'end' as const },
  { key: 'differenceCents', title: t('reporting.reconciliation.difference'), sortable: false, align: 'end' as const },
]);
const check = (): Promise<void> => store.fetchReconciliation(props.annex, props.period);
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">{{ $t('reporting.reconciliation.title') }}</v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('reporting.reconciliation.intro') }}</p>
      <v-btn variant="tonal" prepend-icon="mdi-scale-balance" :loading="store.loading" data-testid="reconciliation-check" @click="check">
        {{ result || store.reconciliationError ? $t('reporting.reconciliation.recheck') : $t('reporting.reconciliation.check') }}
      </v-btn>

      <v-alert v-if="store.reconciliationError" type="error" class="mt-4">{{ store.reconciliationError }}</v-alert>
      <template v-else-if="result">
        <v-alert v-if="result.status === 'unavailable'" type="info" class="mt-4">{{ $t('reporting.reconciliation.unavailable') }}</v-alert>
        <template v-else>
          <v-alert :type="result.status === 'ok' ? 'success' : 'warning'" class="mt-4" data-testid="reconciliation-status">
            {{ $t(result.status === 'ok' ? 'reporting.reconciliation.ok' : 'reporting.reconciliation.mismatch') }}
          </v-alert>
          <v-data-table :headers="headers" :items="result.items" :items-per-page="-1" hide-default-footer class="mt-4">
            <template #item.label="{ item }">{{ $te(`reporting.reconciliation.items.${item.code}`) ? $t(`reporting.reconciliation.items.${item.code}`) : item.label }}</template>
            <template #item.annexCents="{ item }">{{ money(item.annexCents) }}</template>
            <template #item.accountingCents="{ item }">{{ money(item.accountingCents) }}</template>
            <template #item.differenceCents="{ item }">
              <v-chip :color="item.differenceCents === 0 ? 'success' : 'warning'" size="small">{{ money(item.differenceCents) }}</v-chip>
            </template>
          </v-data-table>
        </template>
      </template>
    </v-card-text>
  </v-card>
</template>

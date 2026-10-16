<script setup lang="ts">
/**
 * Ejercicios fiscales y periodos. Cerrar un periodo impide contabilizar con fecha dentro de él; se cierran en orden y, para
 * reabrir, de atrás hacia adelante. El servicio explica el motivo cuando no se puede (borradores pendientes, un periodo anterior
 * abierto…).
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useAccountingStore } from '@/stores/accounting';
import type { Period } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const store = useAccountingStore();

const canManage = computed(() => auth.can('period:manage'));
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);
const yearDialog = ref(false);
const newYear = ref(new Date().getFullYear() + 1);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    await store.fetchSettings();
    if (store.configured) await store.fetchYears();
  } catch {
    loadError.value = store.error;
  }
}
onMounted(load);

/** «enero 2026»: se arma a mediodía UTC para que ninguna zona horaria corra el mes. */
function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const text = new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, 15, 12)));
  return text.charAt(0).toLocaleUpperCase(locale.value) + text.slice(1);
}

async function toggle(period: Period): Promise<void> {
  actionError.value = null;
  try {
    if (period.status === 'open') await store.closePeriod(period.id);
    else await store.reopenPeriod(period.id);
    snackbar.value = period.status === 'open' ? t('accounting.periods.closedDone') : t('accounting.periods.reopenedDone');
  } catch {
    actionError.value = store.error;
  }
}

async function createYear(): Promise<void> {
  actionError.value = null;
  try {
    await store.createYear(newYear.value);
    yearDialog.value = false;
    snackbar.value = t('accounting.periods.yearCreated');
  } catch {
    yearDialog.value = false;
    actionError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="$t('accounting.periods.intro')">
      <template #actions>
        <v-btn v-if="store.configured && canManage" color="primary" prepend-icon="mdi-plus" @click="yearDialog = true">{{ $t('accounting.periods.newYear') }}</v-btn>
      </template>
    </PageHeader>

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <AccountingSetupCard v-if="store.configured === false" @done="load" />

    <v-expansion-panels v-else-if="store.configured" multiple :model-value="store.years.map((_, i) => i).slice(0, 1)">
      <v-expansion-panel v-for="fy in store.years" :key="fy.id">
        <v-expansion-panel-title>
          {{ $t('accounting.periods.fiscalYear', { year: fy.year }) }}
          <v-chip class="ml-3" size="x-small" variant="flat" :color="fy.periods.every((p) => p.status === 'closed') ? 'lightsecondary' : 'lightsuccess'">
            {{ $t('accounting.periods.openCount', { open: fy.periods.filter((p) => p.status === 'open').length, total: fy.periods.length }) }}
          </v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>{{ $t('accounting.periods.period') }}</th>
                <th>{{ $t('accounting.periods.range') }}</th>
                <th>{{ $t('common.status') }}</th>
                <th v-if="canManage" class="text-end">{{ $t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in fy.periods" :key="p.id">
                <td>{{ monthLabel(p.startDate) }}</td>
                <td class="text-medium-emphasis">{{ p.startDate }} – {{ p.endDate }}</td>
                <td>
                  <v-chip size="x-small" variant="flat" :color="p.status === 'open' ? 'lightsuccess' : 'lightsecondary'">
                    {{ p.status === 'open' ? $t('accounting.periods.open') : $t('accounting.periods.closed') }}
                  </v-chip>
                </td>
                <td v-if="canManage" class="text-end">
                  <v-btn size="small" variant="text" :prepend-icon="p.status === 'open' ? 'mdi-lock-outline' : 'mdi-lock-open-variant-outline'" :loading="store.saving" @click="toggle(p)">
                    {{ p.status === 'open' ? $t('accounting.periods.close') : $t('accounting.periods.reopen') }}
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-dialog v-model="yearDialog">
      <v-card>
        <v-card-title>{{ $t('accounting.periods.newYear') }}</v-card-title>
        <v-card-text>
          <v-text-field v-model.number="newYear" type="number" :label="$t('accounting.setup.fiscalYear')" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="yearDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" @click="createYear">{{ $t('common.create') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

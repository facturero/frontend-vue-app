<script setup lang="ts">
/**
 * Libro diario: los asientos de la organización. Un borrador se puede editar y borrar; uno contabilizado solo se consulta y, si
 * hay un error, se reversa (la contabilidad no se edita ni se borra).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { todayLocal, useAccountingStore } from '@/stores/accounting';
import { formatMoney } from '@/utils/accounting';
import type { EntryStatus } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useAccountingStore();

const canCreate = computed(() => auth.can('journal:create'));
const loadError = ref<string | null>(null);

const status = ref<EntryStatus | null>(null);
const kind = ref<string | null>(null);
const from = ref(`${new Date().getFullYear()}-01-01`);
const to = ref(todayLocal());
const search = ref('');
const page = ref(1);
const pageSize = ref(25);

const headers = computed(() => [
  { title: t('accounting.journal.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('common.date'), key: 'entryDate', sortable: false, align: 'start' as const },
  { title: t('common.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('accounting.journal.total'), key: 'totalDebitCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);

const statusOptions = computed(() => [
  { value: null, title: t('common.all') },
  { value: 'draft', title: t('accounting.journal.status.draft') },
  { value: 'posted', title: t('accounting.journal.status.posted') },
]);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    if (store.configured === null) await store.fetchSettings();
    if (!store.configured) return;
    await store.fetchEntries({
      status: status.value ?? undefined,
      kind: kind.value ?? undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      q: search.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
  } catch {
    loadError.value = store.error;
  }
}

onMounted(load);
let timer: ReturnType<typeof setTimeout> | undefined;
watch([status, kind, from, to, search], () => {
  page.value = 1;
  clearTimeout(timer);
  timer = setTimeout(load, 300);
});
watch([page, pageSize], load);

const kindOptions = computed(() => [
  { value: null, title: t('common.all') },
  ...(['manual', 'automatic', 'reversal'] as const).map((k) => ({ value: k, title: t(`accounting.journal.kinds.${k}`) })),
]);

function open(_: unknown, row: { item: { id: string } }): void {
  void router.push({ name: 'accounting-entry', params: { id: row.item.id } });
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="$t('accounting.journal.intro')">
      <template #actions>
        <v-btn v-if="store.configured && canCreate" color="primary" prepend-icon="mdi-plus" :to="{ name: 'accounting-entry-new' }">
          {{ $t('accounting.journal.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>

    <AccountingSetupCard v-if="store.configured === false" @done="load" />

    <v-card v-else-if="store.configured">
      <v-card-text>
        <v-row>
          <v-col cols="6" sm="2"><v-select v-model="status" :items="statusOptions" :label="$t('common.status')" /></v-col>
          <v-col cols="6" sm="2"><v-select v-model="kind" :items="kindOptions" :label="$t('accounting.journal.kind')" /></v-col>
          <v-col cols="6" sm="2"><v-text-field v-model="from" type="date" :label="$t('accounting.journal.from')" /></v-col>
          <v-col cols="6" sm="2"><v-text-field v-model="to" type="date" :label="$t('accounting.journal.to')" /></v-col>
          <v-col cols="12" sm="4"><v-text-field v-model="search" prepend-inner-icon="mdi-magnify" :label="$t('common.search')" clearable /></v-col>
        </v-row>
        <v-data-table-server
          v-model:page="page"
          v-model:items-per-page="pageSize"
          :headers="headers"
          :items="store.entries"
          :items-length="store.entriesTotal"
          :loading="store.loading"
          class="cursor-pointer"
          @click:row="open"
        >
          <template #item.number="{ item }">
            <span v-if="item.number" class="font-weight-medium">{{ item.number }}</span>
            <span v-else class="text-medium-emphasis">{{ $t('accounting.journal.noNumber') }}</span>
          </template>
          <template #item.description="{ item }">
            {{ item.description }}
            <v-chip v-if="item.kind === 'reversal'" size="x-small" variant="flat" color="lightwarning" class="ml-2">{{ $t('accounting.journal.reversal') }}</v-chip>
            <v-chip v-else-if="item.reversedByEntryId" size="x-small" variant="flat" color="lighterror" class="ml-2">{{ $t('accounting.journal.reversed') }}</v-chip>
            <v-chip v-if="item.kind === 'automatic'" size="x-small" variant="flat" color="lightinfo" class="ml-2">{{ $t('accounting.journal.automatic') }}</v-chip>
          </template>
          <template #item.totalDebitCents="{ item }">{{ formatMoney(item.totalDebitCents, locale, store.currency) }}</template>
          <template #item.status="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.status === 'posted' ? 'lightsuccess' : 'lightwarning'">
              {{ $t(`accounting.journal.status.${item.status}`) }}
            </v-chip>
          </template>
          <template #no-data>{{ $t('accounting.journal.empty') }}</template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-container>
</template>

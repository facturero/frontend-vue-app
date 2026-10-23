<script setup lang="ts">
/**
 * Los comprobantes que alimentan los anexos (ventas, compras y retenciones emitidas) tal como los conoce este módulo. Sirve para
 * encontrar el comprobante al que apunta un hallazgo: llegar con `?id=` filtra por ese comprobante.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useReportingStore } from '@/stores/reporting';
import { formatMoney } from '@/utils/accounting';
import type { DocumentFilters, ReportDocumentRow } from '@/types/reporting';
import PageHeader from '@/components/ui/PageHeader.vue';
import ReportingTabs from '@/components/reporting/ReportingTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useReportingStore();

const search = ref('');
const direction = ref<ReportDocumentRow['direction'] | null>(null);
const status = ref<ReportDocumentRow['status'] | null>(null);
const page = ref(1);
const pageSize = ref(25);
const documentId = computed(() => (typeof route.query.id === 'string' ? route.query.id : undefined));

const directions = computed(() => (['sale', 'purchase', 'withholding_issued'] as const).map((value) => ({ value, title: t(`reporting.documents.directions.${value}`) })));
const statuses = computed(() => (['active', 'voided'] as const).map((value) => ({ value, title: t(`reporting.documents.statuses.${value}`) })));
const money = (cents: number) => formatMoney(cents, locale.value);

function filters(): DocumentFilters {
  return {
    id: documentId.value,
    q: search.value.trim() || undefined,
    direction: direction.value ?? undefined,
    status: status.value ?? undefined,
    page: page.value,
    pageSize: pageSize.value,
  };
}
const load = (): Promise<void> => store.fetchDocuments(filters());
onMounted(load);

// Un filtro nuevo vuelve a la primera página; cambiar de página solo recarga.
watch([search, direction, status, documentId], () => {
  page.value = 1;
  void load();
});
watch([page, pageSize], load);

const clearDocument = () => router.replace({ name: 'reporting-documents' });

const headers = computed(() => [
  { title: t('reporting.documents.number'), key: 'number', sortable: false },
  { title: t('reporting.documents.direction'), key: 'direction', sortable: false },
  { title: t('reporting.documents.type'), key: 'documentTypeCode', sortable: false },
  { title: t('reporting.documents.date'), key: 'issueDate', sortable: false },
  { title: t('reporting.documents.party'), key: 'partyName', sortable: false },
  { title: t('reporting.documents.total'), key: 'totalCents', sortable: false, align: 'end' as const },
  { title: t('reporting.documents.status'), key: 'status', sortable: false },
]);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('reporting.documents.title')" :subtitle="$t('reporting.documents.intro')" />
    <ReportingTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-row class="mb-2">
      <v-col cols="12" md="5">
        <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" :label="$t('reporting.documents.search')" clearable hide-details data-testid="documents-search" />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select v-model="direction" :items="directions" item-title="title" item-value="value" :label="$t('reporting.documents.direction')" clearable hide-details />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select v-model="status" :items="statuses" item-title="title" item-value="value" :label="$t('reporting.documents.status')" clearable hide-details />
      </v-col>
    </v-row>
    <v-chip v-if="documentId" closable class="mb-4" @click:close="clearDocument">{{ documentId.slice(0, 8) }}…</v-chip>

    <v-card>
      <v-card-text>
        <v-data-table-server
          v-model:page="page"
          v-model:items-per-page="pageSize"
          :headers="headers"
          :items="store.documents"
          :items-length="store.documentsTotal"
          :loading="store.loading"
        >
          <template #item.direction="{ item }">{{ $t(`reporting.documents.directions.${item.direction}`) }}</template>
          <template #item.partyName="{ item }">
            {{ item.partyName ?? '—' }}<div v-if="item.partyIdentification" class="text-body-2 text-medium-emphasis">{{ item.partyIdentification }}</div>
          </template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents) }}</template>
          <template #item.status="{ item }">
            <v-chip :color="item.status === 'voided' ? 'warning' : 'success'" size="small">{{ $t(`reporting.documents.statuses.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('reporting.documents.empty') }}</template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-container>
</template>

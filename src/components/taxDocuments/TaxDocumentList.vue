<script setup lang="ts">
/**
 * Listado de retenciones o guías de remisión emitidas desde fiscal, con el estado de cada una ante el SRI. Al abrir una fila se ve
 * el mismo cuadro de estado de las facturas (reintento, XML, RIDE), porque el comprobante sigue el mismo camino hacia el SRI.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTaxDocumentsStore } from '@/stores/taxDocuments';
import { fromCents } from '@/utils/taxDocuments';
import type { FiscalDocumentType, FiscalInvoiceDTO, FiscalInvoiceStatus } from '@/types/fiscal';
import FiscalStatusCard from '@/components/invoices/FiscalStatusCard.vue';

const props = defineProps<{ documentType: Extract<FiscalDocumentType, '06' | '07'> }>();

const { t, locale } = useI18n();
const store = useTaxDocumentsStore();

const status = ref<FiscalInvoiceStatus | null>(null);
const selected = ref<FiscalInvoiceDTO | null>(null);
const dialog = computed({ get: () => selected.value !== null, set: (open) => { if (!open) selected.value = null; } });

const isWithholding = computed(() => props.documentType === '07');
const pages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)));

const headers = computed(() => [
  { title: t('taxDocuments.number'), key: 'number', sortable: false, align: 'start' as const },
  { title: t('common.date'), key: 'created_at', sortable: false, align: 'start' as const },
  ...(isWithholding.value
    ? [
      { title: t('taxDocuments.withholdings.supplier'), key: 'party', sortable: false, align: 'start' as const },
      { title: t('taxDocuments.withholdings.support'), key: 'support', sortable: false, align: 'start' as const },
      { title: t('taxDocuments.withholdings.totalWithheld'), key: 'total', sortable: false, align: 'end' as const },
    ]
    : [
      { title: t('taxDocuments.guides.carrier'), key: 'party', sortable: false, align: 'start' as const },
      { title: t('taxDocuments.guides.transport'), key: 'support', sortable: false, align: 'start' as const },
      { title: t('taxDocuments.guides.recipients'), key: 'total', sortable: false, align: 'end' as const },
    ]),
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);

const statusItems = computed(() =>
  (['pending', 'sent', 'authorized', 'rejected', 'error'] as const).map((value) => ({ value, title: t(`fiscal.status.${value}`) })),
);

const STATUS_COLOR: Record<FiscalInvoiceStatus, string> = {
  pending: 'lightinfo',
  sent: 'lightinfo',
  authorized: 'lightsuccess',
  rejected: 'lighterror',
  error: 'lightwarning',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

/** `AAAA-MM-DD` → fecha legible, sin pasar por la zona horaria (es una fecha de calendario). */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

function load(page = 1): Promise<void> {
  return store.fetchList(props.documentType, page, status.value ?? undefined);
}

watch(status, () => void load(1));
watch(() => props.documentType, () => void load(1));
onMounted(() => void load(1));

defineExpose({ reload: () => load(store.page) });
</script>

<template>
  <v-alert v-if="store.error" type="error" closable class="mb-4">
    {{ store.error }}
  </v-alert>

  <v-card>
    <v-card-text>
      <div class="d-flex flex-wrap ga-4 mb-4">
        <v-select
          v-model="status"
          :items="statusItems"
          :label="$t('common.status')"
          clearable
          min-width="220"
          max-width="320"
        />
      </div>

      <v-data-table
        :headers="headers"
        :items="store.items"
        :loading="store.loading"
        :items-per-page="-1"
        hide-default-footer
        item-value="id"
        @click:row="(_: Event, { item }: { item: FiscalInvoiceDTO }) => (selected = item)"
      >
        <template #item.created_at="{ item }">
          {{ formatDate(item.created_at) }}
        </template>
        <template #item.party="{ item }">
          <template v-if="item.summary?.kind === 'withholding'">
            {{ item.summary.subject_name }}
            <div class="text-body-2 text-medium-emphasis">{{ item.summary.subject_identification }}</div>
          </template>
          <template v-else-if="item.summary?.kind === 'delivery_guide'">
            {{ item.summary.carrier_name }}
            <div class="text-body-2 text-medium-emphasis">{{ item.summary.plate }}</div>
          </template>
        </template>
        <template #item.support="{ item }">
          <template v-if="item.summary?.kind === 'withholding'">
            {{ item.summary.support_number }}
            <div class="text-body-2 text-medium-emphasis">{{ $t('taxDocuments.withholdings.period') }} {{ item.summary.fiscal_period }}</div>
          </template>
          <template v-else-if="item.summary?.kind === 'delivery_guide'">
            {{ formatDay(item.summary.transport_start) }} – {{ formatDay(item.summary.transport_end) }}
          </template>
        </template>
        <template #item.total="{ item }">
          <template v-if="item.summary?.kind === 'withholding'">
            {{ fromCents(item.summary.total_withheld_cents) }}
          </template>
          <template v-else-if="item.summary?.kind === 'delivery_guide'">
            {{ item.summary.recipients_count }}
          </template>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="STATUS_COLOR[item.status]" variant="flat" size="small">
            {{ $t(`fiscal.status.${item.status}`) }}
          </v-chip>
        </template>
        <template #no-data>
          {{ $t(isWithholding ? 'taxDocuments.withholdings.empty' : 'taxDocuments.guides.empty') }}
        </template>
      </v-data-table>

      <div v-if="pages > 1" class="d-flex justify-center mt-4">
        <v-pagination :model-value="store.page" :length="pages" density="comfortable" @update:model-value="load" />
      </div>
    </v-card-text>
  </v-card>

  <v-dialog v-model="dialog" max-width="720">
    <v-card v-if="selected">
      <v-card-title>
        {{ $t(isWithholding ? 'taxDocuments.withholdings.singular' : 'taxDocuments.guides.singular') }} {{ selected.number }}
      </v-card-title>
      <v-card-text>
        <FiscalStatusCard :billing-invoice-id="selected.billing_invoice_id" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="selected = null">{{ $t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

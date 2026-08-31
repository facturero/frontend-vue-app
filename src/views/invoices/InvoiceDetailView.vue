<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useInvoiceStore } from '@/stores/invoices';
import { useAuthStore } from '@/stores/auth';
import { fileApi } from '@/api/files';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useInvoiceStore();
const auth = useAuthStore();

const voidDialog = ref(false);
const voidReason = ref('');

const invoiceId = computed(() => props.id || (route.params.id as string));

const canVoid = computed(() => auth.can('invoice:void'));
const canIssue = computed(() => auth.can('invoice:issue'));
const canUpdate = computed(() => auth.can('invoice:update'));

// Documents
const documents = ref<Array<{ id: string; originalName: string; mimeType: string; createdAt: string }>>([]);
const docsLoading = ref(false);
const docsPolling = ref(0);
const docsMaxPolls = 5;
const docsPollInterval = ref<ReturnType<typeof setInterval> | null>(null);

const statusLabel = (status: string) => {
  const key = `invoices.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
};

const statusColor = (status: string) => {
  const map: Record<string, string> = { draft: 'warning', issued: 'success', voided: 'error' };
  return map[status] || 'grey';
};

const formatMoney = (cents: number) => (cents / 100).toFixed(2);
const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' });
};

function downloadFile(fileId: string) {
  const baseURL = import.meta.env.VITE_API_URL;
  window.open(`${baseURL}/files/${fileId}/download`, '_blank');
}

async function fetchDocuments() {
  if (!invoiceId.value) return;
  docsLoading.value = true;
  try {
    const result = await fileApi.listByResource('invoice', invoiceId.value, 'comprobante');
    documents.value = result.files;
  } catch {
    documents.value = [];
  } finally {
    docsLoading.value = false;
  }
}

function startDocsPolling() {
  docsPolling.value = 0;
  fetchDocuments();
  docsPollInterval.value = setInterval(() => {
    docsPolling.value++;
    fetchDocuments();
    if (documents.value.length > 0 || docsPolling.value >= docsMaxPolls) {
      if (docsPollInterval.value) clearInterval(docsPollInterval.value);
      docsPollInterval.value = null;
    }
  }, 3000);
}

async function handleVoid() {
  if (!voidReason.value) return;
  await store.voidInvoice(invoiceId.value, { reason: voidReason.value });
  voidDialog.value = false;
  voidReason.value = '';
}

onMounted(async () => {
  if (invoiceId.value) {
    await store.fetchById(invoiceId.value);
    if (store.current?.status !== 'draft') {
      startDocsPolling();
    }
  }
});
</script>

<template>
  <v-container fluid>
    <v-row align="center" class="mb-4">
      <v-col>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push('/invoices')">
          {{ $t('common.back') }}
        </v-btn>
      </v-col>
      <v-col class="text-right">
        <v-btn
          v-if="store.current?.status === 'draft' && canUpdate"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-pencil"
          class="mr-2"
          @click="router.push(`/invoices/${invoiceId}/edit`)"
        >
          {{ $t('common.edit') }}
        </v-btn>
        <v-btn
          v-if="store.current?.status === 'issued' && canVoid"
          color="error"
          prepend-icon="mdi-cancel"
          @click="voidDialog = true"
        >
          {{ $t('invoices.void') }}
        </v-btn>
      </v-col>
    </v-row>

    <v-progress-linear v-if="store.loading" indeterminate />

    <template v-if="store.current">
      <v-card class="mb-4">
        <v-card-title class="d-flex align-center">
          {{ $t('invoices.singular') }} {{ store.current.number || $t('invoices.draftSuffix') }}
          <v-chip :color="statusColor(store.current.status)" class="ml-3" size="small">
            {{ statusLabel(store.current.status) }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="6">
              <strong>{{ $t('invoices.issuer') }}:</strong><br>
              <template v-if="store.current.issuerSnapshot">
                {{ store.current.issuerSnapshot.legalName }}<br>
                {{ store.current.issuerSnapshot.taxId }}<br>
                {{ store.current.issuerSnapshot.address }}
              </template>
              <span v-else class="text-grey">{{ $t('invoices.noIssuerData') }}</span>
            </v-col>
            <v-col cols="6">
              <strong>{{ $t('invoices.customer') }}:</strong><br>
              <template v-if="store.current.customerSnapshot">
                {{ store.current.customerSnapshot.businessName }}<br>
                {{ store.current.customerSnapshot.identification }}<br>
                {{ store.current.customerSnapshot.email }}
              </template>
              <span v-else class="text-grey">{{ $t('invoices.noCustomerData') }}</span>
            </v-col>
          </v-row>
          <v-row class="mt-2">
            <v-col cols="4">
              <strong>{{ $t('invoices.issueDate') }}:</strong> {{ formatDate(store.current.issueDate) }}
            </v-col>
            <v-col cols="4">
              <strong>{{ $t('products.currency') }}:</strong> {{ store.current.currencyCode }}
            </v-col>
            <v-col cols="4">
              <strong>{{ $t('common.status') }}:</strong> {{ statusLabel(store.current.status) }}
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ $t('invoices.lines') }}</v-card-title>
        <v-table>
          <thead>
            <tr>
              <th>{{ $t('products.singular') }}</th>
              <th>{{ $t('common.description') }}</th>
              <th class="text-right">{{ $t('invoices.quantity') }}</th>
              <th class="text-right">{{ $t('invoices.unitPrice') }}</th>
              <th class="text-right">{{ $t('invoices.discount') }}</th>
              <th class="text-right">{{ $t('invoices.subtotal') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in store.current.lines" :key="line.id">
              <td>{{ line.productSnapshot?.name || line.productId }}</td>
              <td>{{ line.description }}</td>
              <td class="text-right">{{ line.quantity }}</td>
              <td class="text-right">{{ formatMoney(line.unitPriceCents) }}</td>
              <td class="text-right">{{ formatMoney(line.discountCents) }}</td>
              <td class="text-right">{{ formatMoney(line.subtotalCents) }}</td>
            </tr>
          </tbody>
        </v-table>
        <v-card-text class="text-right">
          <div><strong>{{ $t('invoices.subtotal') }}:</strong> {{ store.current.subtotal }}</div>
          <div><strong>{{ $t('invoices.taxTotal') }}:</strong> {{ store.current.taxTotal }}</div>
          <div class="text-h6"><strong>{{ $t('invoices.total') }}:</strong> {{ store.current.total }}</div>
        </v-card-text>
      </v-card>

      <v-card v-if="store.current.status === 'voided'">
        <v-card-title>{{ $t('invoices.voidTitle') }}</v-card-title>
        <v-card-text>
          <p><strong>{{ $t('invoices.voidReason') }}:</strong> {{ store.current.voidedReason }}</p>
          <p><strong>{{ $t('common.date') }}:</strong> {{ formatDate(store.current.voidedAt) }}</p>
        </v-card-text>
      </v-card>

      <v-card v-if="store.current.status !== 'draft'" class="mb-4">
        <v-card-title>{{ $t('common.documents') }}</v-card-title>
        <v-card-text>
          <v-progress-linear v-if="docsLoading" indeterminate class="mb-2" />
          <template v-if="documents.length > 0">
            <v-list density="compact">
              <v-list-item
                v-for="doc in documents"
                :key="doc.id"
                :title="doc.originalName"
                :subtitle="`${doc.mimeType} - ${new Date(doc.createdAt).toLocaleDateString(locale)}`"
              >
                <template #append>
                  <v-btn
                    size="small"
                    variant="text"
                    color="primary"
                    prepend-icon="mdi-download"
                    @click="downloadFile(doc.id)"
                  >
                    {{ $t('common.download') }}
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </template>
          <p v-else-if="!docsLoading" class="text-grey">
            <v-progress-circular v-if="docsPolling < docsMaxPolls" indeterminate size="14" width="2" class="mr-2" />
            {{ docsPolling < docsMaxPolls ? $t('invoices.generatingDocs') : $t('invoices.noDocs') }}
          </p>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="voidDialog" max-width="500">
      <v-card>
        <v-card-title>{{ $t('invoices.voidInvoice') }}</v-card-title>
        <v-card-text>
          <v-textarea v-model="voidReason" :label="$t('invoices.voidReasonLabel')" required />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="voidDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :disabled="!voidReason" :loading="store.saving" @click="handleVoid">
            {{ $t('invoices.voidInvoice') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

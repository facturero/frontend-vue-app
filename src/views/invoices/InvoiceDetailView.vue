<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useInvoiceStore } from '@/stores/invoices';
import { useAuthStore } from '@/stores/auth';
import { fileApi } from '@/api/files';

const props = defineProps<{ id: string }>();
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
  const map: Record<string, string> = { draft: 'Borrador', issued: 'Emitida', voided: 'Anulada' };
  return map[status] || status;
};

const statusColor = (status: string) => {
  const map: Record<string, string> = { draft: 'warning', issued: 'success', voided: 'error' };
  return map[status] || 'grey';
};

const formatMoney = (cents: number) => (cents / 100).toFixed(2);
const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
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
          Volver
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
          Editar
        </v-btn>
        <v-btn
          v-if="store.current?.status === 'issued' && canVoid"
          color="error"
          prepend-icon="mdi-cancel"
          @click="voidDialog = true"
        >
          Anular
        </v-btn>
      </v-col>
    </v-row>

    <v-progress-linear v-if="store.loading" indeterminate />

    <template v-if="store.current">
      <v-card class="mb-4">
        <v-card-title class="d-flex align-center">
          Factura {{ store.current.number || '— (borrador)' }}
          <v-chip :color="statusColor(store.current.status)" class="ml-3" size="small">
            {{ statusLabel(store.current.status) }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="6">
              <strong>Emisor:</strong><br>
              <template v-if="store.current.issuerSnapshot">
                {{ store.current.issuerSnapshot.legalName }}<br>
                {{ store.current.issuerSnapshot.taxId }}<br>
                {{ store.current.issuerSnapshot.address }}
              </template>
              <span v-else class="text-grey">Sin datos del emisor</span>
            </v-col>
            <v-col cols="6">
              <strong>Cliente:</strong><br>
              <template v-if="store.current.customerSnapshot">
                {{ store.current.customerSnapshot.businessName }}<br>
                {{ store.current.customerSnapshot.identification }}<br>
                {{ store.current.customerSnapshot.email }}
              </template>
              <span v-else class="text-grey">Sin datos del cliente</span>
            </v-col>
          </v-row>
          <v-row class="mt-2">
            <v-col cols="4">
              <strong>Fecha emisión:</strong> {{ formatDate(store.current.issueDate) }}
            </v-col>
            <v-col cols="4">
              <strong>Moneda:</strong> {{ store.current.currencyCode }}
            </v-col>
            <v-col cols="4">
              <strong>Estado:</strong> {{ statusLabel(store.current.status) }}
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>Líneas</v-card-title>
        <v-table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Descripción</th>
              <th class="text-right">Cantidad</th>
              <th class="text-right">P. Unitario</th>
              <th class="text-right">Dto.</th>
              <th class="text-right">Subtotal</th>
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
          <div><strong>Subtotal:</strong> {{ store.current.subtotal }}</div>
          <div><strong>IVA:</strong> {{ store.current.taxTotal }}</div>
          <div class="text-h6"><strong>Total:</strong> {{ store.current.total }}</div>
        </v-card-text>
      </v-card>

      <v-card v-if="store.current.status === 'voided'">
        <v-card-title>Anulacion</v-card-title>
        <v-card-text>
          <p><strong>Motivo:</strong> {{ store.current.voidedReason }}</p>
          <p><strong>Fecha:</strong> {{ formatDate(store.current.voidedAt) }}</p>
        </v-card-text>
      </v-card>

      <v-card v-if="store.current.status !== 'draft'" class="mb-4">
        <v-card-title>Documentos</v-card-title>
        <v-card-text>
          <v-progress-linear v-if="docsLoading" indeterminate class="mb-2" />
          <template v-if="documents.length > 0">
            <v-list density="compact">
              <v-list-item
                v-for="doc in documents"
                :key="doc.id"
                :title="doc.originalName"
                :subtitle="`${doc.mimeType} - ${new Date(doc.createdAt).toLocaleDateString('es-EC')}`"
              >
                <template #append>
                  <v-btn
                    size="small"
                    variant="text"
                    color="primary"
                    prepend-icon="mdi-download"
                    @click="downloadFile(doc.id)"
                  >
                    Descargar
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </template>
          <p v-else-if="!docsLoading" class="text-grey">
            <v-progress-circular v-if="docsPolling < docsMaxPolls" indeterminate size="14" width="2" class="mr-2" />
            {{ docsPolling < docsMaxPolls ? 'Generando documentos...' : 'No se encontraron documentos.' }}
          </p>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="voidDialog" max-width="500">
      <v-card>
        <v-card-title>Anular factura</v-card-title>
        <v-card-text>
          <v-textarea v-model="voidReason" label="Motivo de anulación" required />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="voidDialog = false">Cancelar</v-btn>
          <v-btn color="error" :disabled="!voidReason" :loading="store.saving" @click="handleVoid">
            Anular factura
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useInvoiceStore } from '@/stores/invoices';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import { fileApi } from '@/api/files';
import { openFile } from '@/composable/useFileUrl';
import { productApi } from '@/api/products';
import type { TaxRate } from '@/types/products';
import FiscalStatusCard from '@/components/invoices/FiscalStatusCard.vue';

const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useInvoiceStore();
const auth = useAuthStore();
const orgStore = useOrganizationStore();

const voidDialog = ref(false);
const voidReason = ref('');

const creditNoteDialog = ref(false);
const creditNoteReason = ref('');
const creditNoteEstablishmentId = ref('');
const creditNoteEmissionPointId = ref('');
const creditNoteError = ref('');
const creditNoteSaving = ref(false);

const debitNoteDialog = ref(false);
const debitNoteEstablishmentId = ref('');
const debitNoteEmissionPointId = ref('');
const debitNoteError = ref('');
const debitNoteSaving = ref(false);
const vatRates = ref<TaxRate[]>([]);
type DebitMotive = { reason: string; amount: string; taxRateId: string };
const debitNoteMotives = ref<DebitMotive[]>([]);

const invoiceId = computed(() => props.id || (route.params.id as string));

const canVoid = computed(() => auth.can('invoice:void'));
const canIssue = computed(() => auth.can('invoice:issue'));
const canUpdate = computed(() => auth.can('invoice:update'));
// La nota de crédito revierte el importe de una factura emitida (o de una ya
// anulada que el SRI pudo autorizar): el backend la acepta para ambos estados.
const canCreditNote = computed(
  () => canIssue
    && store.current?.countryCode === 'EC'
    && (store.current?.status === 'issued' || store.current?.status === 'voided'),
);
// La nota de débito AMPLÍA el cobro de una factura vigente; sobre una anulada no tiene sentido.
const canDebitNote = computed(
  () => canIssue.value
    && store.current?.countryCode === 'EC'
    && store.current?.status === 'issued',
);
const moneyPattern = /^\d+(\.\d{1,2})?$/;
const debitMotivesValid = computed(
  () => debitNoteMotives.value.length > 0
    && debitNoteMotives.value.every(m => m.reason.trim() !== '' && moneyPattern.test(m.amount) && Number(m.amount) > 0 && m.taxRateId !== ''),
);
// Vista previa del total, en centavos para no arrastrar errores de coma flotante.
const debitNoteTotal = computed(() => {
  let cents = 0;
  for (const m of debitNoteMotives.value) {
    if (!moneyPattern.test(m.amount)) continue;
    const base = Math.round(Number(m.amount) * 100);
    const pct = Number(vatRates.value.find(r => r.id === m.taxRateId)?.percentage ?? 0);
    cents += base + Math.round((base * pct) / 100);
  }
  return (cents / 100).toFixed(2);
});
// El estado ante el SRI solo existe para facturas emitidas de Ecuador.
const showFiscal = computed(
  () => auth.can('fiscal:read') && store.current?.status !== 'draft' && store.current?.countryCode === 'EC',
);

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
  // La descarga exige sesión: se pide el enlace firmado con el token (ver useFileUrl).
  void openFile(fileId);
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

async function openCreditNoteDialog() {
  creditNoteError.value = '';
  creditNoteReason.value = '';
  creditNoteEstablishmentId.value = '';
  creditNoteEmissionPointId.value = '';
  orgStore.emissionPoints.splice(0);
  creditNoteDialog.value = true;
  await orgStore.fetchEstablishments();
  // El establecimiento y el punto de la factura son la opción más probable:
  // se preseleccionan si siguen activos.
  const est = store.current?.establishmentId;
  if (est) {
    creditNoteEstablishmentId.value = est;
    await orgStore.fetchEmissionPoints(est);
    const point = store.current?.emissionPointId;
    if (point && orgStore.emissionPoints.some(ep => ep.id === point)) {
      creditNoteEmissionPointId.value = point;
    }
  }
}

async function handleCreditNote() {
  if (!invoiceId.value || !creditNoteReason.value || !creditNoteEstablishmentId.value || !creditNoteEmissionPointId.value) return;
  creditNoteError.value = '';
  creditNoteSaving.value = true;
  try {
    const creditNote = await store.creditNote(invoiceId.value, {
      reason: creditNoteReason.value,
      establishmentId: creditNoteEstablishmentId.value,
      emissionPointId: creditNoteEmissionPointId.value,
    });
    creditNoteDialog.value = false;
    router.push(`/invoices/${creditNote.id}`);
  } catch (e: any) {
    creditNoteError.value = e.message || t('invoices.creditNoteError');
  } finally {
    creditNoteSaving.value = false;
  }
}

function newDebitMotive(): DebitMotive {
  const def = vatRates.value.find(r => r.isDefault) ?? vatRates.value[0];
  return { reason: '', amount: '', taxRateId: def?.id ?? '' };
}

async function openDebitNoteDialog() {
  debitNoteError.value = '';
  debitNoteEstablishmentId.value = '';
  debitNoteEmissionPointId.value = '';
  orgStore.emissionPoints.splice(0);
  debitNoteDialog.value = true;
  try {
    const rates = await productApi.listTaxRates();
    vatRates.value = rates.filter(r => r.kind === 'vat' && r.countryCode === (store.current?.countryCode ?? 'EC'));
  } catch {
    vatRates.value = [];
  }
  debitNoteMotives.value = [newDebitMotive()];
  await orgStore.fetchEstablishments();
  const est = store.current?.establishmentId;
  if (est) {
    debitNoteEstablishmentId.value = est;
    await orgStore.fetchEmissionPoints(est);
    const point = store.current?.emissionPointId;
    if (point && orgStore.emissionPoints.some(ep => ep.id === point)) {
      debitNoteEmissionPointId.value = point;
    }
  }
}

async function handleDebitNote() {
  if (!invoiceId.value || !debitMotivesValid.value || !debitNoteEstablishmentId.value || !debitNoteEmissionPointId.value) return;
  debitNoteError.value = '';
  debitNoteSaving.value = true;
  try {
    const note = await store.debitNote(invoiceId.value, {
      establishmentId: debitNoteEstablishmentId.value,
      emissionPointId: debitNoteEmissionPointId.value,
      motives: debitNoteMotives.value.map(m => ({ reason: m.reason.trim(), amount: m.amount, taxRateId: m.taxRateId })),
    });
    debitNoteDialog.value = false;
    router.push(`/invoices/${note.id}`);
  } catch (e: any) {
    debitNoteError.value = e.message || t('invoices.debitNoteError');
  } finally {
    debitNoteSaving.value = false;
  }
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
      <v-col class="d-flex flex-wrap justify-end ga-2">
        <v-btn
          v-if="store.current?.status === 'draft' && canUpdate"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-pencil"
          @click="router.push(`/invoices/${invoiceId}/edit`)"
        >
          {{ $t('common.edit') }}
        </v-btn>
        <v-btn
          v-if="canCreditNote"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-credit-card-refund"
          @click="openCreditNoteDialog"
        >
          {{ $t('invoices.creditNote') }}
        </v-btn>
        <v-btn
          v-if="canDebitNote"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-cash-plus"
          @click="openDebitNoteDialog"
        >
          {{ $t('invoices.debitNote') }}
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
        <v-card-title class="d-flex align-center flex-wrap ga-2">
          {{ $t('invoices.singular') }} {{ store.current.number || $t('invoices.draftSuffix') }}
          <v-chip :color="statusColor(store.current.status)" size="small">
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

      <FiscalStatusCard v-if="showFiscal" :billing-invoice-id="invoiceId" />

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

    <v-dialog v-model="creditNoteDialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('invoices.creditNote') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="creditNoteError" type="error" class="mb-4">
            {{ creditNoteError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-4">
            {{ $t('invoices.creditNoteHint') }}
          </p>
          <v-textarea
            v-model="creditNoteReason"
            :label="$t('invoices.creditNoteReason')"
            counter="300"
            class="mb-4"
          />
          <v-sheet color="grey100" rounded="lg" class="d-flex ga-3 pa-4">
            <v-select
              v-model="creditNoteEstablishmentId"
              :items="orgStore.establishments.filter(e => e.status === 'active').map(e => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
              :label="$t('organization.establishment')"
            />
            <v-select
              v-model="creditNoteEmissionPointId"
              :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || $t('invoices.emissionPoint')}`, value: ep.id }))"
              :label="$t('invoices.emissionPoint')"
              :disabled="!creditNoteEstablishmentId"
            />
          </v-sheet>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="creditNoteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="creditNoteSaving"
            :disabled="!creditNoteReason || !creditNoteEstablishmentId || !creditNoteEmissionPointId"
            @click="handleCreditNote"
          >
            {{ $t('invoices.creditNoteSubmit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="debitNoteDialog" max-width="720">
      <v-card>
        <v-card-title>{{ $t('invoices.debitNote') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="debitNoteError" type="error" class="mb-4">
            {{ debitNoteError }}
          </v-alert>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ $t('invoices.debitNoteHint') }}
          </p>
          <v-row v-for="(motive, i) in debitNoteMotives" :key="i" dense>
            <v-col cols="12" sm="5">
              <v-text-field v-model="motive.reason" :label="$t('invoices.debitNoteMotive')" maxlength="300" />
            </v-col>
            <v-col cols="6" sm="3">
              <v-text-field
                v-model="motive.amount"
                :label="$t('invoices.debitNoteAmount')"
                inputmode="decimal"
                :error="motive.amount !== '' && !/^\d+(\.\d{1,2})?$/.test(motive.amount)"
              />
            </v-col>
            <v-col cols="4" sm="3">
              <v-select
                v-model="motive.taxRateId"
                :items="vatRates.map(r => ({ title: `${Number(r.percentage)}%`, value: r.id }))"
                :label="$t('invoices.debitNoteTax')"
              />
            </v-col>
            <v-col cols="2" sm="1" class="d-flex align-center">
              <v-btn
                icon="mdi-close"
                variant="text"
                :aria-label="$t('invoices.debitNoteRemoveMotive')"
                :disabled="debitNoteMotives.length === 1"
                @click="debitNoteMotives.splice(i, 1)"
              />
            </v-col>
          </v-row>
          <v-btn
            variant="text"
            color="primary"
            prepend-icon="mdi-plus"
            :disabled="debitNoteMotives.length >= 20"
            class="mb-4"
            @click="debitNoteMotives.push(newDebitMotive())"
          >
            {{ $t('invoices.debitNoteAddMotive') }}
          </v-btn>
          <v-sheet color="grey100" rounded="lg" class="d-flex ga-4 pa-4 mb-4">
            <v-select
              v-model="debitNoteEstablishmentId"
              :items="orgStore.establishments.filter(e => e.status === 'active').map(e => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
              :label="$t('organization.establishment')"
              disabled
            />
            <v-select
              v-model="debitNoteEmissionPointId"
              :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || $t('invoices.emissionPoint')}`, value: ep.id }))"
              :label="$t('invoices.emissionPoint')"
              :disabled="!debitNoteEstablishmentId"
            />
          </v-sheet>
          <div class="text-h6 text-right">
            {{ $t('invoices.debitNoteTotal') }}: {{ debitNoteTotal }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="debitNoteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="debitNoteSaving"
            :disabled="!debitMotivesValid || !debitNoteEstablishmentId || !debitNoteEmissionPointId"
            @click="handleDebitNote"
          >
            {{ $t('invoices.debitNoteSubmit') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

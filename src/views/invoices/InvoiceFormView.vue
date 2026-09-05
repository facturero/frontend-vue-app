<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useInvoiceStore } from '@/stores/invoices';
import { useCustomerStore } from '@/stores/customers';
import { useProductStore } from '@/stores/products';
import { useOrganizationStore } from '@/stores/organization';
import { useFiscalStore } from '@/stores/fiscal';
import PageHeader from '@/components/ui/PageHeader.vue';
import { getFiscalRegime, supportedCountries } from '@/config/fiscalRegimes';

const props = defineProps<{ id?: string }>();
const { t, locale } = useI18n();
const router = useRouter();
const store = useInvoiceStore();
const customerStore = useCustomerStore();
const productStore = useProductStore();
const orgStore = useOrganizationStore();
const fiscalStore = useFiscalStore();

/**
 * Todo lo específico del país sale de aquí, no de constantes en la vista: qué
 * organismo autoriza, si hay establecimientos, qué tipo de documento se crea.
 * Ver src/config/fiscalRegimes.ts.
 */
const regime = computed(() => getFiscalRegime(orgStore.org?.countryCode));

const isEditMode = computed(() => !!props.id);
const loadingExisting = ref(false);
const loadError = ref('');

const selectedCustomerId = ref('');
const customerSearch = ref('');
const errorMessage = ref('');
const newLine = ref({ productId: '', description: '', quantity: 1, unitPrice: '0.00' });
const invoiceId = ref<string | null>(null);
const saving = ref(false);

const selectedEstablishmentId = ref('');
const selectedEmissionPointId = ref('');

const orgProfileComplete = computed(() => orgStore.org?.completed ?? false);
const hasEstablishments = computed(() => orgStore.establishments.length > 0);
const selectedEstablishmentHasEmissionPoints = computed(() =>
  !selectedEstablishmentId.value || orgStore.emissionPoints.some(ep => ep.status === 'active'),
);
const noCertificate = computed(() => !fiscalStore.hasActiveCertificate);

// --- Diálogos inline para resolver configuración faltante sin salir de la vista ---
const showOrgDialog = ref(false);
const quickTaxId = ref('');
const quickCountryCode = ref('EC');
const orgDialogError = ref('');
const orgDialogSaving = ref(false);

const showEstablishmentDialog = ref(false);
const quickEstablishmentName = ref('');
const establishmentDialogError = ref('');
const establishmentDialogSaving = ref(false);

const showCertificateDialog = ref(false);
const quickCertFile = ref<File | null>(null);
const quickCertPassword = ref('');
const quickCertAlias = ref('');
const certDialogError = ref('');

const hasCustomer = computed(() => !!invoiceId.value);
const hasLines = computed(() => (store.current?.lines?.length ?? 0) > 0);

const canAddLine = computed(() => {
  const price = parseFloat(newLine.value.unitPrice);
  return !!newLine.value.productId && newLine.value.quantity > 0 && !Number.isNaN(price) && price > 0;
});

function lineItemName(line: { productSnapshot: { name: string } | null; productId: string }): string {
  if (line.productSnapshot?.name) return line.productSnapshot.name;
  const product = productStore.list.find(p => p.id === line.productId);
  return product?.name || t('invoices.unnamedProduct');
}

// El total de IVA se calcula sumando line.taxes[].amountCents directo de las
// líneas, en vez de confiar ciegamente en el agregado taxTotalCents de la
// factura — así el desglose que ves siempre corresponde a lo que hay en las
// líneas mismas.
const taxTotalCentsComputed = computed(() => {
  const lines = store.current?.lines ?? [];
  return lines.reduce((sum, line) => {
    const lineTaxes = line.taxes ?? [];
    return sum + lineTaxes.reduce((s, t) => s + t.amountCents, 0);
  }, 0);
});

const taxTotalDisplay = computed(() => (taxTotalCentsComputed.value / 100).toFixed(2));

const totalDisplay = computed(() => {
  const subtotalCents = store.current?.subtotalCents ?? 0;
  return ((subtotalCents + taxTotalCentsComputed.value) / 100).toFixed(2);
});

const selectedCustomerObj = computed(() =>
  customerStore.list.find((c) => c.id === selectedCustomerId.value) || null,
);

const previewCustomer = computed(() => {
  if (store.current?.customerSnapshot) return store.current.customerSnapshot;
  if (selectedCustomerObj.value) {
    return {
      businessName: selectedCustomerObj.value.businessName,
      identification: selectedCustomerObj.value.identification || '—',
    };
  }
  return null;
});

const issuerName = computed(() => {
  const legalName = store.current?.issuerSnapshot?.legalName;
  if (legalName) return legalName;
  return orgStore.org?.legalName || 'Tu empresa';
});

const currencySymbol = computed(() => (store.current?.currencyCode === 'USD' ? '$' : (store.current?.currencyCode || '$')));

const folioLabel = computed(() => store.current?.number || 'BORRADOR');

const today = computed(() =>
  new Date().toLocaleDateString(regime.value.locale || locale.value, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }),
);

function customFilter(item: { title: string }, queryText: string): boolean {
  if (!queryText || queryText.length < 2) return false;
  return item.title.toLowerCase().includes(queryText.toLowerCase());
}

watch(customerSearch, async (val) => {
  if (val && val.length >= 2) {
    await customerStore.fetch({ search: val });
  } else if (!val || val.length === 0) {
    customerStore.list.splice(0);
  }
});

watch(selectedEstablishmentId, (estId) => {
  selectedEmissionPointId.value = '';
  if (estId) {
    orgStore.fetchEmissionPoints(estId);
  } else {
    orgStore.emissionPoints.splice(0);
  }
});

watch(() => newLine.value.productId, (productId) => {
  if (!productId) return;
  const product = productStore.list.find(p => p.id === productId);
  if (product) {
    newLine.value.unitPrice = product.price;
  }
});

async function selectCustomer() {
  errorMessage.value = '';
  if (!selectedCustomerId.value) return;

  try {
    const invoice = await store.create({
      customerId: selectedCustomerId.value,
      documentTypeId: regime.value.invoiceDocumentTypeId,
      currencyCode: regime.value.currencyCode,
    });
    invoiceId.value = invoice.id;
  } catch (e: any) {
    errorMessage.value = e.message || t('invoices.createError');
  }
}

async function addLine() {
  if (!invoiceId.value || !canAddLine.value) return;
  errorMessage.value = '';
  const product = productStore.list.find(p => p.id === newLine.value.productId);

  try {
    await store.addLine(invoiceId.value, {
      productId: newLine.value.productId,
      description: newLine.value.description || product?.name || '',
      quantity: newLine.value.quantity,
      unitPrice: newLine.value.unitPrice,
      discountCents: 0,
    });
    newLine.value = { productId: '', description: '', quantity: 1, unitPrice: '0.00' };
  } catch (e: any) {
    errorMessage.value = e.message || t('invoices.addLineError');
  }
}

async function removeLine(lineId: string) {
  if (!invoiceId.value) return;
  await store.removeLine(invoiceId.value, lineId);
}

async function handleIssue() {
  if (!invoiceId.value || !selectedEstablishmentId.value || !selectedEmissionPointId.value) return;
  errorMessage.value = '';
  saving.value = true;
  try {
    await store.issue(invoiceId.value, {
      establishmentId: selectedEstablishmentId.value,
      emissionPointId: selectedEmissionPointId.value,
    });
    router.push(`/invoices/${invoiceId.value}`);
  } catch (e: any) {
    errorMessage.value = e.message || t('invoices.issueError');
  } finally {
    saving.value = false;
  }
}

async function submitOrgProfile(): Promise<void> {
  if (!quickTaxId.value) return;
  orgDialogError.value = '';
  orgDialogSaving.value = true;
  try {
    await orgStore.upsert({
      legalName: orgStore.org?.legalName || 'Mi empresa',
      taxId: quickTaxId.value,
      countryCode: quickCountryCode.value,
    });
    showOrgDialog.value = false;
    quickTaxId.value = '';
  } catch (e: any) {
    orgDialogError.value = e?.response?.data?.message || e.message || t('common.saveError');
  } finally {
    orgDialogSaving.value = false;
  }
}

async function submitEstablishment(): Promise<void> {
  if (!quickEstablishmentName.value) return;
  establishmentDialogError.value = '';
  establishmentDialogSaving.value = true;
  try {
    const est = await orgStore.createEstablishment({ name: quickEstablishmentName.value });
    await orgStore.createEmissionPoint(est.id, { name: 'Principal' });
    showEstablishmentDialog.value = false;
    quickEstablishmentName.value = '';
    selectedEstablishmentId.value = est.id;
  } catch (e: any) {
    establishmentDialogError.value = e?.response?.data?.message || e.message || t('common.createError');
  } finally {
    establishmentDialogSaving.value = false;
  }
}

async function submitCertificate(): Promise<void> {
  if (!quickCertFile.value || !quickCertPassword.value) return;
  certDialogError.value = '';
  try {
    await fiscalStore.uploadCertificate(quickCertFile.value, quickCertPassword.value, quickCertAlias.value || undefined);
    showCertificateDialog.value = false;
    quickCertFile.value = null;
    quickCertPassword.value = '';
    quickCertAlias.value = '';
  } catch (e: any) {
    certDialogError.value = e?.response?.data?.message || e.message || t('invoices.certUploadError');
  }
}

function onQuickCertFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  quickCertFile.value = input.files?.[0] ?? null;
}

onMounted(async () => {
  await Promise.all([
    customerStore.fetch(),
    productStore.fetch(),
    orgStore.fetch(),
    orgStore.fetchEstablishments(),
    fiscalStore.fetchCertificates(),
  ]);

  if (props.id) {
    loadingExisting.value = true;
    try {
      await store.fetchById(props.id);
      const invoice = store.current;
      if (!invoice) {
        loadError.value = t('invoices.notFound');
        return;
      }
      if (invoice.status !== 'draft') {
        loadError.value = t('invoices.notDraftAnymore');
        return;
      }
      invoiceId.value = invoice.id;
      selectedCustomerId.value = invoice.customerId;
    } catch (e: any) {
      loadError.value = e.message || t('invoices.loadError');
    } finally {
      loadingExisting.value = false;
    }
  }
});
</script>

<template>
  <v-container class="invoice-workspace">
    <PageHeader
      :title="isEditMode ? $t('invoices.edit') : $t('invoices.new')"
      :subtitle="regime.authority ? $t('invoices.eyebrow', { authority: regime.authority }) : undefined"
      :back-to="{ name: 'invoices' }"
    />

    <v-progress-linear v-if="loadingExisting" indeterminate class="mb-4" />

    <v-alert v-if="loadError" type="warning" class="mb-6">
      {{ loadError }}
    </v-alert>

    <v-alert v-if="errorMessage" type="error" closable class="mb-6" @click:close="errorMessage = ''">
      {{ errorMessage }}
    </v-alert>

    <v-row v-if="!loadError">
      <!-- FORM COLUMN -->
      <v-col cols="12" lg="8">
       <v-card>
        <v-card-title class="text-h6 pa-6 pb-0">
          {{ $t('invoices.detailsTitle') }}
        </v-card-title>

        <v-card-text class="pa-6">
          <div class="text-body-2 text-medium-emphasis mb-6">
            {{ $t('common.date') }}: {{ today }}
          </div>

        <!-- STEP 1 -->
        <section class="inv-step">
          <div class="step-head">
            <span class="step-num">1</span>
            <div>
              <h2>{{ $t('invoices.customer') }}</h2>
              <p>{{ $t('invoices.step1Question') }}</p>
            </div>
          </div>

          <div class="step-body">
           <v-sheet color="grey100" rounded="lg" class="pa-4 mb-4">
            <v-autocomplete
              v-model="selectedCustomerId"
              :items="customerStore.list.map(c => ({ title: `${c.businessName} (${c.identification})`, value: c.id }))"
              :label="$t('invoices.searchCustomer')"
              variant="underlined"
              clearable
              :disabled="hasCustomer"
              :search-input.sync="customerSearch"
              :filter="customFilter"
            />
            <v-btn
              variant="outlined"
              rounded="pill"
              :append-icon="hasCustomer ? 'mdi-check' : 'mdi-arrow-right'"
              :disabled="!selectedCustomerId || hasCustomer"
              @click="selectCustomer"
            >
              {{ hasCustomer ? $t('invoices.customerConfirmed') : $t('invoices.confirmCustomer') }}
            </v-btn>
           </v-sheet>
          </div>
        </section>

        <!-- STEP 2 -->
        <section class="inv-step" :class="{ 'is-disabled': !hasCustomer }">
          <div class="step-head">
            <span class="step-num">2</span>
            <div>
              <h2>{{ $t('invoices.lines') }}</h2>
              <p>{{ $t('invoices.step2Subtitle') }}</p>
            </div>
          </div>

          <div class="step-body">
            <div v-if="!hasCustomer" class="empty-hint">
              {{ $t('invoices.confirmCustomerFirst') }}
            </div>

            <template v-else>
              <v-table v-if="hasLines" density="compact" class="mb-4 bg-transparent">
                <thead>
                  <tr>
                    <th>{{ $t('invoices.item') }}</th>
                    <th>{{ $t('common.description') }}</th>
                    <th class="text-right">{{ $t('invoices.qtyShort') }}</th>
                    <th class="text-right">{{ $t('products.price') }}</th>
                    <th class="text-right">{{ $t('invoices.subtotal') }}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in (store.current?.lines || [])" :key="line.id">
                    <td>{{ lineItemName(line) }}</td>
                    <td class="text-medium-emphasis">{{ line.description }}</td>
                    <td class="text-right mono">{{ line.quantity }}</td>
                    <td class="text-right mono">{{ (line.unitPriceCents / 100).toFixed(2) }}</td>
                    <td class="text-right mono">{{ (line.subtotalCents / 100).toFixed(2) }}</td>
                    <td class="text-right">
                      <v-btn
                        icon="mdi-close"
                        variant="text"
                        size="x-small"
                        :title="$t('invoices.removeLine')"
                        @click="removeLine(line.id)"
                      />
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <v-row align="end" dense>
                <v-col cols="12" sm="4">
                  <v-select
                    v-model="newLine.productId"
                    :items="productStore.list.filter(p => p.status === 'active').map(p => ({ title: `${p.name} · ${p.type === 'service' ? $t('products.service') : $t('products.good')}`, value: p.id }))"
                    :label="$t('invoices.productOrService')"
                    variant="underlined"
                  />
                </v-col>
                <v-col cols="12" sm="4">
                  <v-text-field
                    v-model="newLine.description"
                    :label="$t('invoices.descriptionOptional')"
                    variant="underlined"
                  />
                </v-col>
                <v-col cols="4" sm="1">
                  <v-text-field
                    v-model.number="newLine.quantity"
                    :label="$t('invoices.qtyShort')"
                    type="number"
                    min="1"
                    variant="underlined"
                    class="mono"
                  />
                </v-col>
                <v-col cols="6" sm="2">
                  <v-text-field
                    v-model="newLine.unitPrice"
                    :label="$t('products.price')"
                    variant="underlined"
                    class="mono"
                  />
                </v-col>
                <v-col cols="2" sm="1" class="text-right">
                  <v-btn
                    icon="mdi-plus"
                    variant="outlined"
                    size="small"
                    :title="$t('invoices.addLine')"
                    :disabled="!canAddLine"
                    @click="addLine"
                  />
                </v-col>
              </v-row>
            </template>
          </div>
        </section>

        <!-- STEP 3 -->
        <section class="inv-step" :class="{ 'is-disabled': !hasLines }">
          <div class="step-head">
            <span class="step-num">3</span>
            <div>
              <h2>{{ $t('invoices.step3') }}</h2>
              <!-- Sin país configurado no hay autoridad que nombrar: texto genérico. -->
              <p>
                {{ regime.authority
                  ? $t('invoices.step3Subtitle', { authority: regime.authority })
                  : $t('invoices.step3SubtitleGeneric') }}
              </p>
            </div>
          </div>

          <div class="step-body">
            <div v-if="!hasLines" class="empty-hint">
              {{ $t('invoices.addLineFirst') }}
            </div>
            <template v-else>
              <v-alert v-if="!orgProfileComplete" type="warning" class="mb-4">
                <div class="d-flex flex-wrap align-center ga-2">
                  <i18n-t keypath="invoices.completeProfileHint" tag="span">
                    <template #field><strong>{{ $t('invoices.taxIdAndCountry') }}</strong></template>
                  </i18n-t>
                  <v-btn variant="text" size="small" class="ml-auto" @click="showOrgDialog = true">
                    {{ $t('invoices.completeNow') }}
                  </v-btn>
                </div>
              </v-alert>

              <v-alert v-else-if="!hasEstablishments" type="warning" class="mb-4">
                <div class="d-flex flex-wrap align-center ga-2">
                  <i18n-t keypath="invoices.needEstablishmentHint" tag="span">
                    <template #field><strong>{{ $t('invoices.establishmentAndPoint') }}</strong></template>
                  </i18n-t>
                  <v-btn variant="text" size="small" class="ml-auto" @click="showEstablishmentDialog = true">
                    {{ $t('invoices.createNow') }}
                  </v-btn>
                </div>
              </v-alert>

              <template v-else>
                <v-sheet color="grey100" rounded="lg" class="d-flex ga-3 pa-4 mb-4">
                  <v-select
                    v-model="selectedEstablishmentId"
                    :items="orgStore.establishments.filter(e => e.status === 'active').map(e => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
                    :label="$t('organization.establishment')"
                    variant="underlined"
                  />
                  <v-select
                    v-model="selectedEmissionPointId"
                    :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || $t('invoices.emissionPoint')}`, value: ep.id }))"
                    :label="$t('invoices.emissionPoint')"
                    variant="underlined"
                    :disabled="!selectedEstablishmentId"
                  />
                </v-sheet>

                <v-alert
                  v-if="selectedEstablishmentId && !selectedEstablishmentHasEmissionPoints"
                  type="warning"
                  class="mb-4"
                >
                  <div class="d-flex flex-wrap align-center ga-2">
                    <span>{{ $t('invoices.noEmissionPoints') }}</span>
                    <v-btn variant="text" size="small" class="ml-auto" @click="showEstablishmentDialog = true">
                      {{ $t('invoices.createOne') }}
                    </v-btn>
                  </div>
                </v-alert>

                <v-alert
                  v-if="regime.requiresSigningCertificate && noCertificate"
                  type="info"
                  class="mb-4"
                >
                  <div class="d-flex flex-wrap align-center ga-2">
                    <span>{{ $t('invoices.noCertificateHint') }}</span>
                    <v-btn variant="text" size="small" class="ml-auto" @click="showCertificateDialog = true">
                      {{ $t('invoices.uploadCertificate') }}
                    </v-btn>
                  </div>
                </v-alert>

                <p class="text-body-2 text-medium-emphasis mb-4">
                  {{ $t('invoices.issueNote') }}
                </p>
                <v-btn
                  color="primary"
                  size="large"
                  :loading="saving"
                  :disabled="!selectedEstablishmentId || !selectedEmissionPointId"
                  @click="handleIssue"
                >
                  {{ saving ? $t('invoices.issuing') : $t('invoices.issueInvoice') }}
                </v-btn>
              </template>
            </template>
          </div>
        </section>
        </v-card-text>
       </v-card>
      </v-col>

      <!-- PREVIEW COLUMN -->
      <v-col cols="12" lg="4" class="invoice-preview">
        <div class="invoice-paper" :class="{ 'is-issued': hasLines }">
          <div class="paper-head">
            <div>
              <div class="paper-issuer">{{ issuerName }}</div>
              <div class="paper-sub">{{ $t('invoices.paperSub') }}</div>
            </div>
            <div class="paper-folio">
              <span class="folio-label">{{ $t('invoices.folioLabel') }}</span>
              <span class="folio-value mono">{{ folioLabel }}</span>
            </div>
          </div>

          <div class="paper-rule" />

          <div class="paper-row">
            <span class="paper-key">{{ $t('common.date') }}</span>
            <span class="mono">{{ store.current?.issueDate ? new Date(store.current.issueDate).toLocaleDateString(locale) :
              today }}</span>
          </div>

          <div class="paper-row">
            <span class="paper-key">{{ $t('invoices.customer') }}</span>
            <span v-if="previewCustomer" class="paper-customer">
              {{ previewCustomer.businessName }}
              <small class="mono">{{ previewCustomer.identification }}</small>
            </span>
            <span v-else class="paper-placeholder">{{ $t('invoices.undefined') }}</span>
          </div>

          <div class="paper-rule" />

          <div v-if="hasLines" class="paper-lines">
            <div v-for="line in (store.current?.lines || [])" :key="line.id" class="paper-line">
              <div class="paper-line-desc">
                <span>{{ lineItemName(line) }}</span>
                <span class="mono qty">×{{ line.quantity }}</span>
              </div>
              <span class="mono">{{ currencySymbol }}{{ (line.subtotalCents / 100).toFixed(2) }}</span>
            </div>
          </div>
          <div v-else class="paper-placeholder-block">
            {{ $t('invoices.linesPlaceholder') }}
          </div>

          <div class="paper-rule" />

          <div class="paper-totals">
            <div class="paper-row small">
              <span class="paper-key">{{ $t('invoices.subtotal') }}</span>
              <span class="mono">{{ currencySymbol }}{{ store.current?.subtotal ?? '0.00' }}</span>
            </div>
            <div class="paper-row small">
              <span class="paper-key">{{ $t('invoices.taxTotal') }}</span>
              <span class="mono">{{ currencySymbol }}{{ taxTotalDisplay }}</span>
            </div>
          </div>

          <div class="paper-total-block">
            <span class="total-caption">{{ $t('invoices.totalDue') }}</span>
            <div class="total-stamp" :class="{ active: hasLines }">
              <span class="mono">{{ currencySymbol }}{{ totalDisplay }}</span>
            </div>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Diálogo: completar RUC/país -->
    <v-dialog v-model="showOrgDialog" max-width="420">
      <v-card>
        <v-card-title>{{ $t('invoices.completeFiscalProfile') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="orgDialogError" type="error" class="mb-4">
            {{ orgDialogError }}
          </v-alert>
          <v-text-field
            v-model="quickTaxId"
            :label="$t('invoices.taxIdLabel')"
            class="mb-3"
            :placeholder="$t('invoices.taxIdPlaceholder')"
          />
          <v-select
            v-model="quickCountryCode"
            :items="supportedCountries()"
            :label="$t('common.country')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showOrgDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="orgDialogSaving" :disabled="!quickTaxId" @click="submitOrgProfile">
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo: crear establecimiento + punto de emisión -->
    <v-dialog v-model="showEstablishmentDialog" max-width="420">
      <v-card>
        <v-card-title>{{ $t('invoices.createEstablishment') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="establishmentDialogError" type="error" class="mb-4">
            {{ establishmentDialogError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            {{ $t('invoices.createEstablishmentHint') }}
          </p>
          <v-text-field
            v-model="quickEstablishmentName"
            :label="$t('invoices.establishmentName')"
            :placeholder="$t('invoices.establishmentPlaceholder')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEstablishmentDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="establishmentDialogSaving" :disabled="!quickEstablishmentName" @click="submitEstablishment">
            {{ $t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo: subir certificado .p12 -->
    <v-dialog v-model="showCertificateDialog" max-width="420">
      <v-card>
        <v-card-title>{{ $t('invoices.uploadCertificateTitle') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="certDialogError" type="error" class="mb-4">
            {{ certDialogError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            {{ $t('invoices.certEncryptedHint') }}
          </p>
          <v-file-input
            :label="$t('invoices.certFile')"
            accept=".p12,.pfx"
            class="mb-3"
            @change="onQuickCertFileChange"
          />
          <v-text-field
            v-model="quickCertPassword"
            :label="$t('invoices.certPassword')"
            type="password"
            class="mb-3"
          />
          <v-text-field
            v-model="quickCertAlias"
            :label="$t('invoices.certAlias')"
            :placeholder="$t('invoices.certAliasPlaceholder')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCertificateDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="fiscalStore.saving" :disabled="!quickCertFile || !quickCertPassword" @click="submitCertificate">
            {{ $t('common.upload') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/*
 * Sólo queda aquí lo que no se puede expresar con utilidades de Vuetify: la
 * previsualización con aspecto de papel (troquelado, reglas punteadas y el
 * sello rotado del total). Todo lo demás —botones, tabla, avisos, rejilla—
 * usa componentes del sistema.
 *
 * Los colores salen de tokens del tema, nunca de hex fijos: así la vista
 * funciona igual en claro y en oscuro.
 */
.invoice-workspace {
  max-width: 1180px;
}

/* Cifras alineadas en columna; usa la mono del sistema, sin fuente externa. */
.mono {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.inv-step {
  border-top: 1px solid rgb(var(--v-theme-borderColor));
  padding: 28px 0;
  transition: opacity 0.2s ease;
}
.inv-step:first-child { border-top: none; padding-top: 0; }
.inv-step.is-disabled { opacity: 0.45; }

.step-head { display: flex; gap: 14px; margin-bottom: 18px; }
.step-num {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.step-head h2 { font-size: 16px; font-weight: 600; margin: 0 0 2px; }
.step-head p { font-size: 13px; color: rgba(var(--v-theme-on-surface), 0.6); margin: 0; }
.step-body { padding-left: 40px; }

/* Previsualización: hoja de papel */
.invoice-preview { position: sticky; top: 24px; align-self: start; }
.invoice-paper {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-borderColor));
  border-radius: 3px;
  padding: 30px 26px 26px;
  position: relative;
  box-shadow: var(--surface-shadow);
}
/* Borde troquelado inferior, como un recibo. */
.invoice-paper::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 12px;
  background-image: radial-gradient(circle, rgb(var(--v-theme-background)) 3px, transparent 3.6px);
  background-size: 16px 12px;
  background-position: 4px 0;
}

.paper-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.paper-issuer { font-size: 15px; font-weight: 600; }
.paper-sub { font-size: 11.5px; color: rgba(var(--v-theme-on-surface), 0.6); margin-top: 2px; }
.paper-folio { text-align: right; }
.folio-label {
  display: block;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.38);
}
.folio-value { font-size: 12.5px; }

.paper-rule { border-top: 1px dashed rgb(var(--v-theme-borderColor)); margin: 16px 0; }

.paper-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13.5px;
  margin-bottom: 8px;
}
.paper-row.small { font-size: 12.5px; color: rgba(var(--v-theme-on-surface), 0.6); }
.paper-key { color: rgba(var(--v-theme-on-surface), 0.6); }
.paper-customer { text-align: right; display: flex; flex-direction: column; }
.paper-customer small { color: rgba(var(--v-theme-on-surface), 0.6); font-size: 11px; }
.paper-placeholder { color: rgba(var(--v-theme-on-surface), 0.38); font-style: italic; font-size: 13px; }
.paper-placeholder-block {
  color: rgba(var(--v-theme-on-surface), 0.38);
  font-size: 12.5px;
  font-style: italic;
  padding: 18px 0;
  text-align: center;
}

.paper-lines { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.paper-line { display: flex; justify-content: space-between; font-size: 13px; }
.paper-line-desc { display: flex; gap: 6px; }
.paper-line-desc .qty { color: rgba(var(--v-theme-on-surface), 0.38); font-size: 11.5px; }

.paper-totals { margin-top: 4px; }
.paper-total-block { display: flex; flex-direction: column; align-items: flex-end; margin-top: 18px; }
.total-caption {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.38);
  margin-bottom: 8px;
}
/* Sello del total: gris hasta que hay líneas, entonces pasa a "success". */
.total-stamp {
  position: relative;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.38);
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 18px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.38);
  transform: rotate(-3deg);
  transition: color 0.25s ease, border-color 0.25s ease;
}
.total-stamp::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid currentColor;
  border-radius: 5px;
  opacity: 0.4;
}
.total-stamp.active {
  color: rgb(var(--v-theme-success));
  border-color: rgb(var(--v-theme-success));
  background: rgb(var(--v-theme-lightsuccess));
}
</style>

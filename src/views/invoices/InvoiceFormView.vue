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
const creatingDraft = ref(false);
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

// Elegir un cliente crea el borrador de una vez, sin un paso de confirmación
// aparte: no hay nada más que decidir en ese momento.
watch(selectedCustomerId, async (id) => {
  if (!id || hasCustomer.value) return;
  creatingDraft.value = true;
  try {
    await selectCustomer();
  } finally {
    creatingDraft.value = false;
  }
});

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
    />

    <v-progress-linear v-if="loadingExisting" indeterminate class="mb-4" />

    <v-alert v-if="loadError" type="warning" class="mb-6">
      {{ loadError }}
    </v-alert>

    <v-alert v-if="errorMessage" type="error" closable class="mb-6" @click:close="errorMessage = ''">
      {{ errorMessage }}
    </v-alert>

    <v-card v-if="!loadError">
      <v-card-title class="text-h6 pa-6 pb-0">
        {{ $t('invoices.detailsTitle') }}
      </v-card-title>

      <v-card-text class="pa-6">
        <div class="text-body-2 text-medium-emphasis mb-6">
          {{ $t('invoices.folioLabel') }} {{ folioLabel }} · {{ $t('common.date') }}: {{ today }}
        </div>

        <!-- Emisor / cliente / estado -->
        <v-sheet color="grey100" rounded="lg" class="pa-4 mb-6">
          <v-row dense>
            <v-col cols="12" md="4">
              <div class="text-caption text-medium-emphasis mb-1">{{ $t('invoices.issuer') }}</div>
              <div class="font-weight-medium">{{ issuerName }}</div>
            </v-col>
            <v-col cols="12" md="5">
              <v-autocomplete
                v-model="selectedCustomerId"
                :items="customerStore.list.map(c => ({ title: `${c.businessName} (${c.identification})`, value: c.id }))"
                :label="$t('invoices.customer')"
                :placeholder="$t('invoices.searchCustomer')"
                clearable
                :disabled="hasCustomer"
                :loading="creatingDraft"
                :search-input.sync="customerSearch"
                :filter="customFilter"
              />
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-chip v-if="hasCustomer" color="lightwarning" variant="flat" size="small">
                {{ $t('invoices.status.draft') }}
              </v-chip>
            </v-col>
          </v-row>
        </v-sheet>

        <!-- Líneas -->
        <div class="text-subtitle-2 font-weight-medium mb-2">{{ $t('invoices.lines') }}</div>

        <v-table class="mb-2 bg-transparent">
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
                  icon="mdi-delete-outline"
                  variant="text"
                  size="x-small"
                  color="error"
                  :title="$t('invoices.removeLine')"
                  @click="removeLine(line.id)"
                />
              </td>
            </tr>
            <tr class="line-input-row">
              <td style="min-width: 220px">
                <v-select
                  v-model="newLine.productId"
                  :items="productStore.list.filter(p => p.status === 'active').map(p => ({ title: `${p.name} · ${p.type === 'service' ? $t('products.service') : $t('products.good')}`, value: p.id }))"
                  :placeholder="$t('invoices.productOrService')"
                  hide-details
                  :disabled="!hasCustomer"
                />
              </td>
              <td style="min-width: 220px">
                <v-text-field
                  v-model="newLine.description"
                  :placeholder="$t('invoices.descriptionOptional')"
                  hide-details
                  :disabled="!hasCustomer"
                />
              </td>
              <td style="width: 100px">
                <v-text-field
                  v-model.number="newLine.quantity"
                  type="number"
                  min="1"
                  hide-details
                  class="mono"
                  :disabled="!hasCustomer"
                />
              </td>
              <td style="width: 130px">
                <v-text-field
                  v-model="newLine.unitPrice"
                  hide-details
                  class="mono"
                  :disabled="!hasCustomer"
                />
              </td>
              <td class="text-right mono text-medium-emphasis">—</td>
              <td class="text-right">
                <v-btn
                  icon="mdi-plus"
                  variant="tonal"
                  color="primary"
                  size="small"
                  :title="$t('invoices.addLine')"
                  :disabled="!hasCustomer || !canAddLine"
                  @click="addLine"
                />
              </td>
            </tr>
          </tbody>
        </v-table>

        <p v-if="!hasCustomer" class="text-caption text-medium-emphasis mb-6">
          {{ $t('invoices.confirmCustomerFirst') }}
        </p>

        <!-- Totales -->
        <div class="d-flex justify-end mb-6">
          <div class="totals-block">
            <div class="d-flex justify-space-between text-body-2 text-medium-emphasis py-1">
              <span>{{ $t('invoices.subtotal') }}</span>
              <span class="mono">{{ currencySymbol }}{{ store.current?.subtotal ?? '0.00' }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 text-medium-emphasis py-1">
              <span>{{ $t('invoices.taxTotal') }}</span>
              <span class="mono">{{ currencySymbol }}{{ taxTotalDisplay }}</span>
            </div>
            <v-divider class="my-2" />
            <div class="d-flex justify-space-between text-h6 font-weight-bold">
              <span>{{ $t('invoices.totalDue') }}</span>
              <span class="mono">{{ currencySymbol }}{{ totalDisplay }}</span>
            </div>
          </div>
        </div>

        <v-divider class="mb-6" />

        <!-- Emisión -->
        <div class="text-subtitle-2 font-weight-medium mb-1">{{ $t('invoices.step3') }}</div>
        <p class="text-caption text-medium-emphasis mb-4">
          {{ regime.authority
            ? $t('invoices.step3Subtitle', { authority: regime.authority })
            : $t('invoices.step3SubtitleGeneric') }}
        </p>

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
            />
            <v-select
              v-model="selectedEmissionPointId"
              :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || $t('invoices.emissionPoint')}`, value: ep.id }))"
              :label="$t('invoices.emissionPoint')"
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
        </template>

        <p v-if="!hasLines" class="text-caption text-medium-emphasis mb-4">
          {{ $t('invoices.addLineFirst') }}
        </p>
        <p v-else class="text-body-2 text-medium-emphasis mb-4">
          {{ $t('invoices.issueNote') }}
        </p>

        <div class="d-flex ga-3 justify-end">
          <v-btn variant="outlined" :to="{ name: 'invoices' }">
            {{ $t('common.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            size="large"
            :loading="saving"
            :disabled="!hasLines || !selectedEstablishmentId || !selectedEmissionPointId"
            @click="handleIssue"
          >
            {{ saving ? $t('invoices.issuing') : $t('invoices.issueInvoice') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

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
 * Sólo lo que no se puede expresar con utilidades de Vuetify: el ancho máximo
 * del formulario y la fuente monoespaciada para cifras. Todo lo demás
 * —tarjeta, tabla, avisos, chips— usa componentes y tokens del sistema.
 */
.invoice-workspace {
  max-width: 960px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.totals-block {
  min-width: 260px;
}

/* La fila de captura lleva campos completos, no texto: necesita más aire
   vertical que las filas de sólo lectura de la tabla. */
.line-input-row > td {
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: middle;
}
</style>

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
import InvoiceLinesEditor from '@/components/invoices/InvoiceLinesEditor.vue';
import InvoiceTotals from '@/components/invoices/InvoiceTotals.vue';
import InvoiceIssuePanel from '@/components/invoices/InvoiceIssuePanel.vue';
import { getFiscalRegime } from '@/config/fiscalRegimes';

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
const invoiceId = ref<string | null>(null);
const creatingDraft = ref(false);
const saving = ref(false);

const selectedEstablishmentId = ref('');
const selectedEmissionPointId = ref('');

const orgProfileComplete = computed(() => orgStore.org?.completed ?? false);
const hasEstablishments = computed(() => orgStore.establishments.length > 0);
const noCertificate = computed(() => !fiscalStore.hasActiveCertificate);

const hasCustomer = computed(() => !!invoiceId.value);
const hasLines = computed(() => (store.current?.lines?.length ?? 0) > 0);

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

        <InvoiceLinesEditor :disabled="!hasCustomer" @error="errorMessage = $event" />

        <p v-if="!hasCustomer" class="text-caption text-medium-emphasis mb-6">
          {{ $t('invoices.confirmCustomerFirst') }}
        </p>

        <!-- Totales -->
        <InvoiceTotals :currency-symbol="currencySymbol" />

        <v-divider class="mb-6" />

        <!-- Emisión -->
        <InvoiceIssuePanel
          :organization-complete="orgProfileComplete"
          :has-establishments="hasEstablishments"
          :authority="regime.authority"
          :requires-signing-certificate="regime.requiresSigningCertificate"
          :no-certificate="noCertificate"
          :has-lines="hasLines"
          :establishment-id="selectedEstablishmentId"
          :emission-point-id="selectedEmissionPointId"
          :saving="saving"
          @update:establishment-id="selectedEstablishmentId = $event"
          @update:emission-point-id="selectedEmissionPointId = $event"
          @issue="handleIssue"
        />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
/*
 * Sólo lo que no se puede expresar con utilidades de Vuetify: el ancho máximo
 * del formulario. Las tablas de líneas, los totales y los diálogos de emisión
 * viven en sus propios componentes con su propio CSS. Todo lo demás
 * —tarjeta, tabla, avisos, chips— usa componentes y tokens del sistema.
 */
.invoice-workspace {
  max-width: 960px;
}
</style>
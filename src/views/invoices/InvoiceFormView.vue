<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useInvoiceStore } from '@/stores/invoices';
import { useCustomerStore } from '@/stores/customers';
import { useProductStore } from '@/stores/products';
import { useOrganizationStore } from '@/stores/organization';
import { useFiscalStore } from '@/stores/fiscal';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const store = useInvoiceStore();
const customerStore = useCustomerStore();
const productStore = useProductStore();
const orgStore = useOrganizationStore();
const fiscalStore = useFiscalStore();

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
  return product?.name || 'Producto sin nombre';
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

const today = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: '2-digit' });

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
      documentTypeId: '024ce4f5-baf1-4d04-9a7c-189076230390',
      currencyCode: 'USD',
    });
    invoiceId.value = invoice.id;
  } catch (e: any) {
    errorMessage.value = e.message || 'Error al crear la factura';
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
    errorMessage.value = e.message || 'Error al agregar la línea';
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
    errorMessage.value = e.message || 'Error al emitir la factura';
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/invoices');
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
    orgDialogError.value = e?.response?.data?.message || e.message || 'No se pudo guardar';
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
    establishmentDialogError.value = e?.response?.data?.message || e.message || 'No se pudo crear';
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
    certDialogError.value = e?.response?.data?.message || e.message || 'No se pudo subir el certificado';
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
        loadError.value = 'No se encontró la factura';
        return;
      }
      if (invoice.status !== 'draft') {
        loadError.value = 'Esta factura ya no es un borrador, no se puede editar.';
        return;
      }
      invoiceId.value = invoice.id;
      selectedCustomerId.value = invoice.customerId;
    } catch (e: any) {
      loadError.value = e.message || 'No se pudo cargar la factura';
    } finally {
      loadingExisting.value = false;
    }
  }
});
</script>

<template>
  <div class="invoice-workspace">
    <div class="invoice-topbar">
      <button type="button" class="back-link" @click="goBack">
        <v-icon icon="mdi-arrow-left" size="18" />
        Volver
      </button>
      <div class="invoice-heading">
        <span class="eyebrow">Documento electrónico · SRI Ecuador</span>
        <h1>{{ isEditMode ? 'Editar factura' : 'Nueva factura' }}</h1>
      </div>
    </div>

    <v-progress-linear v-if="loadingExisting" indeterminate class="mb-4" />

    <v-alert v-if="loadError" type="warning" variant="tonal" class="mb-6">
      {{ loadError }}
    </v-alert>

    <v-alert v-if="errorMessage" type="error" variant="tonal" closable class="mb-6" @click:close="errorMessage = ''">
      {{ errorMessage }}
    </v-alert>

    <div v-if="!loadError" class="invoice-grid">
      <!-- FORM COLUMN -->
      <div class="invoice-form">

        <!-- STEP 1 -->
        <section class="inv-step">
          <div class="step-head">
            <span class="step-num">1</span>
            <div>
              <h2>Cliente</h2>
              <p>¿A quién le estás facturando?</p>
            </div>
          </div>

          <div class="step-body">
            <v-autocomplete
              v-model="selectedCustomerId"
              :items="customerStore.list.map(c => ({ title: `${c.businessName} (${c.identification})`, value: c.id }))"
              label="Buscar cliente por nombre o identificación"
              variant="underlined"
              density="compact"
              clearable
              :disabled="hasCustomer"
              :search-input.sync="customerSearch"
              :filter="customFilter"
            />
            <button
              type="button"
              class="ghost-btn"
              :disabled="!selectedCustomerId || hasCustomer"
              @click="selectCustomer"
            >
              {{ hasCustomer ? 'Cliente confirmado' : 'Confirmar cliente' }}
              <v-icon v-if="!hasCustomer" icon="mdi-arrow-right" size="16" />
              <v-icon v-else icon="mdi-check" size="16" />
            </button>
          </div>
        </section>

        <!-- STEP 2 -->
        <section class="inv-step" :class="{ 'is-disabled': !hasCustomer }">
          <div class="step-head">
            <span class="step-num">2</span>
            <div>
              <h2>Líneas</h2>
              <p>Productos o servicios a incluir.</p>
            </div>
          </div>

          <div class="step-body">
            <div v-if="!hasCustomer" class="empty-hint">
              Confirma el cliente en el paso 1 para empezar a agregar productos.
            </div>

            <template v-else>
              <table v-if="hasLines" class="lines-table">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Descripción</th>
                    <th class="num">Cant.</th>
                    <th class="num">Precio</th>
                    <th class="num">Subtotal</th>
                    <th class="col-action" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in (store.current?.lines || [])" :key="line.id">
                    <td>{{ lineItemName(line) }}</td>
                    <td class="text-soft">{{ line.description }}</td>
                    <td class="num mono">{{ line.quantity }}</td>
                    <td class="num mono">{{ (line.unitPriceCents / 100).toFixed(2) }}</td>
                    <td class="num mono">{{ (line.subtotalCents / 100).toFixed(2) }}</td>
                    <td class="col-action">
                      <button type="button" class="icon-btn" title="Eliminar línea" @click="removeLine(line.id)">
                        <v-icon icon="mdi-close" size="16" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="add-line-row">
                <v-select
                  v-model="newLine.productId"
                  :items="productStore.list.filter(p => p.status === 'active').map(p => ({ title: `${p.name} · ${p.type === 'service' ? 'Servicio' : 'Producto'}`, value: p.id }))"
                  label="Producto o servicio"
                  variant="underlined"
                  density="compact"
                  class="col-product"
                />
                <v-text-field
                  v-model="newLine.description"
                  label="Descripción (opcional)"
                  variant="underlined"
                  density="compact"
                  class="col-description"
                />
                <v-text-field
                  v-model.number="newLine.quantity"
                  label="Cant."
                  type="number"
                  min="1"
                  variant="underlined"
                  density="compact"
                  class="col-qty mono"
                />
                <v-text-field
                  v-model="newLine.unitPrice"
                  label="Precio"
                  variant="underlined"
                  density="compact"
                  class="col-price mono"
                />
                <button type="button" class="icon-btn add" title="Agregar línea" :disabled="!canAddLine" @click="addLine">
                  <v-icon icon="mdi-plus" size="18" />
                </button>
              </div>
            </template>
          </div>
        </section>

        <!-- STEP 3 -->
        <section class="inv-step" :class="{ 'is-disabled': !hasLines }">
          <div class="step-head">
            <span class="step-num">3</span>
            <div>
              <h2>Emitir</h2>
              <p>Revisa los totales y envía al SRI.</p>
            </div>
          </div>

          <div class="step-body">
            <div v-if="!hasLines" class="empty-hint">
              Agrega al menos una línea de producto para poder emitir la factura.
            </div>
            <template v-else>
              <div v-if="!orgProfileComplete" class="setup-hint">
                <v-icon icon="mdi-alert-circle-outline" size="18" class="mr-1" />
                <span>
                  Antes de emitir, completa el <strong>RUC y país</strong> de tu organización.
                </span>
                <button type="button" class="setup-link" @click="showOrgDialog = true">Completar ahora</button>
              </div>

              <div v-else-if="!hasEstablishments" class="setup-hint">
                <v-icon icon="mdi-alert-circle-outline" size="18" class="mr-1" />
                <span>
                  Necesitás crear al menos un <strong>establecimiento y un punto de emisión</strong> para emitir.
                </span>
                <button type="button" class="setup-link" @click="showEstablishmentDialog = true">Crear ahora</button>
              </div>

              <template v-else>
                <div class="emission-selects">
                  <v-select
                    v-model="selectedEstablishmentId"
                    :items="orgStore.establishments.filter(e => e.status === 'active').map(e => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
                    label="Establecimiento"
                    variant="underlined"
                    density="compact"
                  />
                  <v-select
                    v-model="selectedEmissionPointId"
                    :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || 'Punto de emisión'}`, value: ep.id }))"
                    label="Punto de emisión"
                    variant="underlined"
                    density="compact"
                    :disabled="!selectedEstablishmentId"
                  />
                </div>
                <p v-if="selectedEstablishmentId && !selectedEstablishmentHasEmissionPoints" class="setup-hint">
                  <v-icon icon="mdi-alert-circle-outline" size="18" class="mr-1" />
                  Este establecimiento no tiene puntos de emisión activos.
                  <button type="button" class="setup-link" @click="showEstablishmentDialog = true">Crear uno</button>
                </p>
                <p v-if="noCertificate" class="setup-hint info">
                  <v-icon icon="mdi-information-outline" size="18" class="mr-1" />
                  No tenés un certificado electrónico activo — la factura se emite igual, pero el SRI
                  nunca la va a autorizar hasta que subas uno.
                  <button type="button" class="setup-link" @click="showCertificateDialog = true">Subir certificado</button>
                </p>
                <p class="issue-note">
                  Al emitir, la factura se enviará como documento electrónico y no podrá editarse.
                </p>
                <button type="button" class="issue-btn" :disabled="saving || !selectedEstablishmentId || !selectedEmissionPointId" @click="handleIssue">
                  <v-progress-circular v-if="saving" indeterminate size="16" width="2" class="mr-2" />
                  {{ saving ? 'Emitiendo…' : 'Emitir factura' }}
                </button>
              </template>
            </template>
          </div>
        </section>
      </div>

      <!-- PREVIEW COLUMN -->
      <aside class="invoice-preview">
        <div class="invoice-paper" :class="{ 'is-issued': hasLines }">
          <div class="paper-head">
            <div>
              <div class="paper-issuer">{{ issuerName }}</div>
              <div class="paper-sub">Factura · Documento electrónico</div>
            </div>
            <div class="paper-folio">
              <span class="folio-label">N.º</span>
              <span class="folio-value mono">{{ folioLabel }}</span>
            </div>
          </div>

          <div class="paper-rule" />

          <div class="paper-row">
            <span class="paper-key">Fecha</span>
            <span class="mono">{{ store.current?.issueDate ? new Date(store.current.issueDate).toLocaleDateString('es-EC') : today }}</span>
          </div>

          <div class="paper-row">
            <span class="paper-key">Cliente</span>
            <span v-if="previewCustomer" class="paper-customer">
              {{ previewCustomer.businessName }}
              <small class="mono">{{ previewCustomer.identification }}</small>
            </span>
            <span v-else class="paper-placeholder">Sin definir</span>
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
            Las líneas que agregues aparecerán aquí.
          </div>

          <div class="paper-rule" />

          <div class="paper-totals">
            <div class="paper-row small">
              <span class="paper-key">Subtotal</span>
              <span class="mono">{{ currencySymbol }}{{ store.current?.subtotal ?? '0.00' }}</span>
            </div>
            <div class="paper-row small">
              <span class="paper-key">IVA</span>
              <span class="mono">{{ currencySymbol }}{{ taxTotalDisplay }}</span>
            </div>
          </div>

          <div class="paper-total-block">
            <span class="total-caption">Total a pagar</span>
            <div class="total-stamp" :class="{ active: hasLines }">
              <span class="mono">{{ currencySymbol }}{{ totalDisplay }}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Diálogo: completar RUC/país -->
    <v-dialog v-model="showOrgDialog" max-width="420">
      <v-card>
        <v-card-title>Completar perfil fiscal</v-card-title>
        <v-card-text>
          <v-alert v-if="orgDialogError" type="error" density="compact" variant="tonal" class="mb-4">
            {{ orgDialogError }}
          </v-alert>
          <v-text-field
            v-model="quickTaxId"
            label="RUC / identificación tributaria"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
            placeholder="Ej. 1793176071001"
          />
          <v-select
            v-model="quickCountryCode"
            :items="[{ title: 'Ecuador', value: 'EC' }]"
            label="País"
            variant="outlined"
            density="compact"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showOrgDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="orgDialogSaving" :disabled="!quickTaxId" @click="submitOrgProfile">
            Guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo: crear establecimiento + punto de emisión -->
    <v-dialog v-model="showEstablishmentDialog" max-width="420">
      <v-card>
        <v-card-title>Crear establecimiento</v-card-title>
        <v-card-text>
          <v-alert v-if="establishmentDialogError" type="error" density="compact" variant="tonal" class="mb-4">
            {{ establishmentDialogError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            Se crea junto con un punto de emisión "Principal" para que puedas emitir de una.
          </p>
          <v-text-field
            v-model="quickEstablishmentName"
            label="Nombre del establecimiento"
            variant="outlined"
            density="compact"
            hide-details="auto"
            placeholder="Ej. Matriz"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEstablishmentDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="establishmentDialogSaving" :disabled="!quickEstablishmentName" @click="submitEstablishment">
            Crear
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo: subir certificado .p12 -->
    <v-dialog v-model="showCertificateDialog" max-width="420">
      <v-card>
        <v-card-title>Subir certificado (.p12)</v-card-title>
        <v-card-text>
          <v-alert v-if="certDialogError" type="error" density="compact" variant="tonal" class="mb-4">
            {{ certDialogError }}
          </v-alert>
          <p class="text-caption text-medium-emphasis mb-3">
            El archivo y la contraseña se guardan cifrados.
          </p>
          <v-file-input
            label="Archivo .p12"
            variant="outlined"
            density="compact"
            accept=".p12,.pfx"
            class="mb-3"
            hide-details="auto"
            @change="onQuickCertFileChange"
          />
          <v-text-field
            v-model="quickCertPassword"
            label="Contraseña del certificado"
            type="password"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />
          <v-text-field
            v-model="quickCertAlias"
            label="Nombre para identificarlo (opcional)"
            variant="outlined"
            density="compact"
            hide-details="auto"
            placeholder="Ej. Firma 2026"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCertificateDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="fiscalStore.saving" :disabled="!quickCertFile || !quickCertPassword" @click="submitCertificate">
            Subir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

.invoice-workspace {
  --ink: #1c1f26;
  --ink-soft: #70757f;
  --ink-faint: #a3a8b3;
  --line: #e3e6eb;
  --paper: #f8fafc;
  --surface: #ffffff;
  --accent: #078dee;
  --stamp: #1f6f54;
  --stamp-soft: #e7f1ec;
  font-family: 'Inter', sans-serif;
  color: var(--ink);
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

/* Topbar */
.invoice-topbar { margin-bottom: 28px; }
.back-link {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  color: var(--ink-soft); font-size: 13px; padding: 0 0 14px; letter-spacing: .01em;
  transition: color .15s ease;
}
.back-link:hover { color: var(--ink); }
.invoice-heading .eyebrow {
  display: block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--ink-faint); margin-bottom: 4px;
}
.invoice-heading h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }

/* Grid */
.invoice-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 48px; align-items: start; }
@media (max-width: 1100px) {
  .invoice-grid { grid-template-columns: 1fr; }
  .invoice-preview { max-width: 420px; }
}

/* Steps */
.invoice-form { display: flex; flex-direction: column; gap: 8px; }
.inv-step { border-top: 1px solid var(--line); padding: 28px 0; transition: opacity .2s ease; }
.inv-step:first-child { border-top: none; padding-top: 0; }
.inv-step.is-disabled { opacity: .45; }

.step-head { display: flex; gap: 14px; margin-bottom: 18px; }
.step-num {
  flex: none; width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid var(--ink); display: flex; align-items: center; justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
}
.step-head h2 { font-size: 16px; font-weight: 600; margin: 0 0 2px; }
.step-head p { font-size: 13px; color: var(--ink-soft); margin: 0; }

.step-body { padding-left: 40px; }
.empty-hint { font-size: 13.5px; color: var(--ink-soft); padding: 8px 0 4px; }

/* Buttons */
.ghost-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: 1px solid var(--ink); border-radius: 999px;
  padding: 8px 18px; font-size: 13px; font-weight: 500; color: var(--ink);
  cursor: pointer; transition: background .15s ease, color .15s ease;
}
.ghost-btn:hover:not(:disabled) { background: var(--ink); color: #fff; }
.ghost-btn:disabled { opacity: .35; cursor: not-allowed; }

.issue-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: #fff; border: none; border-radius: 8px;
  padding: 13px 26px; font-size: 14px; font-weight: 600; letter-spacing: .01em;
  cursor: pointer; transition: filter .15s ease;
}
.issue-btn:hover:not(:disabled) { filter: brightness(0.93); }
.issue-btn:disabled { opacity: .5; cursor: not-allowed; }
.issue-note { font-size: 13px; color: var(--ink-soft); margin: 0 0 16px; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px; border: 1px solid transparent;
  background: none; color: var(--ink-soft); cursor: pointer;
}
.icon-btn:hover { background: var(--paper); color: var(--ink); }
.icon-btn.add { border-color: var(--ink); color: var(--ink); align-self: flex-end; margin-bottom: 8px; }
.icon-btn.add:hover:not(:disabled) { background: var(--ink); color: #fff; }
.icon-btn.add:disabled { opacity: .3; cursor: not-allowed; }

/* Lines table */
.lines-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13.5px; }
.lines-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--ink-faint); font-weight: 500; padding-bottom: 8px; border-bottom: 1px solid var(--line);
}
.lines-table td { padding: 10px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
.lines-table th.num, .lines-table td.num { text-align: right; }
.lines-table .text-soft { color: var(--ink-soft); }
.lines-table .col-action { width: 32px; }

.add-line-row { display: flex; gap: 12px; align-items: flex-end; }
.add-line-row .col-product { flex: 1.4; }
.add-line-row .col-description { flex: 1.6; }
.add-line-row .col-qty { flex: 0.6; }
.add-line-row .col-price { flex: 0.8; }

.emission-selects { display: flex; gap: 12px; margin-bottom: 16px; }
.emission-selects > * { flex: 1; }

.setup-hint {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
  background: #fff8e6; border: 1px solid #f0ddaa; color: #7a5c00;
  border-radius: 8px; padding: 12px 14px; font-size: 13.5px; margin-bottom: 16px;
}
.setup-hint.info { background: #eaf3fb; border-color: #bcdaf0; color: #1a5a8a; }
.setup-hint .setup-link {
  color: var(--accent); font-weight: 600; text-decoration: none; margin-left: auto;
  white-space: nowrap; background: none; border: none; padding: 0; font-size: inherit;
  font-family: inherit; cursor: pointer;
}
.setup-hint .setup-link:hover { text-decoration: underline; }

/* Preview */
.invoice-preview { position: sticky; top: 24px; }
.invoice-paper {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 30px 26px 26px;
  position: relative;
  box-shadow: 0 1px 2px rgba(28, 31, 38, 0.04), 0 16px 32px -18px rgba(28, 31, 38, 0.18);
}
.invoice-paper::after {
  content: '';
  position: absolute; left: 0; right: 0; bottom: -6px; height: 12px;
  background-image: radial-gradient(circle, var(--paper) 3px, transparent 3.6px);
  background-size: 16px 12px; background-position: 4px 0;
}

.paper-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.paper-issuer { font-size: 15px; font-weight: 600; }
.paper-sub { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }
.paper-folio { text-align: right; }
.folio-label { display: block; font-size: 10px; letter-spacing: .1em; color: var(--ink-faint); }
.folio-value { font-size: 12.5px; }

.paper-rule { border-top: 1px dashed var(--line); margin: 16px 0; }

.paper-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px; margin-bottom: 8px; }
.paper-row.small { font-size: 12.5px; color: var(--ink-soft); }
.paper-key { color: var(--ink-soft); }
.paper-customer { text-align: right; display: flex; flex-direction: column; }
.paper-customer small { color: var(--ink-soft); font-size: 11px; }
.paper-placeholder { color: var(--ink-faint); font-style: italic; font-size: 13px; }
.paper-placeholder-block {
  color: var(--ink-faint); font-size: 12.5px; font-style: italic;
  padding: 18px 0; text-align: center;
}

.paper-lines { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.paper-line { display: flex; justify-content: space-between; font-size: 13px; }
.paper-line-desc { display: flex; gap: 6px; }
.paper-line-desc .qty { color: var(--ink-faint); font-size: 11.5px; }

.paper-totals { margin-top: 4px; }

.paper-total-block { display: flex; flex-direction: column; align-items: flex-end; margin-top: 18px; }
.total-caption { font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-faint); margin-bottom: 8px; }
.total-stamp {
  position: relative;
  border: 2px solid var(--ink-faint);
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 18px; font-weight: 600;
  color: var(--ink-faint);
  transform: rotate(-3deg);
  transition: color .25s ease, border-color .25s ease;
}
.total-stamp::before {
  content: ''; position: absolute; inset: 4px; border: 1px solid currentColor;
  border-radius: 5px; opacity: .4;
}
.total-stamp.active { color: var(--stamp); border-color: var(--stamp); background: var(--stamp-soft); }
</style>

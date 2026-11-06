<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { formatDate, formatNumber } from '@/utils/format';
import { notify } from '@/composable/useNotify';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { customerApi } from '@/api/customers';
import { invoiceApi } from '@/api/invoices';
import { productApi } from '@/api/products';
import { projectsApi } from '@/api/projects';
import { getFiscalRegime } from '@/config/fiscalRegimes';
import { useOrganizationStore } from '@/stores/organization';
import { useProjectsStore } from '@/stores/projects';
import { formatMoney } from '@/utils/accounting';
import { formatMinutes, hoursDecimal } from '@/utils/duration';
import { extractError } from '@/utils/error';
import { displayName } from '@/utils/projects';
import { parseMoney, toInvoiceLines } from '@/utils/projectBilling';
import type { BillingGroupBy, BillingPreview, BillingSummary, ProjectInvoice, ProjectInvoiceStatus } from '@/types/projects';

/**
 * Facturación del proyecto (entregable 6): lo que Asana no tiene. Las horas facturables y los hitos con importe se convierten en un
 * borrador de factura electrónica, que se revisa y se emite al SRI desde Facturación.
 *
 * Para no facturar dos veces, primero se RESERVA en projects-service (aparta horas e hitos), luego se crea el borrador en billing con
 * esas líneas y al final se enlaza. Si algo falla a mitad, la reserva se libera y todo vuelve a «por facturar».
 */
const { t, locale } = useI18n();
const router = useRouter();
const store = useProjectsStore();
const orgStore = useOrganizationStore();

const project = computed(() => store.current);
const summary = ref<BillingSummary | null>(null);
const failure = ref<string | null>(null);
const loading = ref(false);
const money = (cents: number) => formatMoney(cents, locale.value);

async function load(): Promise<void> {
  if (!project.value) return;
  loading.value = true;
  try {
    summary.value = await projectsApi.billing(project.value.id);
    applySettings();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void store.ensureDirectory();
  if (!orgStore.org) void orgStore.fetch();
  void load();
});

// ── Configuración ──
interface Option {
  value: string;
  title: string;
  subtitle?: string;
}
const customer = ref<Option | null>(null);
const product = ref<Option | null>(null);
const rate = ref('');
const groupBy = ref<BillingGroupBy>('task');
const customerSearch = ref('');
const productSearch = ref('');
const customerItems = ref<Option[]>([]);
const productItems = ref<Option[]>([]);
const savingSettings = ref(false);

function applySettings(): void {
  const s = summary.value?.settings;
  if (!s) return;
  customer.value = s.customerId ? { value: s.customerId, title: s.customerLabel ?? '' } : null;
  product.value = s.serviceProductId ? { value: s.serviceProductId, title: s.serviceProductLabel ?? '' } : null;
  rate.value = s.hourlyRateCents ? (s.hourlyRateCents / 100).toFixed(2).replace('.', ',') : '';
  groupBy.value = s.groupBy;
}

let customerTimer: ReturnType<typeof setTimeout> | null = null;
watch(customerSearch, (q) => {
  if (customerTimer) clearTimeout(customerTimer);
  customerTimer = setTimeout(async () => {
    try {
      customerItems.value = (await customerApi.list({ search: q || undefined, status: 'active' }))
        .slice(0, 20)
        .map((c) => ({ value: c.id, title: c.tradeName || c.businessName, subtitle: c.identification ?? undefined }));
    } catch {
      customerItems.value = [];
    }
  }, 300);
});
let productTimer: ReturnType<typeof setTimeout> | null = null;
watch(productSearch, (q) => {
  if (productTimer) clearTimeout(productTimer);
  productTimer = setTimeout(async () => {
    try {
      productItems.value = (await productApi.list({ search: q || undefined, type: 'service', pageSize: 20 })).items.map((p) => ({ value: p.id, title: p.name, subtitle: p.sku ?? undefined }));
    } catch {
      productItems.value = [];
    }
  }, 300);
});

const rateCents = computed(() => (rate.value.trim() ? parseMoney(rate.value) : null));
const groupItems = computed(() => (['task', 'person', 'single'] as const).map((v) => ({ value: v, title: t(`projects.billing.groupBy.${v}`) })));

async function saveSettings(): Promise<void> {
  if (!project.value || (rate.value.trim() && rateCents.value === null)) return;
  savingSettings.value = true;
  failure.value = null;
  try {
    await projectsApi.saveBillingSettings(project.value.id, {
      customerId: customer.value?.value ?? null,
      customerLabel: customer.value?.title ?? null,
      hourlyRateCents: rateCents.value,
      serviceProductId: product.value?.value ?? null,
      serviceProductLabel: product.value?.title ?? null,
      groupBy: groupBy.value,
    });
    notify.success(t('projects.billing.saved'));
    await load();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    savingSettings.value = false;
  }
}

// ── Hitos ──
// En dólares (con decimales) para `v-number-input`; la API habla en centavos.
const amounts = ref<Record<string, number | null>>({});
watch(summary, (s) => {
  amounts.value = Object.fromEntries((s?.milestones ?? []).map((m) => [m.taskId, m.amountCents ? m.amountCents / 100 : null]));
});

async function saveMilestone(taskId: string): Promise<void> {
  if (!project.value) return;
  const value = amounts.value[taskId];
  const cents = value == null || Number.isNaN(value) ? null : Math.round(value * 100);
  const current = summary.value?.milestones.find((m) => m.taskId === taskId)?.amountCents ?? null;
  if (cents === current) return;
  try {
    await projectsApi.setMilestoneAmount(project.value.id, taskId, cents);
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}

// ── Preparar la factura ──
const from = ref<string | null>(null);
const to = ref<string | null>(null);
const includeHours = ref(true);
const selectedMilestones = ref<string[]>([]);
const preview = ref<BillingPreview | null>(null);
const creating = ref(false);
const billableMilestones = computed(() => (summary.value?.milestones ?? []).filter((m) => m.completedAt && m.amountCents && !m.billingId));
const criteria = computed(() => ({
  from: from.value || undefined,
  to: to.value || undefined,
  includeHours: includeHours.value,
  milestoneTaskIds: selectedMilestones.value,
  groupBy: groupBy.value,
}));
const configured = computed(() => !!summary.value?.settings.customerId && !!summary.value?.settings.serviceProductId);

watch(criteria, () => (preview.value = null), { deep: true });

async function runPreview(): Promise<void> {
  if (!project.value) return;
  failure.value = null;
  try {
    preview.value = await projectsApi.billingPreview(project.value.id, criteria.value);
  } catch (err) {
    failure.value = extractError(err);
  }
}

const lineCtx = computed(() => ({
  productLabel: summary.value?.settings.serviceProductLabel ?? '',
  projectName: project.value?.name ?? '',
  personName: (id: string) => displayName(store.users.get(id)) || id,
  hoursLabel: (q: number) => `${hoursDecimal(q * 60, locale.value)} h`,
}));

/** Reserva → borrador en billing → enlace. Si falla a mitad, se libera la reserva para no dejar horas apartadas. */
async function createDraft(): Promise<void> {
  if (!project.value || !summary.value) return;
  const regime = getFiscalRegime(orgStore.org?.countryCode);
  creating.value = true;
  failure.value = null;
  let billingId: string | null = null;
  let invoiceId: string | null = null;
  try {
    const reserved = await projectsApi.reserveBilling(project.value.id, criteria.value);
    billingId = reserved.invoice.id;
    const invoice = await invoiceApi.create({ customerId: reserved.settings.customerId!, documentTypeId: regime.invoiceDocumentTypeId, currencyCode: regime.currencyCode });
    invoiceId = invoice.id;
    for (const line of toInvoiceLines(reserved.preview.groups, reserved.settings.serviceProductId!, lineCtx.value)) await invoiceApi.addLine(invoice.id, line);
    await projectsApi.attachInvoice(billingId, invoice.id);
    void router.push(`/invoices/${invoice.id}/edit`);
  } catch (err) {
    failure.value = extractError(err);
    if (billingId) {
      await projectsApi.releaseBilling(billingId).catch(() => undefined);
      if (invoiceId) failure.value = `${failure.value} ${t('projects.billing.orphanDraft')}`;
    }
    await load();
  } finally {
    creating.value = false;
  }
}

// ── Facturas del proyecto ──
const STATUS_COLOR: Record<ProjectInvoiceStatus, string | undefined> = { pending: 'warning', draft: 'info', issued: 'success', voided: 'error', released: undefined };

function openInvoice(i: ProjectInvoice): void {
  if (i.invoiceId) void router.push(i.status === 'draft' ? `/invoices/${i.invoiceId}/edit` : `/invoices/${i.invoiceId}`);
}

/** Un borrador ya existe en Facturación y billing no deja borrarlo: liberar pide confirmación y explica que no hay que emitirlo. */
const confirmRelease = ref<ProjectInvoice | null>(null);

async function release(i: ProjectInvoice): Promise<void> {
  confirmRelease.value = null;
  try {
    await projectsApi.releaseBilling(i.id);
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}

</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-alert v-if="failure" type="error" closable @click:close="failure = null">{{ failure }}</v-alert>
    <v-progress-linear v-if="loading && !summary" indeterminate color="primary" />

    <template v-if="summary">
      <v-row>
        <v-col cols="12" sm="4">
          <v-card class="pa-4 h-100">
            <div class="text-body-medium text-medium-emphasis">{{ t('projects.billing.unbilledHours') }}</div>
            <div class="text-title-large">{{ formatMinutes(summary.unbilledMinutes) }}</div>
            <div class="text-body-medium text-medium-emphasis">{{ t('projects.billing.entries', summary.unbilledEntries) }}</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card class="pa-4 h-100">
            <div class="text-body-medium text-medium-emphasis">{{ t('projects.billing.unbilledAmount') }}</div>
            <div class="text-title-large text-success">{{ money(summary.unbilledAmountCents) }}</div>
            <div class="text-body-medium text-medium-emphasis">{{ t('projects.billing.beforeTax') }}</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card class="pa-4 h-100">
            <div class="text-body-medium text-medium-emphasis">{{ t('projects.billing.milestonesReady') }}</div>
            <div class="text-title-large">{{ billableMilestones.length }}</div>
            <div class="text-body-medium text-medium-emphasis">{{ money(billableMilestones.reduce((n, m) => n + (m.amountCents ?? 0), 0)) }}</div>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="pa-6">
        <div class="text-title-large mb-2">{{ t('projects.billing.settings') }}</div>
        <div class="text-body-medium text-medium-emphasis mb-4">{{ t('projects.billing.settingsHint') }}</div>
        <v-row>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="customer"
              v-model:search="customerSearch"
              :items="customerItems"
              :label="t('projects.billing.customer')"
              return-object
              no-filter
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="product"
              v-model:search="productSearch"
              :items="productItems"
              :label="t('projects.billing.service')"
              :hint="t('projects.billing.serviceHint')"
              persistent-hint
              return-object
              no-filter
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field v-model="rate" :label="t('projects.billing.rate')" prefix="$" :error="!!rate.trim() && rateCents === null" />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="groupBy" :items="groupItems" :label="t('projects.billing.groupByLabel')" />
          </v-col>
          <v-col cols="12" md="6" class="d-flex align-center justify-end">
            <v-btn color="primary" :loading="savingSettings" @click="saveSettings">{{ t('common.save') }}</v-btn>
          </v-col>
        </v-row>
      </v-card>

      <v-card v-if="summary.milestones.length" class="pa-6">
        <div class="text-title-large mb-2">{{ t('projects.billing.milestones') }}</div>
        <div class="text-body-medium text-medium-emphasis mb-4">{{ t('projects.billing.milestonesHint') }}</div>
        <v-table density="compact">
          <tbody>
            <tr v-for="m in summary.milestones" :key="m.taskId">
              <td>
                <v-icon icon="mdi-rhombus" size="small" color="warning" class="mr-1" />{{ m.title }}
              </td>
              <td class="d-none d-sm-table-cell">
                <v-chip v-if="m.billingId" size="x-small" color="info">{{ t('projects.billing.inInvoice') }}</v-chip>
                <v-chip v-else-if="m.completedAt" size="x-small" color="success">{{ t('projects.billing.completed') }}</v-chip>
                <v-chip v-else size="x-small">{{ t('projects.billing.notCompleted') }}</v-chip>
              </td>
              <td class="text-right" style="width: 180px">
                <v-number-input
                  v-model="amounts[m.taskId]"
                  :label="t('projects.billing.amount')"
                  prefix="$"
                  :precision="2"
                  :min="0"
                  control-variant="hidden"
                  :disabled="!!m.billingId"
                  @blur="saveMilestone(m.taskId)"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card class="pa-6">
        <div class="text-title-large mb-2">{{ t('projects.billing.prepare') }}</div>
        <v-alert v-if="!configured" type="info" class="mb-4">{{ t('projects.billing.configureFirst') }}</v-alert>
        <v-row>
          <v-col cols="12" sm="4"><v-switch v-model="includeHours" :label="t('projects.billing.includeHours')" /></v-col>
          <v-col cols="6" sm="4"><DateField v-model="from" :max="to" :label="t('projects.time.from')" :disabled="!includeHours" clearable /></v-col>
          <v-col cols="6" sm="4"><DateField v-model="to" :min="from" :label="t('projects.time.to')" :disabled="!includeHours" clearable /></v-col>
        </v-row>
        <div v-if="billableMilestones.length" class="mb-4">
          <div class="text-body-medium mb-2">{{ t('projects.billing.milestonesToBill') }}</div>
          <v-checkbox
            v-for="m in billableMilestones"
            :key="m.taskId"
            v-model="selectedMilestones"
            :value="m.taskId"
            :label="`${m.title} · ${money(m.amountCents ?? 0)}`"
            density="compact"
            hide-details
          />
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="text" :disabled="!configured" @click="runPreview">{{ t('projects.billing.previewBtn') }}</v-btn>
          <v-btn color="primary" :disabled="!configured || !preview || !preview.groups.length" :loading="creating" prepend-icon="mdi-receipt-text-plus-outline" @click="createDraft">
            {{ t('projects.billing.createDraft') }}
          </v-btn>
        </div>

        <template v-if="preview">
          <v-alert v-if="!preview.groups.length" type="info" class="mt-4">{{ t('projects.billing.nothing') }}</v-alert>
          <v-table v-else density="compact" class="mt-4">
            <thead>
              <tr>
                <th>{{ t('projects.billing.description') }}</th>
                <th class="text-right">{{ t('projects.billing.quantity') }}</th>
                <th class="text-right d-none d-sm-table-cell">{{ t('projects.billing.unitPrice') }}</th>
                <th class="text-right">{{ t('projects.billing.subtotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in toInvoiceLines(preview.groups, summary.settings.serviceProductId ?? '', lineCtx)" :key="i">
                <td>{{ line.description }}</td>
                <td class="text-right">{{ formatNumber(line.quantity) }}</td>
                <td class="text-right d-none d-sm-table-cell">{{ money(preview.groups[i]!.unitPriceCents) }}</td>
                <td class="text-right">{{ money(preview.groups[i]!.amountCents) }}</td>
              </tr>
              <tr>
                <td colspan="2" class="font-weight-medium">{{ t('projects.billing.totalBeforeTax') }}</td>
                <td class="d-none d-sm-table-cell" />
                <td class="text-right font-weight-medium">{{ money(preview.amountCents) }}</td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card>

      <v-card class="pa-6">
        <div class="text-title-large mb-2">{{ t('projects.billing.invoices') }}</div>
        <div v-if="!summary.invoices.length" class="text-body-medium text-medium-emphasis">{{ t('projects.billing.noInvoices') }}</div>
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th>{{ t('projects.billing.columns.date') }}</th>
              <th>{{ t('projects.billing.columns.status') }}</th>
              <th class="d-none d-sm-table-cell">{{ t('projects.billing.columns.number') }}</th>
              <th class="d-none d-md-table-cell">{{ t('projects.billing.columns.work') }}</th>
              <th class="text-right">{{ t('projects.billing.columns.amount') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in summary.invoices" :key="i.id">
              <td class="text-no-wrap">{{ formatDate(i.createdAt) }}</td>
              <td>
                <v-chip size="small" :color="STATUS_COLOR[i.status]">{{ t(`projects.billing.status.${i.status}`) }}</v-chip>
                <v-chip v-if="i.conflicts" size="small" color="error" prepend-icon="mdi-alert-outline" class="ml-1">{{ t('projects.billing.conflicts', i.conflicts) }}</v-chip>
              </td>
              <td class="d-none d-sm-table-cell">{{ i.number ?? '—' }}</td>
              <td class="d-none d-md-table-cell">{{ formatMinutes(i.minutes) }}<template v-if="i.milestoneCount"> · {{ t('projects.billing.milestoneCount', i.milestoneCount) }}</template></td>
              <td class="text-right">{{ money(i.amountCents) }}</td>
              <td class="text-right text-no-wrap">
                <v-btn v-if="i.invoiceId" size="small" variant="text" @click="openInvoice(i)">{{ t('projects.billing.open') }}</v-btn>
                <v-btn v-if="i.status === 'pending' || i.status === 'draft'" size="small" variant="text" color="error" @click="i.status === 'draft' ? (confirmRelease = i) : release(i)">{{ t('projects.billing.release') }}</v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <v-dialog :model-value="!!confirmRelease" @update:model-value="(v) => !v && (confirmRelease = null)">
      <v-card>
        <v-card-title>{{ t('projects.billing.releaseTitle') }}</v-card-title>
        <v-card-text>{{ t('projects.billing.releaseText') }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmRelease = null">{{ t('common.cancel') }}</v-btn>
          <v-btn variant="flat" color="error" @click="release(confirmRelease!)">{{ t('projects.billing.release') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

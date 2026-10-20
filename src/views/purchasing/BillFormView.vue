<script setup lang="ts">
/**
 * Alta y edición de una factura de compra en BORRADOR o BLOQUEADA. El documento del proveedor entra como un solo campo
 * (`001-001-000000123`) y se parte en los tres que guarda el servidor. Las líneas pueden precargarse de lo recibido y aún no
 * facturado de una orden; el IVA se calcula desde el porcentaje mientras nadie lo corrija a mano, porque el proveedor suele
 * redondear distinto y manda su documento (el servidor vuelve a calcular y comprobar).
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProductStore } from '@/stores/products';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import { formatMoney } from '@/utils/accounting';
import { lineAmounts, parseQuantityMicros, toBillQuantity } from '@/utils/purchasing';
import { fromCents, toCents, todayIso } from '@/utils/taxDocuments';
import type { LineAmounts } from '@/utils/purchasing';
import type { BillDocType, BillInput, OrderStatus } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = usePurchasingStore();
const auth = useAuthStore();
const productStore = useProductStore();

const billId = computed(() => (route.params.id as string | undefined) ?? null);
const loadError = ref<string | null>(null);
const formError = ref<string | null>(null);

interface LineRow {
  key: number;
  orderLineId: string | null;
  productId: string | null;
  description: string;
  quantity: string;
  unitCost: string;
  discount: string;
  taxRatePct: string;
  /** Importe del IVA escrito a mano (en dólares); `null` = se calcula desde el porcentaje. */
  taxCentsManual: string | null;
  expenseAccountHint: string;
}

let nextKey = 1;
const emptyLine = (): LineRow => ({
  key: nextKey++,
  orderLineId: null,
  productId: null,
  description: '',
  quantity: '1',
  unitCost: '',
  discount: '0',
  taxRatePct: '',
  taxCentsManual: null,
  expenseAccountHint: '',
});

const supplierId = ref<string | null>(null);
const docType = ref<BillDocType>('01');
const documentNumber = ref('');
const authorization = ref('');
const issueDate = ref(todayIso());
const dueDate = ref(todayIso());
const currencyCode = ref('USD');
const notes = ref('');
const orderId = ref<string | null>(null);
const supplierTotal = ref('');
const lines = ref<LineRow[]>([emptyLine()]);
const loadedFromOrder = ref(false);
const nothingToBill = ref(false);

const DOC_PATTERN = /^\d{3}-\d{3}-\d{9}$/;
const AUTH_PATTERN = /^\d{10,49}$/;
const PCT_PATTERN = /^\d+(\.\d{1,2})?$/;
const DOC_TYPES: BillDocType[] = ['01', '03', '41'];
/** Solo se factura contra una orden aprobada (aunque sea en parte) o ya cerrada: lo recibido puede facturarse después. */
const BILLABLE_STATUSES: OrderStatus[] = ['approved', 'partially_received', 'received', 'closed'];

const supplierItems = computed(() => store.suppliers.filter((s) => s.status === 'active').map((s) => ({ value: s.id, title: `${s.legalName} · ${s.identification}` })));
const docTypeItems = computed(() => DOC_TYPES.map((value) => ({ value, title: t(`purchasing.bills.docTypes.${value}`) })));
const orderItems = computed(() => store.orders.filter((o) => BILLABLE_STATUSES.includes(o.status)).map((o) => ({ value: o.id, title: o.number ?? t('purchasing.orders.draft') })));
/** El porcentaje de IVA es texto libre (el del documento): se ofrecen los que la organización tiene definidos. */
const taxPctItems = computed(() => [...new Set(productStore.taxRates.filter((r) => r.kind === 'vat').map((r) => String(r.percentage)))]);

// ── Importes ────────────────────────────────────────────────────────────────
const asCents = (text: string): number | null => toCents(text.trim().replace(',', '.'));
const money = (cents: number) => formatMoney(cents, locale.value, currencyCode.value);

/** `null` si la línea todavía no es calculable (cantidad, costo, descuento o IVA inválidos). */
function rowAmounts(row: LineRow): LineAmounts | null {
  if (!PCT_PATTERN.test(row.taxRatePct.trim())) return null;
  return lineAmounts({
    quantity: row.quantity,
    unitCostCents: asCents(row.unitCost),
    discountCents: asCents(row.discount || '0') ?? -1,
    taxPercent: row.taxRatePct,
  });
}

function autoTaxCents(row: LineRow): number {
  return rowAmounts(row)?.taxCents ?? 0;
}

function rowTaxCents(row: LineRow): number {
  if (row.taxCentsManual === null) return autoTaxCents(row);
  return asCents(row.taxCentsManual) ?? 0;
}

function rowTotalCents(row: LineRow): number {
  const amounts = rowAmounts(row);
  return amounts ? amounts.subtotalCents + rowTaxCents(row) : 0;
}

const totals = computed(() => {
  let subtotalCents = 0;
  let taxCents = 0;
  for (const row of lines.value) {
    subtotalCents += rowAmounts(row)?.subtotalCents ?? 0;
    taxCents += rowTaxCents(row);
  }
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
});

/** Al escribir en el IVA de una línea, el importe queda a mano; si se vacía, vuelve a calcularse desde el porcentaje. */
function onTaxInput(row: LineRow, value: string): void {
  row.taxCentsManual = value ? value : null;
}

// ── Catálogos y datos ───────────────────────────────────────────────────────
const documentValid = computed(() => DOC_PATTERN.test(documentNumber.value.trim()));
const authValid = computed(() => authorization.value.trim() === '' || AUTH_PATTERN.test(authorization.value.trim()));
const supplierTotalValid = computed(() => supplierTotal.value.trim() === '' || asCents(supplierTotal.value) !== null);
const rowValid = (row: LineRow) => row.description.trim().length > 0 && rowAmounts(row) !== null && (row.taxCentsManual === null || asCents(row.taxCentsManual) !== null);

/** Facturar sin orden salta la conciliación a tres vías: el servidor exige `purchase_bill:create_unmatched` (solo
 *  Administrador) y aquí se refleja para no dejar guardar un borrador que va a volver con un 403. */
const canBillWithoutOrder = computed(() => auth.can('purchase_bill:create_unmatched'));

const canSave = computed(
  () =>
    supplierId.value !== null &&
    documentValid.value &&
    authValid.value &&
    supplierTotalValid.value &&
    issueDate.value !== '' &&
    dueDate.value !== '' &&
    (orderId.value !== null || canBillWithoutOrder.value) &&
    lines.value.length > 0 &&
    lines.value.every(rowValid),
);

async function loadOrders(): Promise<void> {
  if (!supplierId.value) return;
  await store.fetchOrders({ supplierId: supplierId.value, pageSize: 100 });
}

async function onSupplierChange(id: string | null): Promise<void> {
  supplierId.value = id;
  orderId.value = null;
  loadedFromOrder.value = false;
  nothingToBill.value = false;
  if (id) await loadOrders();
}

function onOrderChange(value: string | null): void {
  orderId.value = value;
  void loadFromOrder();
}

/** Precarga las líneas con lo recibido y todavía no facturado de la orden, a su costo y con su IVA. */
async function loadFromOrder(): Promise<void> {
  loadedFromOrder.value = false;
  nothingToBill.value = false;
  if (!orderId.value) return;
  await Promise.all([store.fetchOrder(orderId.value), store.fetchReceiving(orderId.value)]);
  const order = store.current;
  const tracking = store.receiving;
  if (!order?.lines || !tracking) return;
  const byLine = new Map(tracking.lines.map((l) => [l.lineId, l]));
  const rows: LineRow[] = [];
  for (const line of order.lines) {
    const pending = toBillQuantity(byLine.get(line.id)?.received ?? '0', byLine.get(line.id)?.billed ?? '0');
    if ((parseQuantityMicros(pending) ?? 0n) === 0n) continue;
    rows.push({
      key: nextKey++,
      orderLineId: line.id,
      productId: line.productId,
      description: line.description,
      quantity: pending,
      unitCost: fromCents(line.unitCostCents),
      discount: '0',
      taxRatePct: line.taxPercent,
      taxCentsManual: null,
      expenseAccountHint: '',
    });
  }
  if (rows.length === 0) {
    nothingToBill.value = true;
    return;
  }
  lines.value = rows;
  loadedFromOrder.value = true;
}

function buildInput(): BillInput {
  const [establishment, emissionPoint, sequential] = documentNumber.value.trim().split('-');
  const input: BillInput = {
    supplierId: supplierId.value!,
    purchaseOrderId: orderId.value,
    docType: docType.value,
    establishment: establishment!,
    emissionPoint: emissionPoint!,
    sequential: sequential!,
    authorizationNumber: authorization.value.trim() || null,
    issueDate: issueDate.value,
    dueDate: dueDate.value,
    currencyCode: currencyCode.value,
    notes: notes.value.trim() || null,
    lines: lines.value.map((row) => ({
      orderLineId: row.orderLineId,
      productId: row.productId,
      description: row.description.trim(),
      quantity: row.quantity.trim().replace(',', '.'),
      unitCostCents: asCents(row.unitCost)!,
      discountCents: asCents(row.discount || '0') ?? 0,
      // Se manda el importe tal como se ve: si el proveedor redondeó distinto, es ese el que va.
      taxRatePct: row.taxRatePct.trim().replace(',', '.'),
      taxCents: rowTaxCents(row),
      expenseAccountHint: row.orderLineId ? null : row.expenseAccountHint.trim() || null,
    })),
  };
  const total = supplierTotal.value.trim() ? asCents(supplierTotal.value) : null;
  if (total !== null) input.supplierTotalCents = total;
  return input;
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  formError.value = null;
  try {
    const bill = await store.saveBill(billId.value, buildInput());
    await router.push({ name: 'purchasing-bill', params: { id: bill.id } });
  } catch {
    formError.value = store.error;
  }
}

onMounted(async () => {
  store.error = null;
  await Promise.all([store.fetchSuppliers({ status: 'active' }), productStore.fetchCatalog()]);

  if (billId.value) {
    await store.fetchBill(billId.value);
    const bill = store.currentBill;
    if (!bill) {
      loadError.value = store.error;
      return;
    }
    if (bill.status !== 'draft' && bill.status !== 'blocked') {
      loadError.value = 'purchasing.bills.onlyDraft';
      return;
    }
    supplierId.value = bill.supplierId;
    docType.value = bill.docType;
    documentNumber.value = `${bill.establishment}-${bill.emissionPoint}-${bill.sequential}`;
    authorization.value = bill.authorizationNumber ?? '';
    issueDate.value = bill.issueDate;
    dueDate.value = bill.dueDate;
    currencyCode.value = bill.currencyCode;
    notes.value = bill.notes ?? '';
    orderId.value = bill.purchaseOrderId;
    supplierTotal.value = bill.supplierTotalCents != null ? fromCents(bill.supplierTotalCents) : '';
    lines.value = bill.lines.map((l) => ({
      key: nextKey++,
      orderLineId: l.orderLineId,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitCost: fromCents(l.unitCostCents),
      discount: fromCents(l.discountCents),
      taxRatePct: l.taxRatePct,
      // Ya calculado por el servidor: editar no debe recalcular lo que dice el documento del proveedor.
      taxCentsManual: fromCents(l.taxCents),
      expenseAccountHint: l.expenseAccountHint ?? '',
    }));
    await loadOrders();
    return;
  }

  const fromOrder = route.query.order;
  if (typeof fromOrder === 'string' && fromOrder) {
    await store.fetchOrder(fromOrder);
    const order = store.current;
    if (order) {
      supplierId.value = order.supplierId;
      orderId.value = order.id;
      await loadOrders();
      await loadFromOrder();
    }
  }
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t(billId ? 'purchasing.bills.edit' : 'purchasing.bills.new')" />
    <PurchasingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError.startsWith('purchasing.') ? $t(loadError) : loadError }}</v-alert>
    <v-alert v-if="formError" type="error" closable class="mb-4" @click:close="formError = null">{{ formError }}</v-alert>

    <v-form v-if="!loadError" @submit.prevent="save">
      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.bills.header') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <v-autocomplete :model-value="supplierId" :items="supplierItems" :label="$t('purchasing.orders.supplier')" @update:model-value="onSupplierChange" />
            </v-col>
            <v-col cols="12" sm="6" md="2">
              <v-select v-model="docType" :items="docTypeItems" :label="$t('purchasing.bills.docType')" />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="documentNumber"
                :label="$t('purchasing.bills.supplierDocument')"
                :error-messages="documentNumber && !documentValid ? $t('purchasing.bills.invalidDocument') : undefined"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field v-model="authorization" :label="$t('purchasing.bills.authorization')" maxlength="49" />
            </v-col>
            <v-col cols="12" sm="4" md="2">
              <v-text-field v-model="issueDate" type="date" :label="$t('purchasing.bills.issueDate')" />
            </v-col>
            <v-col cols="12" sm="4" md="2">
              <v-text-field v-model="dueDate" type="date" :min="issueDate" :label="$t('purchasing.bills.dueDate')" />
            </v-col>
            <v-col cols="12" sm="4" md="2">
              <v-select v-model="currencyCode" :items="['USD', 'EUR', 'COP', 'PEN', 'MXN']" :label="$t('products.currency')" />
            </v-col>
            <v-col cols="12" md="3">
              <v-select :model-value="orderId" :items="orderItems" :label="$t('purchasing.bills.order')" clearable @update:model-value="onOrderChange" />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                v-model="supplierTotal"
                :label="$t('purchasing.bills.supplierTotal')"
                :hint="$t('purchasing.bills.supplierTotalHint')"
                persistent-hint
                inputmode="decimal"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="notes" :label="$t('common.notes')" rows="2" auto-grow maxlength="1000" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-alert v-if="nothingToBill" type="warning" class="mb-4">{{ $t('purchasing.bills.nothingToBill') }}</v-alert>
      <v-alert v-else-if="loadedFromOrder" type="info" class="mb-4">{{ $t('purchasing.bills.loadFromOrder') }}</v-alert>
      <v-alert v-else-if="!orderId && !canBillWithoutOrder" type="warning" class="mb-4">{{ $t('purchasing.bills.noOrderForbidden') }}</v-alert>
      <v-alert v-else-if="!orderId" type="info" class="mb-4">{{ $t('purchasing.bills.noOrderHint') }}</v-alert>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('purchasing.bills.lines') }}</v-card-title>
        <v-card-text>
          <v-sheet v-for="(row, i) in lines" :key="row.key" color="grey100" rounded="lg" class="pa-4 mb-4">
            <v-row class="align-start">
              <v-col cols="12" :md="row.orderLineId ? 12 : 8">
                <v-text-field v-model="row.description" :label="$t('common.description')" maxlength="300" />
              </v-col>
              <v-col v-if="!row.orderLineId" cols="12" md="4">
                <v-text-field
                  v-model="row.expenseAccountHint"
                  :label="$t('purchasing.bills.expenseHint')"
                  :hint="$t('purchasing.bills.expenseHintHelp')"
                  persistent-hint
                />
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="row.quantity" :label="$t('invoices.quantity')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="row.unitCost" :label="$t('purchasing.bills.unitCost')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="row.discount" :label="$t('invoices.discount')" inputmode="decimal" />
              </v-col>
              <v-col cols="6" md="2">
                <v-combobox v-model="row.taxRatePct" :items="taxPctItems" :label="$t('purchasing.bills.taxPct')" />
              </v-col>
              <v-col cols="6" md="1">
                <v-text-field
                  :model-value="row.taxCentsManual ?? fromCents(autoTaxCents(row))"
                  :label="$t('invoices.taxTotal')"
                  inputmode="decimal"
                  :append-inner-icon="row.taxCentsManual !== null ? 'mdi-restore' : undefined"
                  @click:append-inner="row.taxCentsManual = null"
                  @update:model-value="onTaxInput(row, $event)"
                />
              </v-col>
              <v-col cols="6" md="1" class="d-flex align-center justify-space-between ga-2">
                <span class="text-body-2">{{ rowAmounts(row) ? money(rowTotalCents(row)) : '—' }}</span>
                <v-btn icon="mdi-close" variant="text" :aria-label="$t('common.delete')" :disabled="lines.length === 1" @click="lines.splice(i, 1)" />
              </v-col>
            </v-row>
          </v-sheet>
          <v-btn variant="text" color="primary" prepend-icon="mdi-plus" :disabled="lines.length >= 200" @click="lines.push(emptyLine())">
            {{ $t('purchasing.bills.addLine') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-text class="d-flex flex-column align-end ga-2">
          <div>{{ $t('invoices.subtotal') }}: {{ money(totals.subtotalCents) }}</div>
          <div>{{ $t('invoices.taxTotal') }}: {{ money(totals.taxCents) }}</div>
          <div class="text-h6">{{ $t('invoices.total') }}: {{ money(totals.totalCents) }}</div>
        </v-card-text>
      </v-card>

      <div class="d-flex justify-end flex-wrap ga-2">
        <v-btn variant="text" @click="router.push(billId ? { name: 'purchasing-bill', params: { id: billId } } : { name: 'purchasing-bills' })">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="store.saving" :disabled="!canSave" @click="save">{{ $t('purchasing.bills.saveDraft') }}</v-btn>
      </div>
    </v-form>
  </v-container>
</template>

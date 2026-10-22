<script setup lang="ts">
/**
 * Registrar un pago a un proveedor (o editar un borrador). Se elige el proveedor y salen sus facturas abiertas con su saldo NETO (ya
 * descontada la retención): lo que se paga se reparte por vencimiento (la persona lo puede cambiar fila por fila). Lo pagado de más no se
 * rechaza: queda como ANTICIPO a proveedores, que un pago posterior puede consumir. La igualdad que el servidor también exige:
 *     salió + anticipos usados = aplicado a facturas + excedente
 * «Pagar» guarda y contabiliza (asigna el número, baja la deuda y genera el asiento); «Guardar borrador» solo guarda. Si la organización
 * definió un umbral de aprobación y este pago lo alcanza, «Pagar» deja el borrador guardado y avisa que falta la aprobación de otra persona.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryPayablesStore } from '@/stores/treasuryPayables';
import { purchasingApi } from '@/api/purchasing';
import { centsToInput, formatMoney } from '@/utils/accounting';
import { allocateOldestFirst } from '@/utils/treasury';
import {
  buildPaymentInput,
  defaultPaymentAccountRole,
  isPayableOverdue,
  paymentMethodNeedsReference,
  paymentPreview,
  payableDaysOverdue,
  type PaymentForm,
} from '@/utils/treasury-payments';
import { PAYMENT_METHODS, type Payable, type SupplierAdvance } from '@/types/treasury';
import type { Supplier } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useTreasuryPayablesStore();

const paymentId = computed(() => (route.params.id as string | undefined) ?? null);
const today = () => new Date().toLocaleDateString('en-CA');

const form = ref<PaymentForm>({
  supplierId: (route.query.supplierId as string | undefined) ?? null,
  paymentDate: today(),
  method: 'transfer',
  accountRole: null,
  reference: '',
  notes: '',
  cash: '',
  rows: [],
  advances: [],
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const tried = ref(false);
const suppliers = ref<Supplier[]>([]);
/** Mientras la persona no cambie una fila a mano, lo pagado se reparte solo por vencimiento. */
const autoAllocate = ref(true);
const editingVersion = ref<number | null>(null);

const statement = computed(() => store.statement);
const payables = computed<Payable[]>(() => (statement.value?.payables ?? []).filter((p) => (p.status === 'open' || p.status === 'partial') && p.balanceCents > 0));
const advancesAvailable = computed<SupplierAdvance[]>(() => (statement.value?.advances ?? []).filter((a) => a.balanceCents > 0));
const balances = computed(() => Object.fromEntries(payables.value.map((p) => [p.id, p.balanceCents])));
const available = computed(() => Object.fromEntries(advancesAvailable.value.map((a) => [a.id, a.balanceCents])));
const preview = computed(() => paymentPreview(form.value));
const money = (cents: number) => formatMoney(cents, locale.value);
/** Sin permiso de ver proveedores el selector ofrece a los que tienen deuda: son los únicos a los que hay algo que aplicar. */
const supplierItems = computed(() =>
  suppliers.value.length > 0
    ? suppliers.value.map((s) => ({ value: s.id, title: s.identification ? `${s.legalName} · ${s.identification}` : s.legalName }))
    : (store.aging?.suppliers ?? []).map((s) => ({ value: s.supplierId, title: s.supplierName })),
);
const methodItems = computed(() => PAYMENT_METHODS.map((value) => ({ value, title: t(`treasury.payments.methods.${value}`) })));
const accountItems = computed(() => (['cash', 'bank'] as const).map((value) => ({ value, title: t(`treasury.payments.accounts.${value}`) })));
const err = (key: string) => (errors.value[key] ? t(errors.value[key]!) : undefined);
const isEditing = computed(() => paymentId.value !== null);
const overdue = (p: Payable) => (statement.value && isPayableOverdue(p, statement.value.asOf) ? payableDaysOverdue(p.dueDate, statement.value.asOf) : 0);

onMounted(async () => {
  suppliers.value = (await purchasingApi.listSuppliers({ status: 'active', pageSize: 100 }).then((r) => r.items).catch(() => [])) as Supplier[];
  if (suppliers.value.length === 0 && auth.can('payable:read')) await store.fetchAging();
  if (paymentId.value) {
    await store.fetchPayment(paymentId.value);
    const p = store.currentPayment;
    if (!p) return;
    if (p.status !== 'draft' && p.status !== 'approved') return void router.replace({ name: 'treasury-payment', params: { id: p.id } });
    editingVersion.value = p.version;
    form.value = {
      supplierId: p.supplierId,
      paymentDate: p.paymentDate,
      method: p.method,
      accountRole: p.accountRole === defaultPaymentAccountRole(p.method) ? null : p.accountRole,
      reference: p.reference ?? '',
      notes: p.notes ?? '',
      cash: centsToInput(p.totalCents),
      rows: [],
      advances: [],
    };
    await loadSupplier(p.supplierId);
    // Las líneas del borrador mandan sobre el reparto automático.
    autoAllocate.value = false;
    for (const row of form.value.rows) {
      const line = p.lines.find((l) => l.payableId === row.payableId);
      if (line) row.apply = centsToInput(line.appliedCents);
    }
    for (const adv of form.value.advances) {
      const use = p.advanceUses.find((u) => u.advanceId === adv.advanceId);
      if (use) adv.use = centsToInput(use.usedCents);
    }
  } else if (form.value.supplierId) {
    await loadSupplier(form.value.supplierId);
  }
});

async function loadSupplier(supplierId: string): Promise<void> {
  await store.fetchSupplier(supplierId);
  form.value.rows = payables.value.map((p) => ({ payableId: p.id, apply: '' }));
  form.value.advances = advancesAvailable.value.map((a) => ({ advanceId: a.id, use: '' }));
  if (autoAllocate.value) distribute();
}

watch(
  () => form.value.supplierId,
  (id, old) => {
    if (id && id !== old && !isEditing.value) {
      autoAllocate.value = true;
      void loadSupplier(id);
    }
  },
);

/** Reparte lo que se paga (más los anticipos que se consumen) por vencimiento. */
function distribute(): void {
  const total = preview.value.cash + preview.value.advanceUsed;
  // Las deudas tienen la misma forma que las partidas de cartera para el reparto: id, vencimiento, emisión, saldo y estado.
  const plan = allocateOldestFirst(payables.value.map((p) => ({ id: p.id, dueDate: p.dueDate, issueDate: p.issueDate, balanceCents: p.balanceCents, status: p.status as 'open' | 'partial' })), total);
  for (const row of form.value.rows) row.apply = plan[row.payableId] ? centsToInput(plan[row.payableId]!) : '';
}
watch(() => [form.value.cash, form.value.advances.map((a) => a.use).join('|')], () => { if (autoAllocate.value) distribute(); });
function manual(): void {
  autoAllocate.value = false;
}
function fillRow(row: { payableId: string; apply: string }): void {
  manual();
  row.apply = centsToInput(balances.value[row.payableId] ?? 0);
}
function redistribute(): void {
  autoAllocate.value = true;
  distribute();
}
function onMethod(): void {
  // El rol vuelve al del medio de pago salvo que la persona haya elegido otro a mano.
  if (form.value.accountRole === defaultPaymentAccountRole(form.value.method)) form.value.accountRole = null;
}

const defaultRole = computed(() => defaultPaymentAccountRole(form.value.method));
const roleModel = computed({
  get: () => form.value.accountRole ?? defaultRole.value,
  set: (v) => { form.value.accountRole = v === defaultRole.value ? null : v; },
});

watch(form, () => { if (tried.value) errors.value = buildPaymentInput(form.value, { balances: balances.value, available: available.value }).errors; }, { deep: true });

async function submit(andPost: boolean): Promise<void> {
  serverError.value = null;
  tried.value = true;
  const result = buildPaymentInput(form.value, { balances: balances.value, available: available.value });
  errors.value = result.errors;
  if (!result.input) return;
  let savedId: string | null = null;
  try {
    // Al editar, el proveedor no cambia (no viaja) y se manda la versión que se leyó: si otra persona tocó el borrador, el servidor lo dice.
    const { supplierId: _fixed, ...changes } = result.input;
    const saved = paymentId.value
      ? await store.savePayment(paymentId.value, { ...changes, expectedVersion: editingVersion.value ?? undefined })
      : await store.savePayment(null, result.input);
    savedId = saved.id;
    const final = andPost ? await store.postPayment(saved.id) : saved;
    await router.push({ name: 'treasury-payment', params: { id: final.id } });
  } catch {
    // El borrador ya quedó guardado: si lo que falló fue contabilizar por falta de aprobación, se lleva a la persona al pago para que lo vea.
    if (savedId && /aprob|approv/i.test(store.error ?? '')) {
      await router.push({ name: 'treasury-payment', params: { id: savedId }, query: { approval: '1' } });
      return;
    }
    serverError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t(isEditing ? 'treasury.payments.formEditIntro' : 'treasury.payments.formIntro')" />
    <TreasuryTabs />

    <v-alert v-if="serverError" type="error" closable class="mb-4" @click:close="serverError = null">{{ serverError }}</v-alert>

    <v-card class="mb-4">
      <v-card-text>
        <v-row>
          <v-col cols="12" md="5">
            <v-autocomplete v-model="form.supplierId" :items="supplierItems" :label="$t('treasury.payments.supplier')" :disabled="isEditing" :error-messages="err('supplierId')" />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model="form.paymentDate" type="date" :label="$t('treasury.payments.date')" :error-messages="err('paymentDate')" />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field v-model="form.cash" :label="$t('treasury.payments.paid')" :hint="$t('treasury.payments.paidHint')" persistent-hint inputmode="decimal" :error-messages="err('cash')" />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="form.method" :items="methodItems" :label="$t('treasury.payments.method')" @update:model-value="onMethod" />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="roleModel" :items="accountItems" :label="$t('treasury.payments.account')" :hint="$t('treasury.payments.accountHint')" persistent-hint />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="form.reference"
              :label="$t('treasury.payments.reference')"
              :hint="paymentMethodNeedsReference(form.method) ? $t('treasury.payments.referenceRequired') : undefined"
              persistent-hint
              maxlength="100"
              :error-messages="err('reference')"
            />
          </v-col>
          <v-col cols="12">
            <v-text-field v-model="form.notes" :label="$t('treasury.payments.notes')" maxlength="500" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="form.supplierId" class="mb-4">
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.payments.applyTo') }}
        <v-spacer />
        <v-btn variant="tonal" size="small" prepend-icon="mdi-sort-calendar-ascending" :disabled="autoAllocate" @click="redistribute">{{ $t('treasury.payments.distribute') }}</v-btn>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="errors.lines" type="error" class="mb-2">{{ err('lines') }}</v-alert>
        <div v-if="payables.length === 0" class="text-medium-emphasis">{{ $t('treasury.payments.noDebts') }}</div>
        <v-row v-for="(row, index) in form.rows" :key="row.payableId" class="align-center">
          <v-col cols="12" md="5">
            <div>{{ payables[index]?.documentNumber ?? payables[index]?.internalNumber ?? $t(`treasury.payables.source.${payables[index]?.sourceType ?? 'purchase_bill'}`) }}</div>
            <div class="text-body-2 text-medium-emphasis">
              {{ $t('treasury.payments.dueOn', { date: payables[index]?.dueDate }) }}
              <v-chip v-if="payables[index] && overdue(payables[index]!) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">{{ $t('treasury.payables.overdueDays', { n: overdue(payables[index]!) }) }}</v-chip>
            </div>
          </v-col>
          <v-col cols="4" md="2" class="text-end">
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payables.balance') }}</div>
            {{ money(payables[index]?.balanceCents ?? 0) }}
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model="row.apply" :label="$t('treasury.payments.apply')" inputmode="decimal" :error-messages="err(`rows[${index}].apply`)" @update:model-value="manual" />
          </v-col>
          <v-col cols="2" md="2">
            <v-btn variant="text" size="small" @click="fillRow(row)">{{ $t('treasury.payments.all') }}</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="advancesAvailable.length > 0" class="mb-4">
      <v-card-title class="text-h6">{{ $t('treasury.payments.useAdvances') }}</v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-2">{{ $t('treasury.payments.useAdvancesHint') }}</div>
        <v-row v-for="(adv, index) in form.advances" :key="adv.advanceId" class="align-center">
          <v-col cols="12" md="6">
            <div>{{ advancesAvailable[index]?.documentNumber ?? '—' }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.advanceAvailable', { amount: money(advancesAvailable[index]?.balanceCents ?? 0) }) }}</div>
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field v-model="adv.use" :label="$t('treasury.payments.useAmount')" inputmode="decimal" :error-messages="err(`advances[${index}].use`)" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text>
        <div class="d-flex flex-wrap ga-6">
          <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.paid') }}</div><div class="text-h6">{{ money(preview.cash) }}</div></div>
          <div v-if="preview.advanceUsed > 0"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.advanceUsed') }}</div><div class="text-h6">{{ money(preview.advanceUsed) }}</div></div>
          <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.applied') }}</div><div class="text-h6">{{ money(preview.applied) }}</div></div>
          <div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.payments.excess') }}</div>
            <div class="text-h6" :class="preview.excess < 0 ? 'text-error' : undefined">{{ money(preview.excess) }}</div>
          </div>
        </div>
        <div v-if="preview.excess > 0" class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.payments.excessHint') }}</div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn variant="text" :to="{ name: 'treasury-payments' }">{{ $t('common.cancel') }}</v-btn>
        <v-spacer />
        <v-btn variant="tonal" :loading="store.saving" @click="submit(false)">{{ $t('treasury.payments.saveDraft') }}</v-btn>
        <v-btn color="primary" prepend-icon="mdi-cash-check" :loading="store.saving" @click="submit(true)">{{ $t('treasury.payments.pay') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

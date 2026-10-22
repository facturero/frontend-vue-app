<script setup lang="ts">
/**
 * Registrar un cobro (o editar un borrador). Se elige el cliente y salen sus deudas abiertas: lo que se cobra se reparte por antigüedad
 * (la persona lo puede cambiar fila por fila). Lo cobrado de más que las deudas no se rechaza: queda como ANTICIPO del cliente, y un
 * cobro posterior puede consumirlo. La igualdad que el servidor también exige:
 *     entró + anticipos usados = aplicado a deudas + excedente
 * «Cobrar» guarda y contabiliza (asigna el número, baja la deuda y genera el asiento); «Guardar borrador» solo guarda.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryBankingStore } from '@/stores/treasuryBanking';
import { useTreasuryStore } from '@/stores/treasury';
import { customerApi } from '@/api/customers';
import { centsToInput, formatMoney } from '@/utils/accounting';
import {
  allocateOldestFirst,
  buildReceiptInput,
  defaultAccountRole,
  daysOverdue,
  methodNeedsReference,
  receiptPreview,
  type ReceiptForm,
} from '@/utils/treasury';
import { RECEIPT_METHODS, type CustomerAdvance, type Receivable } from '@/types/treasury';
import type { Customer } from '@/types/customers';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const bank = useTreasuryBankingStore();
const store = useTreasuryStore();

const receiptId = computed(() => (route.params.id as string | undefined) ?? null);
const today = () => new Date().toLocaleDateString('en-CA');

const form = ref<ReceiptForm>({
  customerId: (route.query.customerId as string | undefined) ?? null,
  receiptDate: today(),
  method: 'cash',
  accountRole: null,
  bankAccountId: null,
  reference: '',
  notes: '',
  cash: '',
  rows: [],
  advances: [],
});
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const tried = ref(false);
const customers = ref<Customer[]>([]);
/** Mientras la persona no cambie una fila a mano, lo cobrado se reparte solo por antigüedad. */
const autoAllocate = ref(true);
const editingVersion = ref<number | null>(null);

const statement = computed(() => store.statement);
const receivables = computed<Receivable[]>(() => (statement.value?.receivables ?? []).filter((r) => (r.status === 'open' || r.status === 'partial') && r.balanceCents > 0));
/** Solo los anticipos de COBROS se consumen aquí (el saldo de una nota de crédito vive en cuentas por cobrar y se aplica solo). */
const advancesAvailable = computed<CustomerAdvance[]>(() => (statement.value?.advances ?? []).filter((a) => a.origin === 'receipt' && a.balanceCents > 0));
const balances = computed(() => Object.fromEntries(receivables.value.map((r) => [r.id, r.balanceCents])));
const available = computed(() => Object.fromEntries(advancesAvailable.value.map((a) => [a.id, a.balanceCents])));
const preview = computed(() => receiptPreview(form.value));
const money = (cents: number) => formatMoney(cents, locale.value);
/** Sin permiso de ver clientes (el Contador no lo tiene) el selector ofrece a quienes tienen deuda: son los únicos a los que hay algo que aplicar. */
const customerItems = computed(() =>
  customers.value.length > 0
    ? customers.value.map((c) => ({ value: c.id, title: c.identification ? `${c.businessName} · ${c.identification}` : c.businessName }))
    : (store.aging?.customers ?? []).map((c) => ({ value: c.customerId, title: c.customerName })),
);
const methodItems = computed(() => RECEIPT_METHODS.map((value) => ({ value, title: t(`treasury.receipts.methods.${value}`) })));
const accountItems = computed(() => (['cash', 'bank'] as const).map((value) => ({ value, title: t(`treasury.receipts.accounts.${value}`) })));
const err = (key: string) => (errors.value[key] ? t(errors.value[key]!) : undefined);
const isEditing = computed(() => receiptId.value !== null);
const overdue = (r: Receivable) => (statement.value ? Math.max(0, daysOverdue(r.dueDate, statement.value.asOf)) : 0);

onMounted(async () => {
  if (auth.can('bank_account:read')) {
    await bank.fetchAccounts(true);
    // Con una sola cuenta activa y un documento nuevo, se elige sola: lo normal es que sea esa.
    const active = bank.accounts.filter((a) => a.isActive);
    if (active.length === 1 && !form.value.bankAccountId) form.value.bankAccountId = active[0]!.id;
  }
  customers.value = await customerApi.list({ status: 'active' }).catch(() => []);
  if (customers.value.length === 0 && auth.can('receivable:read')) await store.fetchAging();
  if (receiptId.value) {
    await store.fetchReceipt(receiptId.value);
    const r = store.currentReceipt;
    if (!r) return;
    if (r.status !== 'draft') return void router.replace({ name: 'treasury-receipt', params: { id: r.id } });
    editingVersion.value = r.version;
    form.value = {
      customerId: r.customerId,
      receiptDate: r.receiptDate,
      method: r.method,
      accountRole: r.accountRole === defaultAccountRole(r.method) ? null : r.accountRole,
      bankAccountId: r.bankAccountId,
      reference: r.reference ?? '',
      notes: r.notes ?? '',
      cash: centsToInput(r.totalCents),
      rows: [],
      advances: [],
    };
    await loadCustomer(r.customerId);
    // Las líneas del borrador mandan sobre el reparto automático.
    autoAllocate.value = false;
    for (const row of form.value.rows) {
      const line = r.lines.find((l) => l.receivableId === row.receivableId);
      if (line) row.apply = centsToInput(line.appliedCents);
    }
    for (const adv of form.value.advances) {
      const use = r.advanceUses.find((u) => u.advanceId === adv.advanceId);
      if (use) adv.use = centsToInput(use.usedCents);
    }
  } else if (form.value.customerId) {
    await loadCustomer(form.value.customerId);
  }
});

async function loadCustomer(customerId: string): Promise<void> {
  await store.fetchCustomer(customerId);
  form.value.rows = receivables.value.map((r) => ({ receivableId: r.id, apply: '' }));
  form.value.advances = advancesAvailable.value.map((a) => ({ advanceId: a.id, use: '' }));
  if (autoAllocate.value) distribute();
}

watch(
  () => form.value.customerId,
  (id, old) => {
    if (id && id !== old && !isEditing.value) {
      autoAllocate.value = true;
      void loadCustomer(id);
    }
  },
);

/** Reparte lo que se cobra (más los anticipos que se consumen) por antigüedad. */
function distribute(): void {
  const total = preview.value.cash + preview.value.advanceUsed;
  const plan = allocateOldestFirst(receivables.value, total);
  for (const row of form.value.rows) row.apply = plan[row.receivableId] ? centsToInput(plan[row.receivableId]!) : '';
}
watch(() => [form.value.cash, form.value.advances.map((a) => a.use).join('|')], () => { if (autoAllocate.value) distribute(); });
function manual(): void {
  autoAllocate.value = false;
}
function fillRow(row: { receivableId: string; apply: string }): void {
  manual();
  row.apply = centsToInput(balances.value[row.receivableId] ?? 0);
}
function redistribute(): void {
  autoAllocate.value = true;
  distribute();
}
function onMethod(): void {
  // El rol vuelve al del medio de cobro salvo que la persona haya elegido otro a mano.
  if (form.value.accountRole === defaultAccountRole(form.value.method)) form.value.accountRole = null;
}

/** Solo quien puede ver bancos ofrece la cuenta; sin cuentas activas el movimiento queda «sin asignar» y se asigna después. */
const bankItems = computed(() => bank.accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, title: a.accountLast4 ? `${a.name} · ••${a.accountLast4}` : a.name })));

const defaultRole = computed(() => defaultAccountRole(form.value.method));
const roleModel = computed({
  get: () => form.value.accountRole ?? defaultRole.value,
  set: (v) => { form.value.accountRole = v === defaultRole.value ? null : v; },
});
// Si el dinero deja de pasar por bancos, la cuenta bancaria elegida ya no aplica.
watch(() => roleModel.value, (role) => { if (role !== 'bank') form.value.bankAccountId = null; });

watch(form, () => { if (tried.value) errors.value = buildReceiptInput(form.value, { balances: balances.value, available: available.value }).errors; }, { deep: true });

async function submit(andPost: boolean): Promise<void> {
  serverError.value = null;
  tried.value = true;
  const result = buildReceiptInput(form.value, { balances: balances.value, available: available.value });
  errors.value = result.errors;
  if (!result.input) return;
  try {
    // Al editar, el cliente no cambia (no viaja) y se manda la versión que se leyó: si otra persona tocó el borrador, el servidor lo dice.
    const { customerId: _fixed, ...changes } = result.input;
    const saved = receiptId.value
      ? await store.saveReceipt(receiptId.value, { ...changes, expectedVersion: editingVersion.value ?? undefined })
      : await store.saveReceipt(null, result.input);
    const final = andPost ? await store.postReceipt(saved.id) : saved;
    await router.push({ name: 'treasury-receipt', params: { id: final.id } });
  } catch {
    serverError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t(isEditing ? 'treasury.receipts.formEditIntro' : 'treasury.receipts.formIntro')" />
    <TreasuryTabs />

    <v-alert v-if="serverError" type="error" closable class="mb-4" @click:close="serverError = null">{{ serverError }}</v-alert>

    <v-card class="mb-4">
      <v-card-text>
        <v-row>
          <v-col cols="12" md="5">
            <v-autocomplete v-model="form.customerId" :items="customerItems" :label="$t('treasury.receipts.customer')" :disabled="isEditing" :error-messages="err('customerId')" />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model="form.receiptDate" type="date" :label="$t('treasury.receipts.date')" :error-messages="err('receiptDate')" />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field v-model="form.cash" :label="$t('treasury.receipts.received')" :hint="$t('treasury.receipts.receivedHint')" persistent-hint inputmode="decimal" :error-messages="err('cash')" />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="form.method" :items="methodItems" :label="$t('treasury.receipts.method')" @update:model-value="onMethod" />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="roleModel" :items="accountItems" :label="$t('treasury.receipts.account')" :hint="$t('treasury.receipts.accountHint')" persistent-hint />
          </v-col>
          <v-col v-if="roleModel === 'bank' && bankItems.length > 0" cols="12" md="6">
            <v-select v-model="form.bankAccountId" :items="bankItems" :label="$t('treasury.banking.accountField')" :hint="$t('treasury.banking.accountFieldHint')" persistent-hint clearable />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="form.reference"
              :label="$t('treasury.receipts.reference')"
              :hint="methodNeedsReference(form.method) ? $t('treasury.receipts.referenceRequired') : undefined"
              persistent-hint
              maxlength="100"
              :error-messages="err('reference')"
            />
          </v-col>
          <v-col cols="12">
            <v-text-field v-model="form.notes" :label="$t('treasury.receipts.notes')" maxlength="500" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="form.customerId" class="mb-4">
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.receipts.applyTo') }}
        <v-spacer />
        <v-btn variant="tonal" size="small" prepend-icon="mdi-sort-calendar-ascending" :disabled="autoAllocate" @click="redistribute">{{ $t('treasury.receipts.distribute') }}</v-btn>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="errors.lines" type="error" class="mb-2">{{ err('lines') }}</v-alert>
        <div v-if="receivables.length === 0" class="text-medium-emphasis">{{ $t('treasury.receipts.noDebts') }}</div>
        <v-row v-for="(row, index) in form.rows" :key="row.receivableId" class="align-center">
          <v-col cols="12" md="5">
            <div>{{ receivables[index]?.documentNumber ?? $t(`treasury.receivables.source.${receivables[index]?.sourceType ?? 'invoice'}`) }}</div>
            <div class="text-body-2 text-medium-emphasis">
              {{ $t('treasury.receipts.dueOn', { date: receivables[index]?.dueDate }) }}
              <v-chip v-if="receivables[index] && overdue(receivables[index]!) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">{{ $t('treasury.receivables.overdueDays', { n: overdue(receivables[index]!) }) }}</v-chip>
            </div>
          </v-col>
          <v-col cols="4" md="2" class="text-end">
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receivables.balance') }}</div>
            {{ money(receivables[index]?.balanceCents ?? 0) }}
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model="row.apply" :label="$t('treasury.receipts.apply')" inputmode="decimal" :error-messages="err(`rows[${index}].apply`)" @update:model-value="manual" />
          </v-col>
          <v-col cols="2" md="2">
            <v-btn variant="text" size="small" @click="fillRow(row)">{{ $t('treasury.receipts.all') }}</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="advancesAvailable.length > 0" class="mb-4">
      <v-card-title class="text-h6">{{ $t('treasury.receipts.useAdvances') }}</v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-2">{{ $t('treasury.receipts.useAdvancesHint') }}</div>
        <v-row v-for="(adv, index) in form.advances" :key="adv.advanceId" class="align-center">
          <v-col cols="12" md="6">
            <div>{{ advancesAvailable[index]?.documentNumber ?? '—' }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.advanceAvailable', { amount: money(advancesAvailable[index]?.balanceCents ?? 0) }) }}</div>
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field v-model="adv.use" :label="$t('treasury.receipts.useAmount')" inputmode="decimal" :error-messages="err(`advances[${index}].use`)" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text>
        <div class="d-flex flex-wrap ga-6">
          <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.received') }}</div><div class="text-h6">{{ money(preview.cash) }}</div></div>
          <div v-if="preview.advanceUsed > 0"><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.advanceUsed') }}</div><div class="text-h6">{{ money(preview.advanceUsed) }}</div></div>
          <div><div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.applied') }}</div><div class="text-h6">{{ money(preview.applied) }}</div></div>
          <div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.receipts.excess') }}</div>
            <div class="text-h6" :class="preview.excess < 0 ? 'text-error' : undefined">{{ money(preview.excess) }}</div>
          </div>
        </div>
        <div v-if="preview.excess > 0" class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.receipts.excessHint') }}</div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn variant="text" :to="{ name: 'treasury-receipts' }">{{ $t('common.cancel') }}</v-btn>
        <v-spacer />
        <v-btn variant="tonal" :loading="store.saving" @click="submit(false)">{{ $t('treasury.receipts.saveDraft') }}</v-btn>
        <v-btn color="primary" prepend-icon="mdi-cash-check" :loading="store.saving" @click="submit(true)">{{ $t('treasury.receipts.charge') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

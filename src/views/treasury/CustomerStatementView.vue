<script setup lang="ts">
/**
 * Estado de cuenta de un cliente: sus partidas, lo que se le ha aplicado y lo que debe. `Neto` (deuda menos saldo a favor) es el número
 * que tiene que cuadrar con las cuentas por cobrar del libro mayor. Las condiciones de crédito (días y cupo) se cambian aquí: los días
 * valen para las facturas que se emitan DESPUÉS; las partidas ya abiertas conservan su vencimiento. El cupo se guarda y se muestra, no
 * bloquea la facturación.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTreasuryStore } from '@/stores/treasury';
import { customerApi } from '@/api/customers';
import { centsToInput, formatMoney } from '@/utils/accounting';
import { creditUsage, daysOverdue, isOverdue, parseCreditDays, parseCreditLimit, RECEIVABLE_STATUS_COLOR } from '@/utils/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useTreasuryStore();

const customerId = computed(() => route.params.id as string);
const canEditTerms = computed(() => auth.can('customer_terms:manage'));
const canCollect = computed(() => auth.can('receipt:create'));
const customerName = ref('');
const snackbar = ref<string | null>(null);

const statement = computed(() => store.statement);
const terms = computed(() => store.terms);
const usage = computed(() => (statement.value ? creditUsage(statement.value.netCents, terms.value?.creditLimitCents ?? null) : null));
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);
const dueChip = (r: { status: 'open' | 'partial' | 'paid' | 'written_off' | 'cancelled'; dueDate: string }) =>
  statement.value && isOverdue(r, statement.value.asOf) ? daysOverdue(r.dueDate, statement.value.asOf) : 0;

onMounted(async () => {
  await store.fetchCustomer(customerId.value);
  // El nombre sale de la partida (copia del evento) o, si no tiene partidas, de las condiciones; si tampoco, del catálogo de clientes.
  customerName.value = statement.value?.receivables[0]?.customerName || terms.value?.customerName || '';
  if (!customerName.value) {
    try {
      customerName.value = (await customerApi.getById(customerId.value)).businessName;
    } catch {
      customerName.value = '';
    }
  }
});

const applicationsOf = (receivableId: string) => statement.value?.applications.filter((a) => a.receivableId === receivableId) ?? [];

const receivableHeaders = computed(() => [
  { title: t('treasury.receivables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.issueDate'), key: 'issueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.dueDate'), key: 'dueDate', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.receivables.balance'), key: 'balanceCents', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
]);
const advanceHeaders = computed(() => [
  { title: t('treasury.receivables.document'), key: 'documentNumber', sortable: false, align: 'start' as const },
  { title: t('treasury.statement.origin'), key: 'origin', sortable: false, align: 'start' as const },
  { title: t('treasury.receivables.original'), key: 'originalCents', sortable: false, align: 'end' as const },
  { title: t('treasury.statement.available'), key: 'balanceCents', sortable: false, align: 'end' as const },
]);

// ── Condiciones de crédito ──
const dialog = ref(false);
const form = ref({ creditDays: '0', creditLimit: '' });
const formError = ref<string | null>(null);

function openTerms(): void {
  form.value = { creditDays: String(terms.value?.creditDays ?? 0), creditLimit: terms.value?.creditLimitCents != null ? centsToInput(terms.value.creditLimitCents) : '' };
  formError.value = null;
  dialog.value = true;
}

const parsedDays = computed(() => parseCreditDays(form.value.creditDays));
const parsedLimit = computed(() => parseCreditLimit(form.value.creditLimit));
const canSave = computed(() => parsedDays.value !== null && parsedLimit.value !== undefined);

async function saveTerms(): Promise<void> {
  if (!canSave.value) return;
  formError.value = null;
  try {
    await store.saveTerms(customerId.value, { creditDays: parsedDays.value!, creditLimitCents: parsedLimit.value ?? null, customerName: customerName.value || null });
    dialog.value = false;
    snackbar.value = t('treasury.statement.termsSaved');
  } catch {
    formError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="customerName || $t('treasury.title')" :subtitle="$t('treasury.statement.intro')">
      <template #actions>
        <v-btn v-if="canCollect" color="primary" prepend-icon="mdi-cash-plus" :to="{ name: 'treasury-receipt-new', query: { customerId } }">{{ $t('treasury.statement.newReceipt') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="store.error && !dialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-row v-if="statement" class="mb-2">
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.owed') }}</div>
            <div class="text-h6">{{ money(statement.receivableCents) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.credit') }}</div>
            <div class="text-h6">{{ money(statement.advanceCents) }}</div>
            <div v-if="statement.customerAdvanceCents > 0" class="text-body-2 text-medium-emphasis">
              {{ $t('treasury.statement.customerAdvances') }}: {{ money(statement.customerAdvanceCents) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.net') }}</div>
            <div class="text-h6" :class="statement.netCents < 0 ? 'text-error' : undefined">{{ money(statement.netCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.asOf', { date: statement.asOf }) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.statement.terms') }}
        <v-spacer />
        <v-btn v-if="canEditTerms" variant="tonal" size="small" prepend-icon="mdi-pencil-outline" @click="openTerms">{{ $t('common.edit') }}</v-btn>
      </v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap ga-6">
          <div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.creditDays') }}</div>
            <div>{{ (terms?.creditDays ?? 0) === 0 ? $t('treasury.statement.cash') : $t('treasury.statement.days', { n: terms?.creditDays }) }}</div>
          </div>
          <div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.creditLimit') }}</div>
            <div>{{ terms?.creditLimitCents != null ? money(terms.creditLimitCents) : $t('treasury.statement.noLimit') }}</div>
          </div>
          <div v-if="usage">
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.statement.limitUsage') }}</div>
            <div :class="usage.over ? 'text-error' : undefined">
              {{ $t('treasury.statement.available2', { amount: money(usage.availableCents) }) }}
            </div>
            <v-progress-linear :model-value="usage.percent" :color="usage.over ? 'error' : 'primary'" height="6" class="mt-1" />
          </div>
        </div>
        <div class="text-body-2 text-medium-emphasis mt-3">{{ $t('treasury.statement.termsHint') }}</div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title class="text-h6">{{ $t('treasury.statement.receivables') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="receivableHeaders" :items="statement?.receivables ?? []" :loading="store.loading" :items-per-page="-1" hide-default-footer>
          <template #item.documentNumber="{ item }">
            {{ item.documentNumber ?? $t(`treasury.receivables.source.${item.sourceType}`) }}
            <div v-for="a in applicationsOf(item.id)" :key="a.id" class="text-body-2 text-medium-emphasis">
              {{ $t('treasury.statement.applied', { doc: a.documentNumber ?? $t(`treasury.statement.creditNote`), amount: money(a.appliedCents) }) }}
            </div>
          </template>
          <template #item.dueDate="{ item }">
            {{ item.dueDate }}
            <v-chip v-if="dueChip(item) > 0" color="lighterror" variant="flat" size="x-small" class="ml-2">{{ $t('treasury.receivables.overdueDays', { n: dueChip(item) }) }}</v-chip>
          </template>
          <template #item.originalCents="{ item }">{{ money(item.originalCents, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">
            <span :class="item.balanceCents < 0 ? 'text-error' : undefined">{{ money(item.balanceCents, item.currencyCode) }}</span>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="RECEIVABLE_STATUS_COLOR[item.status]" variant="flat" size="small">{{ $t(`treasury.receivables.status.${item.status}`) }}</v-chip>
          </template>
          <template #no-data>{{ $t('treasury.statement.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card v-if="statement && statement.advances.length > 0">
      <v-card-title class="text-h6">{{ $t('treasury.statement.advances') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="advanceHeaders" :items="statement.advances" :items-per-page="-1" hide-default-footer>
          <template #item.documentNumber="{ item }">{{ item.documentNumber ?? '—' }}</template>
          <template #item.origin="{ item }">{{ $t(`treasury.statement.origins.${item.origin}`) }}</template>
          <template #item.originalCents="{ item }">{{ money(item.originalCents, item.currencyCode) }}</template>
          <template #item.balanceCents="{ item }">{{ money(item.balanceCents, item.currencyCode) }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.statement.editTerms') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" class="mb-4">{{ formError }}</v-alert>
          <v-row>
            <v-col cols="12" sm="5">
              <v-text-field
                v-model="form.creditDays"
                :label="$t('treasury.statement.creditDays')"
                :hint="$t('treasury.statement.creditDaysHint')"
                :error="parsedDays === null"
                persistent-hint
                inputmode="numeric"
              />
            </v-col>
            <v-col cols="12" sm="7">
              <v-text-field
                v-model="form.creditLimit"
                :label="$t('treasury.statement.creditLimit')"
                :hint="$t('treasury.statement.creditLimitHint')"
                :error="parsedLimit === undefined"
                persistent-hint
                inputmode="decimal"
              />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!canSave" @click="saveTerms">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

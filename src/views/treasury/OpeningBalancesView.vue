<script setup lang="ts">
/**
 * Saldos iniciales de cartera. La cartera nace VACÍA: las facturas que ya estaban emitidas no se recuperan solas, y esta es la única
 * forma de empezar con lo que cada cliente ya debía. Se hace UNA vez por fecha de corte (repetirla duplicaría la deuda) y todo o nada.
 * Ojo: esto NO genera asiento. Para que la cartera cuadre con el libro mayor, contabilidad necesita su asiento de apertura por el
 * mismo total. El servidor comprueba que cada cliente exista en la organización.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTreasuryStore } from '@/stores/treasury';
import { customerApi } from '@/api/customers';
import { formatMoney } from '@/utils/accounting';
import { buildOpeningBalanceInput, emptyOpeningRow, openingTotalCents, type OpeningForm } from '@/utils/treasury';
import type { Customer } from '@/types/customers';
import type { OpeningBalanceLoad } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const store = useTreasuryStore();

const form = ref<OpeningForm>({ cutoffDate: '', reason: '', rows: [emptyOpeningRow()] });
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const done = ref<OpeningBalanceLoad | null>(null);
const confirm = ref(false);
const customers = ref<Customer[]>([]);
const loadingCustomers = ref(false);

onMounted(async () => {
  loadingCustomers.value = true;
  try {
    customers.value = await customerApi.list({ status: 'active' });
  } finally {
    loadingCustomers.value = false;
  }
});

const customerItems = computed(() => customers.value.map((c) => ({ value: c.id, title: c.identification ? `${c.businessName} · ${c.identification}` : c.businessName })));
const total = computed(() => openingTotalCents(form.value.rows));
const err = (key: string) => (errors.value[key] ? t(errors.value[key]!) : undefined);

function addRow(): void {
  form.value.rows.push(emptyOpeningRow());
}
function removeRow(index: number): void {
  form.value.rows.splice(index, 1);
}

/** Hasta que se intenta enviar no se marca nada en rojo; después los errores se recalculan al escribir y desaparecen al corregirlos. */
const tried = ref(false);
watch(form, () => { if (tried.value) errors.value = buildOpeningBalanceInput(form.value).errors; }, { deep: true });

/** Valida y pide confirmación: cargar saldos no se deshace con un botón (hay una sola carga por fecha de corte). */
function review(): void {
  serverError.value = null;
  tried.value = true;
  const result = buildOpeningBalanceInput(form.value);
  errors.value = result.errors;
  if (result.input) confirm.value = true;
}

async function submit(): Promise<void> {
  const { input } = buildOpeningBalanceInput(form.value);
  if (!input) return;
  confirm.value = false;
  try {
    done.value = await store.loadOpeningBalances(input);
  } catch {
    serverError.value = store.error;
  }
}

function again(): void {
  done.value = null;
  tried.value = false;
  form.value = { cutoffDate: '', reason: '', rows: [emptyOpeningRow()] };
  errors.value = {};
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.opening.intro')" />
    <TreasuryTabs />

    <v-alert type="warning" class="mb-4" :title="$t('treasury.opening.noEntryTitle')">{{ $t('treasury.opening.noEntry') }}</v-alert>

    <v-card v-if="done">
      <v-card-text>
        <v-alert type="success" class="mb-4">
          {{ $t('treasury.opening.done', { total: formatMoney(done.totalCents, locale), date: done.cutoffDate }) }}
        </v-alert>
        <div class="d-flex flex-wrap ga-2">
          <v-btn color="primary" :to="{ name: 'treasury-receivables' }">{{ $t('treasury.opening.seeReceivables') }}</v-btn>
          <v-btn variant="tonal" @click="again">{{ $t('treasury.opening.another') }}</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card v-else>
      <v-card-text>
        <v-alert v-if="serverError" type="error" closable class="mb-4">{{ serverError }}</v-alert>

        <v-row>
          <v-col cols="12" sm="4">
            <v-text-field v-model="form.cutoffDate" type="date" :label="$t('treasury.opening.cutoff')" :hint="$t('treasury.opening.cutoffHint')" persistent-hint :error-messages="err('cutoffDate')" />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field v-model="form.reason" :label="$t('treasury.opening.reason')" maxlength="300" :error-messages="err('reason')" />
          </v-col>
        </v-row>

        <div class="text-h6 mb-2">{{ $t('treasury.opening.lines') }}</div>
        <v-alert v-if="errors.rows" type="error" class="mb-2">{{ err('rows') }}</v-alert>

        <v-row v-for="(row, index) in form.rows" :key="index" class="align-start">
          <v-col cols="12" md="3">
            <v-autocomplete
              v-model="row.customerId"
              :items="customerItems"
              :loading="loadingCustomers"
              :label="$t('treasury.opening.customer')"
              :error-messages="err(`rows[${index}].customerId`)"
            />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="row.documentNumber" :label="$t('treasury.receivables.document')" maxlength="60" />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="row.issueDate" type="date" :label="$t('treasury.receivables.issueDate')" :error-messages="err(`rows[${index}].issueDate`)" />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field v-model="row.dueDate" type="date" :label="$t('treasury.receivables.dueDate')" :hint="$t('treasury.opening.dueHint')" persistent-hint :error-messages="err(`rows[${index}].dueDate`)" />
          </v-col>
          <v-col cols="5" md="2">
            <v-text-field v-model="row.amount" :label="$t('treasury.opening.amount')" inputmode="decimal" :error-messages="err(`rows[${index}].amount`)" />
          </v-col>
          <v-col cols="1" class="d-flex align-center">
            <v-btn icon="mdi-close" variant="text" size="small" :disabled="form.rows.length === 1" :aria-label="$t('common.delete')" @click="removeRow(index)" />
          </v-col>
        </v-row>

        <div class="d-flex flex-wrap align-center ga-4 mt-2">
          <v-btn variant="tonal" prepend-icon="mdi-plus" :disabled="form.rows.length >= 500" @click="addRow">{{ $t('treasury.opening.addLine') }}</v-btn>
          <v-spacer />
          <div class="text-h6">{{ $t('treasury.opening.total', { amount: formatMoney(total, locale) }) }}</div>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn color="primary" :loading="store.saving" @click="review">{{ $t('treasury.opening.load') }}</v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog v-model="confirm" max-width="480">
      <v-card>
        <v-card-title>{{ $t('treasury.opening.confirmTitle') }}</v-card-title>
        <v-card-text>{{ $t('treasury.opening.confirmText', { total: formatMoney(total, locale), date: form.cutoffDate, n: form.rows.length }) }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirm = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" @click="submit">{{ $t('treasury.opening.confirmLoad') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

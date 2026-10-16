<script setup lang="ts">
/**
 * Emisión de un comprobante de retención: la empresa retiene renta y/o IVA a un proveedor al pagarle una compra.
 *
 * El formulario pide lo mismo que el SRI: el proveedor, el comprobante de la compra (su número, fecha e importes) y cada impuesto
 * retenido con su código, base y porcentaje. Lo retenido se calcula aquí con la misma regla que el servidor para que la persona vea
 * el valor antes de enviar; el servidor lo recalcula y manda. Una vez enviado a autorización no se edita: se emite otro.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTaxDocumentsStore } from '@/stores/taxDocuments';
import {
  DOCUMENT_NUMBER_PATTERN,
  currentFiscalPeriod,
  fromCents,
  isValidRate,
  todayIso,
  toCents,
  vatCents,
  withheldCents,
} from '@/utils/taxDocuments';
import type { WithholdingInput, WithholdingTax } from '@/types/fiscal';
import PageHeader from '@/components/ui/PageHeader.vue';
import TaxDocumentTabs from '@/components/taxDocuments/TaxDocumentTabs.vue';
import IssuerPicker from '@/components/taxDocuments/IssuerPicker.vue';

const router = useRouter();
const store = useTaxDocumentsStore();

const PAYMENT_METHOD_CODES = ['01', '15', '16', '17', '18', '19', '20', '21'];
const DOCUMENT_CODES = ['01', '02', '03', '41'];
const WITHHOLDING_TAXES: WithholdingTax[] = ['income', 'vat', 'isd'];

const establishmentId = ref('');
const emissionPointId = ref('');
const fiscalPeriod = ref(currentFiscalPeriod());

const subject = reactive({
  identificationType: 'RUC' as 'RUC' | 'CEDULA' | 'PASAPORTE',
  identification: '',
  businessName: '',
  email: '',
  phone: '',
  relatedParty: false,
});

const support = reactive({
  supportCode: '01',
  documentCode: '01',
  number: '',
  issueDate: todayIso(),
  authorizationNumber: '',
  paymentMethodCode: '20',
  subtotal: '',
});

interface TaxRow { percentageCode: string; base: string; amount: string }
/** `baseTouched`: la persona escribió la base; mientras no, acompaña al subtotal o al IVA del comprobante. */
interface WithholdingRow { tax: WithholdingTax; code: string; base: string; rate: string; baseTouched: boolean }

const taxes = ref<TaxRow[]>([]);
const rows = ref<WithholdingRow[]>([]);

const vatOptions = computed(() => store.catalog?.vatPercentageCodes ?? []);
const rateOf = (percentageCode: string): number => vatOptions.value.find((o) => o.percentageCode === percentageCode)?.rate ?? 0;

function recalcTax(row: TaxRow): void {
  const base = toCents(row.base);
  row.amount = base === null ? '' : fromCents(vatCents(base, rateOf(row.percentageCode)));
}

function newTax(base = ''): TaxRow {
  const preferred = vatOptions.value.find((o) => o.percentageCode === '4') ?? vatOptions.value[0];
  const row: TaxRow = { percentageCode: preferred?.percentageCode ?? '4', base, amount: '' };
  recalcTax(row);
  return row;
}

// Con un solo impuesto la base es el subtotal: se acompaña mientras la persona no la haya cambiado a mano.
watch(() => support.subtotal, (value, previous) => {
  const only = taxes.value.length === 1 ? taxes.value[0]! : null;
  if (only && (only.base === '' || only.base === previous)) {
    only.base = value;
    recalcTax(only);
  }
});

const subtotalCents = computed(() => toCents(support.subtotal));
const taxesCents = computed(() => taxes.value.reduce((sum, row) => sum + (toCents(row.amount) ?? 0), 0));
const vatTotalCents = computed(() => taxesCents.value);
const totalCents = computed(() => (subtotalCents.value ?? 0) + taxesCents.value);

function suggestionsFor(tax: WithholdingTax) {
  return (store.catalog?.withholdingCodes ?? [])
    .filter((c) => c.tax === tax)
    .map((c) => ({ value: c.code, title: `${c.code} — ${c.description} (${c.ratePercent}%)` }));
}

function defaultBase(tax: WithholdingTax): string {
  if (tax === 'income') return support.subtotal;
  if (tax === 'vat') return vatTotalCents.value > 0 ? fromCents(vatTotalCents.value) : '';
  return totalCents.value > 0 ? fromCents(totalCents.value) : '';
}

function addRow(tax: WithholdingTax = 'income'): void {
  rows.value.push({ tax, code: '', base: defaultBase(tax), rate: '', baseTouched: false });
}

function onTaxKindChange(row: WithholdingRow): void {
  row.code = '';
  row.rate = '';
  row.baseTouched = false;
  row.base = defaultBase(row.tax);
}

watch([() => support.subtotal, vatTotalCents, totalCents], () => {
  for (const row of rows.value) if (!row.baseTouched) row.base = defaultBase(row.tax);
});

/** Elegir un código sugerido trae su porcentaje; un código escrito a mano deja el porcentaje a la persona. */
function onCodeChange(row: WithholdingRow, code: string | null): void {
  row.code = (code ?? '').trim();
  const known = store.catalog?.withholdingCodes.find((c) => c.tax === row.tax && c.code === row.code);
  if (known) row.rate = String(known.ratePercent);
}

const rateOfRow = (row: WithholdingRow): number => Number(row.rate);
const rowAmountCents = (row: WithholdingRow): number | null => {
  const base = toCents(row.base);
  return base === null || row.rate.trim() === '' || !isValidRate(rateOfRow(row)) ? null : withheldCents(base, rateOfRow(row));
};
const totalWithheldCents = computed(() => rows.value.reduce((sum, row) => sum + (rowAmountCents(row) ?? 0), 0));

const taxesValid = computed(() =>
  taxes.value.length > 0 && taxes.value.every((r) => r.percentageCode !== '' && toCents(r.base) !== null && toCents(r.amount) !== null),
);
const rowsValid = computed(() =>
  rows.value.length > 0 && rows.value.every((r) => /^[A-Za-z0-9]{1,5}$/.test(r.code) && toCents(r.base) !== null && rowAmountCents(r) !== null),
);
const canSubmit = computed(() =>
  Boolean(establishmentId.value && emissionPointId.value)
  && subject.identification.trim() !== '' && subject.businessName.trim() !== ''
  && DOCUMENT_NUMBER_PATTERN.test(support.number) && support.issueDate !== '' && support.issueDate <= todayIso()
  && /^(0[1-9]|1[0-2])\/20\d\d$/.test(fiscalPeriod.value)
  && subtotalCents.value !== null && taxesValid.value && rowsValid.value,
);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  const input: WithholdingInput = {
    establishmentId: establishmentId.value,
    emissionPointId: emissionPointId.value,
    subject: {
      identificationType: subject.identificationType,
      identification: subject.identification.trim(),
      businessName: subject.businessName.trim(),
      email: subject.email.trim() || null,
      phone: subject.phone.trim() || null,
      relatedParty: subject.relatedParty,
    },
    fiscalPeriod: fiscalPeriod.value,
    support: {
      supportCode: support.supportCode,
      documentCode: support.documentCode,
      number: support.number,
      issueDate: support.issueDate,
      authorizationNumber: support.authorizationNumber.trim() || null,
      totalWithoutTaxes: support.subtotal.trim(),
      total: fromCents(totalCents.value),
      paymentMethodCode: support.paymentMethodCode,
      taxes: taxes.value.map((r) => ({
        code: '2' as const,
        percentageCode: r.percentageCode,
        rate: rateOf(r.percentageCode),
        base: r.base.trim(),
        amount: r.amount.trim(),
      })),
    },
    withholdings: rows.value.map((r) => ({ tax: r.tax, retentionCode: r.code, base: r.base.trim(), ratePercent: rateOfRow(r) })),
  };
  await store.createWithholding(input);
  await router.push({ name: 'tax-withholdings' });
}

onMounted(async () => {
  store.error = null;
  await store.loadCatalog();
  taxes.value = [newTax()];
  addRow('income');
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('taxDocuments.title')" :subtitle="$t('taxDocuments.withholdings.formIntro')" />
    <TaxDocumentTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-form @submit.prevent="submit">
      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.issuer') }}</v-card-title>
        <v-card-text>
          <IssuerPicker v-model:establishment-id="establishmentId" v-model:emission-point-id="emissionPointId" />
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.withholdings.supplier') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="3">
              <v-select
                v-model="subject.identificationType"
                :items="['RUC', 'CEDULA', 'PASAPORTE'].map((v) => ({ value: v, title: $t(`taxDocuments.idTypes.${v}`) }))"
                :label="$t('taxDocuments.idType')"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="subject.identification" :label="$t('taxDocuments.identification')" maxlength="20" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="subject.businessName" :label="$t('taxDocuments.businessName')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="subject.email" :label="$t('common.email')" type="email" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="subject.phone" :label="$t('common.phone')" maxlength="20" />
            </v-col>
            <v-col cols="12" sm="4" class="d-flex align-center">
              <v-switch v-model="subject.relatedParty" :label="$t('taxDocuments.withholdings.relatedParty')" color="primary" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.withholdings.support') }}</v-card-title>
        <v-card-subtitle>{{ $t('taxDocuments.withholdings.supportHint') }}</v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="4">
              <v-combobox
                v-model="support.documentCode"
                :items="DOCUMENT_CODES.map((code) => ({ value: code, title: `${code} — ${$t(`taxDocuments.withholdings.documentTypes.${code}`)}` }))"
                item-value="value"
                item-title="title"
                :return-object="false"
                :label="$t('taxDocuments.withholdings.documentType')"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="support.number" :label="$t('taxDocuments.withholdings.supportNumber')" placeholder="000-000-000000000" maxlength="17" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="support.issueDate" :label="$t('taxDocuments.withholdings.supportDate')" type="date" :max="todayIso()" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="support.supportCode"
                :items="(store.catalog?.supportCodes ?? []).map((c) => ({ value: c.code, title: `${c.code} — ${c.description}` }))"
                :label="$t('taxDocuments.withholdings.supportCode')"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="support.authorizationNumber" :label="$t('taxDocuments.withholdings.authorization')" maxlength="49" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="support.paymentMethodCode"
                :items="PAYMENT_METHOD_CODES.map((code) => ({ value: code, title: `${code} · ${$t(`organization.sriProfile.paymentMethods.${code}`)}` }))"
                :label="$t('taxDocuments.withholdings.paymentMethod')"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="fiscalPeriod" :label="$t('taxDocuments.withholdings.period')" placeholder="MM/AAAA" maxlength="7" />
            </v-col>
          </v-row>

          <div class="text-subtitle-2 mb-2">{{ $t('taxDocuments.withholdings.amounts') }}</div>
          <v-row>
            <v-col cols="12" sm="4">
              <v-text-field v-model="support.subtotal" :label="$t('taxDocuments.withholdings.subtotal')" inputmode="decimal" />
            </v-col>
          </v-row>
          <v-row v-for="(row, i) in taxes" :key="i">
            <v-col cols="12" sm="4">
              <v-select
                v-model="row.percentageCode"
                :items="vatOptions.map((o) => ({ value: o.percentageCode, title: o.description }))"
                :label="$t('taxDocuments.withholdings.vat')"
                @update:model-value="recalcTax(row)"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="row.base" :label="$t('taxDocuments.withholdings.vatBase')" inputmode="decimal" @update:model-value="recalcTax(row)" />
            </v-col>
            <v-col cols="10" sm="3">
              <v-text-field v-model="row.amount" :label="$t('taxDocuments.withholdings.vatAmount')" inputmode="decimal" />
            </v-col>
            <v-col cols="2" sm="1" class="d-flex align-center">
              <v-btn icon="mdi-close" variant="text" :aria-label="$t('common.delete')" :disabled="taxes.length === 1" @click="taxes.splice(i, 1)" />
            </v-col>
          </v-row>
          <div class="d-flex flex-wrap align-center justify-space-between ga-2">
            <v-btn variant="text" color="primary" prepend-icon="mdi-plus" @click="taxes.push(newTax())">
              {{ $t('taxDocuments.withholdings.addTax') }}
            </v-btn>
            <div class="text-h6">{{ $t('taxDocuments.withholdings.supportTotal') }}: {{ fromCents(totalCents) }}</div>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.withholdings.retained') }}</v-card-title>
        <v-card-subtitle>{{ $t('taxDocuments.withholdings.retainedHint') }}</v-card-subtitle>
        <v-card-text>
          <v-row v-for="(row, i) in rows" :key="i">
            <v-col cols="12" sm="2">
              <v-select
                v-model="row.tax"
                :items="WITHHOLDING_TAXES.map((v) => ({ value: v, title: $t(`taxDocuments.withholdings.taxes.${v}`) }))"
                :label="$t('taxDocuments.withholdings.tax')"
                @update:model-value="onTaxKindChange(row)"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-combobox
                :model-value="row.code"
                :items="suggestionsFor(row.tax)"
                item-value="value"
                item-title="title"
                :return-object="false"
                :label="$t('taxDocuments.withholdings.code')"
                @update:model-value="onCodeChange(row, $event)"
              />
            </v-col>
            <v-col cols="4" sm="2">
              <v-text-field v-model="row.base" :label="$t('taxDocuments.withholdings.base')" inputmode="decimal" @update:model-value="row.baseTouched = true" />
            </v-col>
            <v-col cols="4" sm="1">
              <v-text-field v-model="row.rate" :label="$t('taxDocuments.withholdings.rate')" inputmode="decimal" />
            </v-col>
            <v-col cols="3" sm="2">
              <v-text-field :model-value="rowAmountCents(row) === null ? '' : fromCents(rowAmountCents(row)!)" :label="$t('taxDocuments.withholdings.amount')" readonly />
            </v-col>
            <v-col cols="1" class="d-flex align-center">
              <v-btn icon="mdi-close" variant="text" :aria-label="$t('common.delete')" :disabled="rows.length === 1" @click="rows.splice(i, 1)" />
            </v-col>
          </v-row>
          <div class="d-flex flex-wrap align-center justify-space-between ga-2">
            <v-btn variant="text" color="primary" prepend-icon="mdi-plus" @click="addRow()">
              {{ $t('taxDocuments.withholdings.addRetention') }}
            </v-btn>
            <div class="text-h6">{{ $t('taxDocuments.withholdings.totalWithheld') }}: {{ fromCents(totalWithheldCents) }}</div>
          </div>
        </v-card-text>
      </v-card>

      <div class="d-flex justify-end flex-wrap ga-2">
        <v-btn variant="text" @click="router.push({ name: 'tax-withholdings' })">{{ $t('common.cancel') }}</v-btn>
        <v-btn type="submit" color="primary" :loading="store.saving" :disabled="!canSubmit">
          {{ $t('taxDocuments.withholdings.submit') }}
        </v-btn>
      </div>
    </v-form>
  </v-container>
</template>

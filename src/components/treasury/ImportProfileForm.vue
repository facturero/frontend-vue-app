<script setup lang="ts">
/**
 * Cómo leer el CSV de un banco: delimitador, filas de encabezado a saltar, qué columna es la fecha, la descripción, la referencia y el
 * importe (con signo, o débito y crédito en dos columnas), el formato de la fecha y el separador decimal. Las columnas se cuentan desde 1.
 * No se inventa el formato de ningún banco: se prueba con la vista previa antes de guardar nada.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CSV_DATE_FORMATS, type ImportProfile } from '@/types/treasury';

const props = defineProps<{ modelValue: ImportProfile; errors?: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: ImportProfile): void }>();
const { t } = useI18n();

const profile = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});
const patch = (changes: Partial<ImportProfile>) => (profile.value = { ...profile.value, ...changes });
/** Los campos numéricos llegan como texto del input: vacío = sin columna (solo en los opcionales). */
const toColumn = (value: string | number | null, optional: boolean): number | null => {
  if (value === '' || value === null) return optional ? null : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : optional ? null : 0;
};
const err = (field: string) => {
  const key = props.errors?.[`profile.${field}`];
  return key ? t(key) : undefined;
};

const delimiterItems = computed(() => [
  { value: ',', title: t('treasury.banking.profile.delimiters.comma') },
  { value: ';', title: t('treasury.banking.profile.delimiters.semicolon') },
  { value: '\t', title: t('treasury.banking.profile.delimiters.tab') },
]);
const dateItems = CSV_DATE_FORMATS.map((value) => ({ value, title: value }));
const modeItems = computed(() => [
  { value: 'signed', title: t('treasury.banking.profile.modes.signed') },
  { value: 'debit_credit', title: t('treasury.banking.profile.modes.debitCredit') },
]);
const decimalItems = computed(() => [
  { value: '.', title: t('treasury.banking.profile.decimals.dot') },
  { value: ',', title: t('treasury.banking.profile.decimals.comma') },
]);
</script>

<template>
  <v-row>
    <v-col cols="12" sm="4">
      <v-select :model-value="profile.delimiter" :items="delimiterItems" :label="$t('treasury.banking.profile.delimiter')" @update:model-value="patch({ delimiter: $event })" />
    </v-col>
    <v-col cols="12" sm="4">
      <v-text-field :model-value="profile.skipRows" type="number" min="0" max="50" :label="$t('treasury.banking.profile.skipRows')" :hint="$t('treasury.banking.profile.skipRowsHint')" persistent-hint :error-messages="err('skipRows')" @update:model-value="patch({ skipRows: Number($event) })" />
    </v-col>
    <v-col cols="12" sm="4">
      <v-select :model-value="profile.dateFormat" :items="dateItems" :label="$t('treasury.banking.profile.dateFormat')" @update:model-value="patch({ dateFormat: $event })" />
    </v-col>
    <v-col cols="6" sm="4">
      <v-text-field :model-value="profile.dateColumn" type="number" min="1" max="50" :label="$t('treasury.banking.profile.dateColumn')" :error-messages="err('dateColumn')" @update:model-value="patch({ dateColumn: toColumn($event, false)! })" />
    </v-col>
    <v-col cols="6" sm="4">
      <v-text-field :model-value="profile.descriptionColumn" type="number" min="1" max="50" :label="$t('treasury.banking.profile.descriptionColumn')" :error-messages="err('descriptionColumn')" @update:model-value="patch({ descriptionColumn: toColumn($event, false)! })" />
    </v-col>
    <v-col cols="6" sm="4">
      <v-text-field :model-value="profile.referenceColumn" type="number" min="1" max="50" clearable :label="$t('treasury.banking.profile.referenceColumn')" :hint="$t('treasury.banking.profile.optional')" persistent-hint :error-messages="err('referenceColumn')" @update:model-value="patch({ referenceColumn: toColumn($event, true) })" />
    </v-col>
    <v-col cols="12" sm="4">
      <v-select :model-value="profile.amountMode" :items="modeItems" :label="$t('treasury.banking.profile.amountMode')" @update:model-value="patch({ amountMode: $event })" />
    </v-col>
    <template v-if="profile.amountMode === 'signed'">
      <v-col cols="6" sm="4">
        <v-text-field :model-value="profile.amountColumn" type="number" min="1" max="50" :label="$t('treasury.banking.profile.amountColumn')" :error-messages="err('amountColumn')" @update:model-value="patch({ amountColumn: toColumn($event, true) })" />
      </v-col>
      <v-col cols="12" sm="4" class="d-flex align-center">
        <v-checkbox :model-value="profile.invertSign" hide-details density="comfortable" :label="$t('treasury.banking.profile.invertSign')" @update:model-value="patch({ invertSign: Boolean($event) })" />
      </v-col>
    </template>
    <template v-else>
      <v-col cols="6" sm="4">
        <v-text-field :model-value="profile.debitColumn" type="number" min="1" max="50" :label="$t('treasury.banking.profile.debitColumn')" :hint="$t('treasury.banking.profile.debitHint')" persistent-hint :error-messages="err('debitColumn')" @update:model-value="patch({ debitColumn: toColumn($event, true) })" />
      </v-col>
      <v-col cols="6" sm="4">
        <v-text-field :model-value="profile.creditColumn" type="number" min="1" max="50" :label="$t('treasury.banking.profile.creditColumn')" :hint="$t('treasury.banking.profile.creditHint')" persistent-hint :error-messages="err('creditColumn')" @update:model-value="patch({ creditColumn: toColumn($event, true) })" />
      </v-col>
    </template>
    <v-col cols="6" sm="4">
      <v-select :model-value="profile.decimalSeparator" :items="decimalItems" :label="$t('treasury.banking.profile.decimalSeparator')" @update:model-value="patch({ decimalSeparator: $event })" />
    </v-col>
    <v-col cols="6" sm="4">
      <v-text-field :model-value="profile.balanceColumn" type="number" min="1" max="50" clearable :label="$t('treasury.banking.profile.balanceColumn')" :hint="$t('treasury.banking.profile.balanceHint')" persistent-hint :error-messages="err('balanceColumn')" @update:model-value="patch({ balanceColumn: toColumn($event, true) })" />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
/**
 * Alta y edición de una cuenta bancaria. Solo se pide lo que identifica la cuenta (nombre, banco, últimos 4 dígitos: el número completo no
 * se guarda) y su apertura: el saldo del banco en una fecha, desde la que empieza a contar el registro. El perfil de importación dice cómo leer
 * el CSV de ese banco (no se inventa el formato de ninguno): se puede dejar para la primera vez que se importe un extracto.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildBankAccountInput, defaultImportProfile, emptyBankAccountForm, type BankAccountForm } from '@/utils/treasury-banking';
import { BANK_ACCOUNT_TYPES, type BankAccount, type BankAccountInput } from '@/types/treasury';
import ImportProfileForm from '@/components/treasury/ImportProfileForm.vue';

const props = defineProps<{
  modelValue: boolean;
  /** La cuenta que se edita; `null` = alta. */
  account: BankAccount | null;
  saving: boolean;
  serverError: string | null;
  /** La apertura no se puede cambiar si la cuenta ya tiene extractos o conciliaciones. */
  openingLocked?: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'save', input: BankAccountInput, isActive: boolean): void;
}>();

const { t } = useI18n();
const today = () => new Date().toLocaleDateString('en-CA');
const form = ref<BankAccountForm>(emptyBankAccountForm(today()));
const isActive = ref(true);
const withProfile = ref(false);
const errors = ref<Record<string, string>>({});
const tried = ref(false);

watch(
  () => [props.modelValue, props.account] as const,
  ([open, account]) => {
    if (!open) return;
    tried.value = false;
    errors.value = {};
    if (account) {
      form.value = {
        name: account.name,
        bankName: account.bankName,
        accountType: account.accountType,
        accountLast4: account.accountLast4 ?? '',
        opening: account.openingBalanceCents === 0 ? '0' : (account.openingBalanceCents / 100).toFixed(2),
        openingDate: account.openingDate,
        profile: account.importProfile,
      };
      isActive.value = account.isActive;
      withProfile.value = account.importProfile !== null;
    } else {
      form.value = emptyBankAccountForm(today());
      isActive.value = true;
      withProfile.value = false;
    }
  },
  { immediate: true },
);

const typeItems = computed(() => BANK_ACCOUNT_TYPES.map((value) => ({ value, title: t(`treasury.banking.types.${value}`) })));
const err = (key: string) => (errors.value[key] ? t(errors.value[key]!) : undefined);

function onProfileToggle(on: boolean | null): void {
  form.value.profile = on ? (form.value.profile ?? defaultImportProfile()) : null;
}

function submit(): void {
  tried.value = true;
  const { input, errors: found } = buildBankAccountInput(form.value);
  errors.value = found;
  if (input) emit('save', input, isActive.value);
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="760" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ account ? $t('treasury.banking.editAccount') : $t('treasury.banking.newAccount') }}</v-card-title>
      <v-card-text>
        <v-alert v-if="serverError" type="error" class="mb-4">{{ serverError }}</v-alert>
        <v-row>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.name" :label="$t('treasury.banking.name')" :error-messages="err('name')" maxlength="80" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.bankName" :label="$t('treasury.banking.bank')" :error-messages="err('bankName')" maxlength="120" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select v-model="form.accountType" :items="typeItems" :label="$t('treasury.banking.type')" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.accountLast4" :label="$t('treasury.banking.last4')" :hint="$t('treasury.banking.last4Hint')" persistent-hint :error-messages="err('accountLast4')" maxlength="4" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.opening" :label="$t('treasury.banking.opening')" :hint="$t('treasury.banking.openingHint')" persistent-hint :error-messages="err('opening')" :disabled="openingLocked" inputmode="decimal" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.openingDate" type="date" :label="$t('treasury.banking.openingDate')" :error-messages="err('openingDate')" :disabled="openingLocked" />
          </v-col>
          <v-col v-if="openingLocked" cols="12">
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.openingLocked') }}</div>
          </v-col>
          <v-col v-if="account" cols="12">
            <v-switch v-model="isActive" color="primary" hide-details :label="$t('treasury.banking.active')" />
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.activeHint') }}</div>
          </v-col>
        </v-row>

        <v-divider class="my-4" />
        <v-switch v-model="withProfile" color="primary" hide-details :label="$t('treasury.banking.profile.toggle')" @update:model-value="onProfileToggle" />
        <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.banking.profile.toggleHint') }}</div>
        <ImportProfileForm v-if="withProfile && form.profile" v-model="form.profile" :errors="errors" />
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="saving" @click="submit">{{ $t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

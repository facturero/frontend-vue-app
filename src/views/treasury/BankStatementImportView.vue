<script setup lang="ts">
/**
 * Importar el extracto de un banco (CSV). Se elige el archivo y el sistema lo LEE con el perfil de la cuenta (qué columna es la fecha, el
 * importe…) y muestra una vista previa ANTES de guardar nada: cuántos renglones entrarían, cuáles ya estaban de un extracto anterior, los
 * errores por fila. Importar es todo o nada: una sola fila mala rechaza el archivo. El mismo archivo no entra dos veces.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useTreasuryBankingStore } from '@/stores/treasuryBanking';
import { formatMoney } from '@/utils/accounting';
import { defaultImportProfile, normalizeProfile, profileErrors } from '@/utils/treasury-banking';
import type { ImportProfile, StatementPreview } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';
import ImportProfileForm from '@/components/treasury/ImportProfileForm.vue';

const MAX_BYTES = 2 * 1024 * 1024;

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useTreasuryBankingStore();

const accountId = computed(() => route.params.id as string);
const account = computed(() => store.detail);
const profile = ref<ImportProfile>(defaultImportProfile());
const saveProfile = ref(false);
const profileOpen = ref<number[]>([]);
const csv = ref<string | null>(null);
const fileName = ref<string | null>(null);
const files = ref<File[]>([]);
const preview = ref<StatementPreview | null>(null);
const problem = ref<string | null>(null);
const snackbar = ref<string | null>(null);
const money = (cents: number) => formatMoney(cents, locale.value, account.value?.currencyCode ?? 'USD');
const profileProblems = computed(() => profileErrors(profile.value));
const profileInvalid = computed(() => Object.keys(profileProblems.value).length > 0);
/** El perfil para ProfileForm usa claves `profile.campo`: se re-nombran para reutilizar el mismo formulario. */
const formErrors = computed(() => Object.fromEntries(Object.entries(profileProblems.value).map(([k, v]) => [`profile.${k}`, v])));

onMounted(async () => {
  await store.fetchAccount(accountId.value);
  if (store.detail?.importProfile) {
    profile.value = store.detail.importProfile;
  } else {
    // Sin perfil guardado: se abre el formulario y, si funciona, se ofrece guardarlo.
    profileOpen.value = [0];
    saveProfile.value = true;
  }
});

async function onFile(selected: File | File[] | null): Promise<void> {
  const file = Array.isArray(selected) ? selected[0] : selected;
  preview.value = null;
  problem.value = null;
  csv.value = null;
  if (!file) return;
  if (file.size > MAX_BYTES) {
    problem.value = t('treasury.banking.import.tooBig');
    return;
  }
  csv.value = await file.text();
  fileName.value = file.name;
  await runPreview();
}

async function runPreview(): Promise<void> {
  if (csv.value === null || profileInvalid.value) return;
  problem.value = null;
  try {
    preview.value = await store.previewStatement(accountId.value, { csv: csv.value, fileName: fileName.value, profile: normalizeProfile(profile.value) });
  } catch {
    preview.value = null;
    problem.value = store.error;
  }
}

async function doImport(): Promise<void> {
  if (csv.value === null || !preview.value?.canImport) return;
  problem.value = null;
  try {
    const out = await store.importStatement(accountId.value, { csv: csv.value, fileName: fileName.value, profile: normalizeProfile(profile.value), saveProfile: saveProfile.value });
    snackbar.value = t('treasury.banking.import.done', { n: out.importedLines, skipped: out.skippedDuplicates });
    await router.push({ name: 'treasury-bank-reconcile', params: { id: accountId.value } });
  } catch {
    problem.value = store.error;
  }
}

const lineHeaders = computed(() => [
  { title: t('treasury.banking.import.row'), key: 'row', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.lines.date'), key: 'lineDate', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.lines.description'), key: 'description', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.lines.reference'), key: 'reference', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.lines.amount'), key: 'amountCents', sortable: false, align: 'end' as const },
]);
const errorHeaders = computed(() => [
  { title: t('treasury.banking.import.row'), key: 'row', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.import.field'), key: 'field', sortable: false, align: 'start' as const },
  { title: t('treasury.banking.import.message'), key: 'message', sortable: false, align: 'start' as const },
]);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.banking.import.intro', { account: account?.name ?? '' })">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'treasury-bank-accounts' }">{{ $t('treasury.banking.back') }}</v-btn>
      </template>
    </PageHeader>
    <TreasuryTabs />

    <v-alert v-if="problem" type="error" class="mb-4">{{ problem }}</v-alert>

    <v-card class="mb-4">
      <v-card-text>
        <v-expansion-panels v-model="profileOpen" multiple variant="accordion" class="mb-4">
          <v-expansion-panel>
            <v-expansion-panel-title>{{ $t('treasury.banking.import.profileTitle') }}</v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="text-body-2 text-medium-emphasis mb-3">{{ $t('treasury.banking.import.profileHint') }}</div>
              <ImportProfileForm v-model="profile" :errors="formErrors" />
              <v-checkbox v-model="saveProfile" hide-details density="comfortable" :label="$t('treasury.banking.import.saveProfile')" />
              <div class="d-flex justify-end mt-2">
                <v-btn variant="tonal" prepend-icon="mdi-refresh" :disabled="csv === null || profileInvalid" :loading="store.saving" @click="runPreview">{{ $t('treasury.banking.import.refresh') }}</v-btn>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-file-input v-model="files" accept=".csv,.txt,text/csv,text/plain" prepend-icon="" prepend-inner-icon="mdi-file-delimited-outline" :label="$t('treasury.banking.import.file')" :hint="$t('treasury.banking.import.fileHint')" persistent-hint :disabled="profileInvalid" @update:model-value="onFile" />
        <div v-if="profileInvalid" class="text-body-2 text-error mt-2">{{ $t('treasury.banking.import.fixProfile') }}</div>
      </v-card-text>
    </v-card>

    <template v-if="preview">
      <v-alert v-if="preview.alreadyImported" type="warning" class="mb-4">{{ $t('treasury.banking.import.alreadyImported') }}</v-alert>
      <v-alert v-if="preview.lockedPeriodLines > 0" type="warning" class="mb-4">{{ $t('treasury.banking.import.locked', { n: preview.lockedPeriodLines, date: preview.lockedUntil }) }}</v-alert>
      <v-alert v-if="preview.errorCount > 0" type="error" class="mb-4">{{ $t('treasury.banking.import.errorsFound', { n: preview.errorCount }) }}</v-alert>
      <v-alert v-else-if="preview.newLines === 0 && !preview.alreadyImported" type="info" class="mb-4">{{ $t('treasury.banking.import.nothingNew') }}</v-alert>

      <v-row class="mb-2">
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.newLines') }}</div>
            <div class="text-h6">{{ preview.newLines }}</div>
            <div v-if="preview.duplicates > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.duplicates', { n: preview.duplicates }) }}</div>
            <div v-if="preview.skippedBeforeOpening > 0" class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.beforeOpening', { n: preview.skippedBeforeOpening }) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.period') }}</div>
            <div class="text-h6">{{ preview.periodStart ?? '—' }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ preview.periodEnd ?? '' }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.inOut') }}</div>
            <div class="text-h6 text-success">{{ money(preview.inCents) }}</div>
            <div class="text-body-2 text-error">{{ money(preview.outCents) }}</div>
          </v-card-text></v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card><v-card-text>
            <div class="text-body-2 text-medium-emphasis">{{ $t('treasury.banking.import.closing') }}</div>
            <div class="text-h6">{{ preview.closingBalanceCents === null ? '—' : money(preview.closingBalanceCents) }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ preview.closingBalanceCents === null ? $t('treasury.banking.import.noBalance') : (preview.closingDate ?? '') }}</div>
          </v-card-text></v-card>
        </v-col>
      </v-row>

      <v-card v-if="preview.errors.length > 0" class="mb-4">
        <v-card-title class="text-h6">{{ $t('treasury.banking.import.errorsTitle') }}</v-card-title>
        <v-card-text>
          <v-data-table :headers="errorHeaders" :items="preview.errors" :items-per-page="-1" hide-default-footer density="compact" />
          <div v-if="preview.errorCount > preview.errors.length" class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.banking.import.moreErrors', { n: preview.errorCount - preview.errors.length }) }}</div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('treasury.banking.import.linesTitle') }}</v-card-title>
        <v-card-text>
          <v-data-table :headers="lineHeaders" :items="preview.lines" :items-per-page="-1" hide-default-footer density="compact">
            <template #item.description="{ item }">
              <span :class="{ 'text-medium-emphasis': item.isDuplicate }">{{ item.description }}</span>
              <v-chip v-if="item.isDuplicate" size="x-small" variant="flat" color="lightsecondary" class="ml-2">{{ $t('treasury.banking.import.duplicate') }}</v-chip>
            </template>
            <template #item.amountCents="{ item }">
              <span :class="item.amountCents < 0 ? 'text-error' : 'text-success'">{{ money(item.amountCents) }}</span>
            </template>
          </v-data-table>
          <div v-if="preview.rowCount > preview.lines.length" class="text-body-2 text-medium-emphasis mt-2">{{ $t('treasury.banking.import.onlyFirst', { n: preview.lines.length }) }}</div>
        </v-card-text>
      </v-card>

      <div class="d-flex justify-end ga-2">
        <v-btn variant="text" :to="{ name: 'treasury-bank-accounts' }">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" prepend-icon="mdi-file-upload-outline" :disabled="!preview.canImport" :loading="store.saving" @click="doImport">{{ $t('treasury.banking.import.confirm', { n: preview.newLines }) }}</v-btn>
      </div>
    </template>

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Recordatorios de cobro. Un recordatorio es un correo al CLIENTE de la empresa con sus documentos vencidos: comunicación externa, así
 * que nacen APAGADOS y solo el Administrador los enciende (con confirmación). Un correo por cliente (no uno por factura), a lo sumo
 * uno por documento y semana. Aquí se configura, se ve a quién se avisaría hoy (sin enviar nada) y, si se quiere, se envía ahora.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTreasuryStore } from '@/stores/treasury';
import { formatMoney } from '@/utils/accounting';
import { validateReminderSettings } from '@/utils/treasury';
import { MAX_FIRST_AFTER_DAYS, MAX_REPEAT_DAYS, MIN_FIRST_AFTER_DAYS, MIN_REPEAT_DAYS, type ReminderRun } from '@/types/treasury';
import PageHeader from '@/components/ui/PageHeader.vue';
import TreasuryTabs from '@/components/treasury/TreasuryTabs.vue';

const { t, locale } = useI18n();
const store = useTreasuryStore();

const form = ref({ enabled: false, firstAfterDays: '3', repeatEveryDays: '7' });
const errors = ref<Record<string, string>>({});
const serverError = ref<string | null>(null);
const snackbar = ref<string | null>(null);
const lastRun = ref<ReminderRun | null>(null);

const settings = computed(() => store.reminderSettings);
const preview = computed(() => store.reminderPreview);
const err = (key: string) => (errors.value[key] ? t(errors.value[key]!, { min: key === 'firstAfterDays' ? MIN_FIRST_AFTER_DAYS : MIN_REPEAT_DAYS, max: key === 'firstAfterDays' ? MAX_FIRST_AFTER_DAYS : MAX_REPEAT_DAYS }) : undefined);
const money = (cents: number, currency = 'USD') => formatMoney(cents, locale.value, currency);
const dirty = computed(
  () =>
    settings.value !== null &&
    (form.value.enabled !== settings.value.enabled ||
      form.value.firstAfterDays !== String(settings.value.firstAfterDays) ||
      form.value.repeatEveryDays !== String(settings.value.repeatEveryDays)),
);
/** Cuántos clientes recibirían algo hoy: solo los que tienen correo. */
const reachable = computed(() => (preview.value ? preview.value.customers.filter((c) => c.hasEmail).length : 0));

const headers = computed(() => [
  { title: t('treasury.reminders.customer'), key: 'customerName', sortable: false, align: 'start' as const },
  { title: t('treasury.reminders.email'), key: 'emailHint', sortable: false, align: 'start' as const },
  { title: t('treasury.reminders.documents'), key: 'receivableCount', sortable: false, align: 'end' as const },
  { title: t('treasury.reminders.total'), key: 'totalCents', sortable: false, align: 'end' as const },
]);

function fill(): void {
  if (!settings.value) return;
  form.value = {
    enabled: settings.value.enabled,
    firstAfterDays: String(settings.value.firstAfterDays),
    repeatEveryDays: String(settings.value.repeatEveryDays),
  };
}

onMounted(async () => {
  await store.fetchReminders();
  fill();
});

// ── Guardar (activar pide confirmación: sale correo a los clientes) ──
const confirmEnable = ref(false);

function save(): void {
  serverError.value = null;
  const result = validateReminderSettings(form.value);
  errors.value = result.errors;
  if (!result.input) return;
  // Pasar de apagado a encendido es la decisión que importa: lo dice con todas las letras antes de hacerlo.
  if (form.value.enabled && !settings.value?.enabled) confirmEnable.value = true;
  else void persist();
}

async function persist(): Promise<void> {
  confirmEnable.value = false;
  const result = validateReminderSettings(form.value);
  if (!result.input) return;
  try {
    await store.saveReminderSettings({ enabled: form.value.enabled, ...result.input });
    snackbar.value = t(form.value.enabled ? 'treasury.reminders.savedOn' : 'treasury.reminders.savedOff');
    await store.fetchReminders();
    fill();
  } catch {
    serverError.value = store.error;
  }
}

// ── Enviar ahora ──
const confirmRun = ref(false);
const runError = ref<string | null>(null);

async function runNow(): Promise<void> {
  confirmRun.value = false;
  runError.value = null;
  try {
    lastRun.value = await store.runReminders();
    snackbar.value = t('treasury.reminders.sent', { n: lastRun.value.customersReminded });
  } catch {
    runError.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('treasury.title')" :subtitle="$t('treasury.reminders.intro')" />
    <TreasuryTabs />

    <v-alert v-if="store.error && !serverError && !runError" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card class="mb-4">
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.reminders.settings') }}
        <v-chip :color="settings?.enabled ? 'success' : undefined" variant="flat" size="small">
          {{ $t(settings?.enabled ? 'treasury.reminders.on' : 'treasury.reminders.off') }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-alert type="info" density="comfortable" class="mb-4">{{ $t('treasury.reminders.externalNotice') }}</v-alert>
        <v-alert v-if="serverError" type="error" closable class="mb-4" @click:close="serverError = null">{{ serverError }}</v-alert>

        <v-switch v-model="form.enabled" color="primary" :label="$t('treasury.reminders.enable')" :hint="$t('treasury.reminders.enableHint')" persistent-hint class="mb-4" />
        <v-row>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.firstAfterDays"
              :label="$t('treasury.reminders.firstAfterDays')"
              :hint="$t('treasury.reminders.firstAfterDaysHint')"
              persistent-hint
              inputmode="numeric"
              :error-messages="err('firstAfterDays')"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.repeatEveryDays"
              :label="$t('treasury.reminders.repeatEveryDays')"
              :hint="$t('treasury.reminders.repeatEveryDaysHint')"
              persistent-hint
              inputmode="numeric"
              :error-messages="err('repeatEveryDays')"
            />
          </v-col>
        </v-row>
        <div v-if="settings?.lastRunOn" class="text-body-2 text-medium-emphasis mt-4">{{ $t('treasury.reminders.lastRun', { date: settings.lastRunOn }) }}</div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" :disabled="!dirty" @click="fill">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="store.saving" :disabled="!dirty" @click="save">{{ $t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title class="d-flex flex-wrap align-center ga-2 text-h6">
        {{ $t('treasury.reminders.todayTitle') }}
        <span v-if="preview" class="text-body-2 text-medium-emphasis">{{ $t('treasury.reminders.asOf', { date: preview.asOf }) }}</span>
        <v-spacer />
        <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="store.loading" @click="store.fetchReminders().then(fill)">{{ $t('treasury.reminders.refresh') }}</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-send-outline"
          :disabled="!settings?.enabled || reachable === 0"
          :loading="store.saving"
          @click="confirmRun = true"
        >
          {{ $t('treasury.reminders.sendNow') }}
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ $t('treasury.reminders.todayHint') }}</div>
        <v-alert v-if="runError" type="error" closable class="mb-4" @click:close="runError = null">{{ runError }}</v-alert>
        <v-alert v-if="lastRun" type="success" closable class="mb-4" @click:close="lastRun = null">
          {{ $t('treasury.reminders.runResult', { customers: lastRun.customersReminded, documents: lastRun.receivablesReminded }) }}
          <span v-if="lastRun.customersWithoutEmail > 0"> {{ $t('treasury.reminders.runWithoutEmail', { n: lastRun.customersWithoutEmail }) }}</span>
          <span v-if="lastRun.customersAlreadyReminded > 0"> {{ $t('treasury.reminders.runAlready', { n: lastRun.customersAlreadyReminded }) }}</span>
        </v-alert>
        <v-alert v-if="preview && preview.withoutEmailCount > 0" type="warning" density="comfortable" class="mb-4">
          {{ $t('treasury.reminders.withoutEmail', { n: preview.withoutEmailCount }) }}
        </v-alert>

        <v-data-table :headers="headers" :items="preview?.customers ?? []" :loading="store.loading" :items-per-page="-1" hide-default-footer>
          <template #item.customerName="{ item }">{{ item.customerName }}</template>
          <template #item.emailHint="{ item }">
            <span v-if="item.hasEmail">{{ item.emailHint }}</span>
            <v-chip v-else color="warning" variant="flat" size="small">{{ $t('treasury.reminders.noEmail') }}</v-chip>
          </template>
          <template #item.totalCents="{ item }">{{ money(item.totalCents, item.currencyCode) }}</template>
          <template #no-data>{{ $t('treasury.reminders.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="confirmEnable" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.reminders.confirmEnableTitle') }}</v-card-title>
        <v-card-text>{{ $t('treasury.reminders.confirmEnableText', { first: form.firstAfterDays, repeat: form.repeatEveryDays }) }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmEnable = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" @click="persist">{{ $t('treasury.reminders.confirmEnable') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmRun" max-width="520">
      <v-card>
        <v-card-title>{{ $t('treasury.reminders.confirmRunTitle') }}</v-card-title>
        <v-card-text>{{ $t('treasury.reminders.confirmRunText', { customers: reachable, documents: preview?.receivableCount ?? 0 }) }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmRun = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" @click="runNow">{{ $t('treasury.reminders.sendNow') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3500" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Estado de la factura ante el SRI. Hasta ahora nada en la interfaz lo
 * enseñaba: una factura podía llevar días rechazada o en error sin que nadie lo
 * supiera, y el reintento solo existía en la API.
 *
 * Mientras el SRI la procesa (pending/sent) se vuelve a pedir el estado cada
 * pocos segundos, con tope, para no dejar la pestaña consultando para siempre.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFiscalStore } from '@/stores/fiscal';
import { useAuthStore } from '@/stores/auth';
import { fiscalApi } from '@/api/fiscal';
import { extractError } from '@/utils/error';
import type { FiscalInvoiceStatus } from '@/types/fiscal';

const props = defineProps<{ billingInvoiceId: string }>();

const { t, locale } = useI18n();
const store = useFiscalStore();
const auth = useAuthStore();

const loaded = ref(false);
const retrying = ref(false);
const downloading = ref(false);
const actionError = ref<string | null>(null);

const POLL_MS = 5000;
const MAX_POLLS = 24;
let polls = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const fiscal = computed(() =>
  store.currentFiscalInvoice?.billing_invoice_id === props.billingInvoiceId ? store.currentFiscalInvoice : null,
);
// Mismo criterio que la API: `invoice:authorize` (reenviar al SRI) o `fiscal:manage`.
const canRetry = computed(
  () => (auth.can('invoice:authorize') || auth.can('fiscal:manage'))
    && fiscal.value?.status === 'error' && !fiscal.value.billing_voided_at,
);

const STATUS_COLOR: Record<FiscalInvoiceStatus, string> = {
  pending: 'info',
  sent: 'info',
  authorized: 'success',
  rejected: 'error',
  error: 'warning',
};

const STATUS_ICON: Record<FiscalInvoiceStatus, string> = {
  pending: 'mdi-timer-sand',
  sent: 'mdi-timer-sand',
  authorized: 'mdi-check-decagram',
  rejected: 'mdi-close-octagon',
  error: 'mdi-alert',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
}

function stopPolling(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function load(): Promise<void> {
  await store.fetchFiscalInvoice(props.billingInvoiceId);
  loaded.value = true;
  stopPolling();
  const status = fiscal.value?.status;
  // Sin registro todavía también se sigue mirando: el evento puede tardar en llegar.
  if ((!status || status === 'pending' || status === 'sent') && polls < MAX_POLLS) {
    polls++;
    timer = setTimeout(load, POLL_MS);
  }
}

async function retry(): Promise<void> {
  retrying.value = true;
  actionError.value = null;
  try {
    await store.retryFiscalInvoice(props.billingInvoiceId);
    polls = 0;
    await load();
  } catch (e) {
    actionError.value = extractError(e);
  } finally {
    retrying.value = false;
  }
}

async function downloadXml(): Promise<void> {
  if (!fiscal.value) return;
  downloading.value = true;
  actionError.value = null;
  try {
    const { blob, filename } = await fiscalApi.downloadXml(fiscal.value.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    actionError.value = extractError(e);
  } finally {
    downloading.value = false;
  }
}

async function downloadRide(): Promise<void> {
  if (!fiscal.value) return;
  downloading.value = true;
  actionError.value = null;
  try {
    const { blob, filename } = await fiscalApi.downloadRide(fiscal.value.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    actionError.value = extractError(e);
  } finally {
    downloading.value = false;
  }
}

watch(() => props.billingInvoiceId, () => {
  polls = 0;
  void load();
});
onMounted(load);
onBeforeUnmount(stopPolling);
</script>

<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      {{ t('fiscal.title') }}
      <v-chip
        v-if="fiscal"
        :color="STATUS_COLOR[fiscal.status]"
        :prepend-icon="STATUS_ICON[fiscal.status]"
        size="small"
      >
        {{ t(`fiscal.status.${fiscal.status}`) }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="fiscal && (fiscal.has_authorized_xml || fiscal.has_signed_xml)"
        size="small"
        variant="text"
        color="primary"
        prepend-icon="mdi-file-code-outline"
        :loading="downloading"
        @click="downloadXml"
      >
        {{ fiscal.has_authorized_xml ? t('fiscal.downloadAuthorized') : t('fiscal.downloadSigned') }}
      </v-btn>
      <v-btn
        v-if="fiscal && fiscal.ride_available"
        size="small"
        variant="text"
        color="primary"
        prepend-icon="mdi-file-pdf-box"
        :loading="downloading"
        @click="downloadRide"
      >
        {{ t('fiscal.downloadRide') }}
      </v-btn>
      <v-btn
        v-if="canRetry"
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-refresh"
        :loading="retrying"
        @click="retry"
      >
        {{ t('fiscal.retry') }}
      </v-btn>
    </v-card-title>

    <v-card-text>
      <v-progress-linear v-if="!loaded" indeterminate />

      <p v-else-if="!fiscal" class="text-medium-emphasis mb-0">
        <v-progress-circular v-if="polls < MAX_POLLS" indeterminate size="14" width="2" class="mr-2" />
        {{ polls < MAX_POLLS ? t('fiscal.waiting') : t('fiscal.none') }}
      </p>

      <template v-else>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t(`fiscal.statusHint.${fiscal.status}`) }}</p>

        <v-alert
          v-if="fiscal.billing_voided_at && fiscal.status !== 'error' && fiscal.status !== 'rejected'"
          type="warning"
          class="mb-3"
        >
          {{ t('fiscal.voidedWarning') }}
        </v-alert>

        <v-alert
          v-if="fiscal.last_error && fiscal.status !== 'authorized'"
          :type="fiscal.status === 'rejected' ? 'error' : 'warning'"
          class="mb-3"
        >
          <div class="text-body-2">{{ fiscal.last_error }}</div>
          <div v-if="fiscal.status === 'error'" class="text-caption mt-1">
            {{ fiscal.next_check_at ? t('fiscal.autoRetry', { when: formatDateTime(fiscal.next_check_at) }) : t('fiscal.needsAction') }}
          </div>
        </v-alert>

        <v-row dense>
          <v-col cols="12" md="8">
            <div class="text-caption text-medium-emphasis">{{ t('fiscal.accessKey') }}</div>
            <div class="text-body-2 font-weight-medium text-break">{{ fiscal.access_key || '-' }}</div>
          </v-col>
          <v-col v-if="fiscal.status === 'authorized'" cols="12" md="4">
            <div class="text-caption text-medium-emphasis">{{ t('fiscal.authorizationDate') }}</div>
            <div class="text-body-2 font-weight-medium">{{ formatDateTime(fiscal.authorization_date) }}</div>
          </v-col>
          <v-col v-if="fiscal.status === 'authorized' && fiscal.authorization_number !== fiscal.access_key" cols="12">
            <div class="text-caption text-medium-emphasis">{{ t('fiscal.authorizationNumber') }}</div>
            <div class="text-body-2 font-weight-medium text-break">{{ fiscal.authorization_number }}</div>
          </v-col>
        </v-row>

        <v-list v-if="fiscal.sri_messages.length && fiscal.status !== 'authorized'" density="compact" class="mt-2 pa-0">
          <v-list-subheader class="px-0">{{ t('fiscal.sriMessages') }}</v-list-subheader>
          <v-list-item
            v-for="(message, index) in fiscal.sri_messages"
            :key="index"
            class="px-0"
            :title="message.identificador ? `[${message.identificador}] ${message.mensaje}` : message.mensaje"
            :subtitle="message.informacionAdicional"
          />
        </v-list>
      </template>

      <v-alert v-if="actionError" type="error" class="mt-3" closable @click:close="actionError = null">
        {{ actionError }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

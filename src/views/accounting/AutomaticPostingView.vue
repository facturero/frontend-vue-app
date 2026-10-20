<script setup lang="ts">
/**
 * Contabilización automática.
 *
 * Las facturas, las notas de crédito, sus anulaciones y los movimientos del kardex se convierten solos en asientos. Aquí se decide
 * cómo: si está encendida y desde qué día, a dónde va cada forma de cobro, y QUÉ CUENTA lleva cada rol (clientes, ventas, IVA…).
 * Lo que no pudo contabilizarse (un periodo cerrado, una cuenta sin rol…) espera abajo, con su motivo: arreglas la causa y lo
 * reintentas. Nada se pierde.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useAccountingStore } from '@/stores/accounting';
import { postableAccounts } from '@/utils/accounting';
import { SYSTEM_ROLES, type CollectionRole, type PendingPosting, type PendingStatus, type SystemRole } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useAccountingStore();

const canManage = computed(() => auth.can('account:manage'));
const canPost = computed(() => auth.can('journal:post'));
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

// ── Ajustes ───────────────────────────────────────────────────────────────
const autoPosting = ref(true);
const from = ref<string>('');
const paymentRoles = ref<Record<string, CollectionRole>>({});

const PAYMENT_CODES = ['01', '15', '16', '17', '18', '19', '20', '21'];
const collectionOptions = computed(() => (['cash', 'bank', 'receivables'] as const).map((r) => ({ value: r, title: t(`accounting.auto.collection.${r}`) })));
const defaults = computed(() => store.posting?.defaultPaymentMethodRoles ?? {});
const effectiveRole = (code: string): CollectionRole => paymentRoles.value[code] ?? defaults.value[code] ?? 'receivables';

function syncSettings(): void {
  const s = store.posting?.settings;
  if (!s) return;
  autoPosting.value = s.autoPosting;
  from.value = s.autoPostingFrom ?? '';
  paymentRoles.value = { ...(s.paymentMethodRoles ?? {}) };
}

async function saveSettings(): Promise<void> {
  actionError.value = null;
  // Solo se guarda lo que se aparta del valor por defecto: así un cambio futuro de los valores por defecto sigue valiendo.
  const overrides: Record<string, CollectionRole> = {};
  for (const code of PAYMENT_CODES) {
    const role = effectiveRole(code);
    if (role !== (defaults.value[code] ?? 'receivables')) overrides[code] = role;
  }
  try {
    await store.updatePosting({
      autoPosting: autoPosting.value,
      autoPostingFrom: from.value || null,
      paymentMethodRoles: Object.keys(overrides).length > 0 ? overrides : null,
    });
    syncSettings();
    snackbar.value = t('accounting.auto.saved');
  } catch {
    actionError.value = store.error;
  }
}

// ── Roles de cuentas ──────────────────────────────────────────────────────
const accountOptions = computed(() => postableAccounts(store.accounts).map((a) => ({ value: a.id, title: `${a.code}  ${a.name}` })));
/** Los que usan las reglas de la 1.2 primero; el resto son para módulos que vienen. */
const ACTIVE_ROLES: SystemRole[] = ['receivables', 'sales_revenue', 'sales_returns', 'other_income', 'vat_payable', 'cash', 'bank', 'inventory', 'cogs', 'inventory_gain', 'inventory_shrinkage', 'other_expense', 'retained_earnings', 'payables', 'income_tax_withholding_payable', 'vat_withholding_payable'];
const FUTURE_ROLES = computed(() => SYSTEM_ROLES.filter((r) => !ACTIVE_ROLES.includes(r)));
const holderOf = (role: string): string | null => store.accounts.find((a) => a.systemRole === role)?.id ?? null;

async function assignRole(role: SystemRole, accountId: string | null): Promise<void> {
  actionError.value = null;
  try {
    if (accountId) {
      await store.updateAccount(accountId, { systemRole: role });
    } else {
      const current = holderOf(role);
      if (current) await store.updateAccount(current, { systemRole: null });
    }
    snackbar.value = t('accounting.auto.roles.saved');
  } catch {
    actionError.value = store.error;
  }
}

// ── Pendientes ────────────────────────────────────────────────────────────
const status = ref<PendingStatus | null>('pending');
const page = ref(1);
const pageSize = ref(10);
const discardTarget = ref<PendingPosting | null>(null);
const discardReason = ref('');
const showTechnical = ref(false);

const statusOptions = computed(() => [
  { value: null, title: t('common.all') },
  { value: 'pending', title: t('accounting.auto.pending.status.pending') },
  { value: 'posted', title: t('accounting.auto.pending.status.posted') },
  { value: 'discarded', title: t('accounting.auto.pending.status.discarded') },
]);

const headers = computed(() => [
  { title: t('common.date'), key: 'entryDate', sortable: false, align: 'start' as const },
  { title: t('accounting.auto.pending.source'), key: 'sourceType', sortable: false, align: 'start' as const },
  { title: t('accounting.auto.pending.reason'), key: 'reasonCode', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

const reasonLabel = (code: string): string => {
  const key = `accounting.auto.pending.reasons.${code}`;
  return t(key) === key ? code : t(key);
};
const statusColor = (s: PendingStatus): string => (s === 'pending' ? 'lightwarning' : s === 'posted' ? 'lightsuccess' : 'lightsecondary');

async function loadPending(): Promise<void> {
  try {
    await store.fetchPending({ status: status.value ?? undefined, page: page.value, pageSize: pageSize.value });
  } catch {
    loadError.value = store.error;
  }
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    await store.fetchSettings();
    if (!store.configured) return;
    await Promise.all([store.fetchPosting(), store.fetchAccounts()]);
    syncSettings();
    await loadPending();
  } catch {
    loadError.value = store.error;
  }
}
onMounted(load);
watch([status, page, pageSize], loadPending);

async function retry(ids?: string[]): Promise<void> {
  actionError.value = null;
  try {
    const res = await store.retryPending(ids);
    snackbar.value = t('accounting.auto.pending.retried', { posted: res.posted, still: res.stillPending, discarded: res.discarded });
    await loadPending();
  } catch {
    actionError.value = store.error;
  }
}

async function confirmDiscard(): Promise<void> {
  const target = discardTarget.value;
  if (!target) return;
  try {
    await store.discardPending(target.id, discardReason.value.trim());
    discardTarget.value = null;
    discardReason.value = '';
    await loadPending();
  } catch {
    discardTarget.value = null;
    actionError.value = store.error;
  }
}

function openEntry(id: string | null): void {
  if (id) void router.push({ name: 'accounting-entry', params: { id } });
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="$t('accounting.auto.intro')" />

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>
    <v-alert v-if="actionError" type="error" closable class="mb-4" @click:close="actionError = null">{{ actionError }}</v-alert>

    <AccountingSetupCard v-if="store.configured === false" @done="load" />

    <template v-else-if="store.configured && store.posting">
      <v-alert v-if="!store.posting.settings.autoPosting" type="warning" class="mb-4">{{ $t('accounting.auto.offWarning') }}</v-alert>

      <!-- Pendientes -->
      <v-card class="mb-6">
        <v-card-title class="d-flex flex-wrap align-center ga-2">
          {{ $t('accounting.auto.pending.title') }}
          <v-chip v-if="store.pendingCount > 0" size="small" variant="flat" color="lightwarning">{{ store.pendingCount }}</v-chip>
          <v-spacer />
          <v-btn v-if="canPost && store.pendingCount > 0" color="primary" prepend-icon="mdi-reload" :loading="store.saving" @click="retry()">
            {{ $t('accounting.auto.pending.retryAll') }}
          </v-btn>
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('accounting.auto.pending.intro') }}</p>
          <v-row>
            <v-col cols="12" sm="4"><v-select v-model="status" :items="statusOptions" :label="$t('common.status')" /></v-col>
            <v-col cols="12" sm="4" class="d-flex align-center"><v-switch v-model="showTechnical" color="primary" :label="$t('accounting.auto.pending.showDetail')" hide-details /></v-col>
          </v-row>
          <v-data-table-server
            v-model:page="page"
            v-model:items-per-page="pageSize"
            :headers="headers"
            :items="store.pending"
            :items-length="store.pendingTotal"
            :loading="store.loading"
          >
            <template #item.entryDate="{ item }">{{ item.entryDate ?? '' }}</template>
            <template #item.sourceType="{ item }">
              <!-- Un origen nuevo sin traducción se muestra tal cual en vez de dejar una clave técnica a la vista -->
              {{ $te(`accounting.auto.pending.sources.${item.sourceType}`) ? $t(`accounting.auto.pending.sources.${item.sourceType}`) : item.sourceType }}
              <div v-if="showTechnical" class="text-caption text-medium-emphasis">{{ item.eventType }} · {{ item.sourceId }}</div>
            </template>
            <template #item.reasonCode="{ item }">
              <div>{{ reasonLabel(item.reasonCode) }}</div>
              <div class="text-caption text-medium-emphasis">{{ item.reasonMessage }}</div>
            </template>
            <template #item.status="{ item }">
              <v-chip size="x-small" variant="flat" :color="statusColor(item.status)">{{ $t(`accounting.auto.pending.status.${item.status}`) }}</v-chip>
              <div v-if="item.attempts > 1" class="text-caption text-medium-emphasis">{{ $t('accounting.auto.pending.attempts', { n: item.attempts }) }}</div>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="item.status === 'pending' && canPost" size="small" variant="text" prepend-icon="mdi-reload" @click="retry([item.id])">{{ $t('accounting.auto.pending.retry') }}</v-btn>
              <v-btn v-if="item.status === 'pending' && canPost" size="small" variant="text" prepend-icon="mdi-close" @click="discardTarget = item">{{ $t('accounting.auto.pending.discard') }}</v-btn>
              <v-btn v-if="item.entryId" size="small" variant="text" prepend-icon="mdi-open-in-new" @click="openEntry(item.entryId)">{{ $t('accounting.auto.pending.seeEntry') }}</v-btn>
            </template>
            <template #no-data>{{ $t('accounting.auto.pending.empty') }}</template>
          </v-data-table-server>
        </v-card-text>
      </v-card>

      <v-row>
        <!-- Ajustes -->
        <v-col cols="12" md="5">
          <v-card>
            <v-card-title>{{ $t('accounting.auto.settings.title') }}</v-card-title>
            <v-card-text class="d-flex flex-column ga-4">
              <v-switch v-model="autoPosting" color="primary" :label="$t('accounting.auto.settings.enabled')" :hint="$t('accounting.auto.settings.enabledHint')" persistent-hint :disabled="!canManage" />
              <v-text-field v-model="from" type="date" :label="$t('accounting.auto.settings.from')" :hint="$t('accounting.auto.settings.fromHint')" persistent-hint clearable :disabled="!canManage" />
              <div>
                <div class="text-h6 mb-1">{{ $t('accounting.auto.payment.title') }}</div>
                <p class="text-body-2 text-medium-emphasis mb-3">{{ $t('accounting.auto.payment.intro') }}</p>
                <v-row v-for="code in PAYMENT_CODES" :key="code" align="center" dense>
                  <v-col cols="7" class="text-body-2">{{ code }} · {{ $t(`accounting.auto.payment.codes.${code}`) }}</v-col>
                  <v-col cols="5">
                    <v-select :model-value="effectiveRole(code)" :items="collectionOptions" :disabled="!canManage" @update:model-value="(v: CollectionRole) => (paymentRoles[code] = v)" />
                  </v-col>
                </v-row>
              </div>
            </v-card-text>
            <v-card-actions v-if="canManage">
              <v-spacer />
              <v-btn color="primary" :loading="store.saving" @click="saveSettings">{{ $t('common.save') }}</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>

        <!-- Roles -->
        <v-col cols="12" md="7">
          <v-card>
            <v-card-title>{{ $t('accounting.auto.roles.title') }}</v-card-title>
            <v-card-text>
              <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('accounting.auto.roles.intro') }}</p>
              <v-row v-for="role in ACTIVE_ROLES" :key="role" align="center">
                <v-col cols="12" sm="5">
                  <div class="font-weight-medium">{{ $t(`accounting.auto.roles.labels.${role}`) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ $t(`accounting.auto.roles.hints.${role}`) }}</div>
                </v-col>
                <v-col cols="12" sm="7">
                  <v-autocomplete
                    :model-value="holderOf(role)"
                    :items="accountOptions"
                    :label="$t('accounting.entry.account')"
                    :error="!holderOf(role)"
                    :disabled="!canManage"
                    clearable
                    @update:model-value="(v: string | null) => assignRole(role, v)"
                  />
                </v-col>
              </v-row>
              <v-expansion-panels class="mt-4">
                <v-expansion-panel :title="$t('accounting.auto.roles.future')">
                  <v-expansion-panel-text>
                    <p class="text-body-2 text-medium-emphasis mb-3">{{ $t('accounting.auto.roles.futureIntro') }}</p>
                    <v-row v-for="role in FUTURE_ROLES" :key="role" align="center">
                      <v-col cols="12" sm="5" class="font-weight-medium">{{ $t(`accounting.auto.roles.labels.${role}`) }}</v-col>
                      <v-col cols="12" sm="7">
                        <v-autocomplete
                          :model-value="holderOf(role)"
                          :items="accountOptions"
                          :label="$t('accounting.entry.account')"
                          :disabled="!canManage"
                          clearable
                          @update:model-value="(v: string | null) => assignRole(role, v)"
                        />
                      </v-col>
                    </v-row>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <v-dialog :model-value="!!discardTarget" @update:model-value="discardTarget = null">
      <v-card>
        <v-card-title>{{ $t('accounting.auto.pending.discardTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <p class="text-body-2 text-medium-emphasis">{{ $t('accounting.auto.pending.discardIntro') }}</p>
          <v-textarea v-model="discardReason" :label="$t('accounting.auto.pending.discardReason')" rows="2" maxlength="200" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="discardTarget = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" :disabled="discardReason.trim().length < 3" :loading="store.saving" @click="confirmDiscard">{{ $t('accounting.auto.pending.discard') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" timeout="4000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

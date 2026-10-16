<script setup lang="ts">
/**
 * Plan de cuentas y centros de costo.
 *
 * El plan se lee como un árbol por el código (`1`, `1.1`, `1.1.01`…). Solo las cuentas de DETALLE reciben movimientos; las de
 * agrupación suman a sus hijas. Una cuenta con asientos no cambia de código ni de tipo: solo se renombra o se desactiva.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useAccountingStore } from '@/stores/accounting';
import { accountTypeColor } from '@/utils/accounting';
import type { Account, AccountType, CostCenter } from '@/types/accounting';
import PageHeader from '@/components/ui/PageHeader.vue';
import AccountingTabs from '@/components/accounting/AccountingTabs.vue';
import AccountingSetupCard from '@/components/accounting/AccountingSetupCard.vue';

const { t } = useI18n();
const auth = useAuthStore();
const store = useAccountingStore();

const canManage = computed(() => auth.can('account:manage'));
const loadError = ref<string | null>(null);
const snackbar = ref<string | null>(null);
const tab = ref<'accounts' | 'costCenters'>('accounts');
const search = ref('');
const showInactive = ref(false);

const types: AccountType[] = ['asset', 'liability', 'equity', 'income', 'cost', 'expense'];

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  return store.accounts
    .filter((a) => showInactive.value || a.status === 'active')
    .filter((a) => !q || a.code.includes(q) || a.name.toLowerCase().includes(q))
    .sort((a, b) => compare(a.code, b.code));
});

/** Orden natural de códigos con puntos: 1.2 antes que 1.10. */
function compare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

const accountHeaders = computed(() => [
  { title: t('accounting.accounts.code'), key: 'code', sortable: false, align: 'start' as const },
  { title: t('common.name'), key: 'name', sortable: false, align: 'start' as const },
  { title: t('common.type'), key: 'type', sortable: false, align: 'start' as const },
  { title: t('accounting.accounts.kind'), key: 'isPostable', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);
const costCenterHeaders = computed(() => [
  { title: t('accounting.accounts.code'), key: 'code', sortable: false, align: 'start' as const },
  { title: t('common.name'), key: 'name', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    await store.fetchSettings();
    if (store.configured) await Promise.all([store.fetchAccounts(), store.fetchCostCenters()]);
  } catch {
    loadError.value = store.error;
  }
}
onMounted(load);

// ── Cuenta: alta y edición ─────────────────────────────────────────────────
const accountDialog = ref(false);
const editing = ref<Account | null>(null);
const accountForm = ref({ code: '', name: '', type: 'asset' as AccountType, parentId: null as string | null });
const dialogError = ref<string | null>(null);
const parent = computed(() => store.accountById.get(accountForm.value.parentId ?? '') ?? null);
const parentOptions = computed(() =>
  store.accounts
    .filter((a) => a.status === 'active')
    .sort((a, b) => compare(a.code, b.code))
    .map((a) => ({ value: a.id, title: `${a.code}  ${a.name}` })),
);

function openCreate(parentAccount: Account | null = null): void {
  editing.value = null;
  dialogError.value = null;
  accountForm.value = {
    code: parentAccount ? `${parentAccount.code}.` : '',
    name: '',
    type: parentAccount?.type ?? 'asset',
    parentId: parentAccount?.id ?? null,
  };
  accountDialog.value = true;
}

function openEdit(account: Account): void {
  editing.value = account;
  dialogError.value = null;
  accountForm.value = { code: account.code, name: account.name, type: account.type, parentId: account.parentId };
  accountDialog.value = true;
}

async function saveAccount(): Promise<void> {
  dialogError.value = null;
  try {
    if (editing.value) {
      await store.updateAccount(editing.value.id, { name: accountForm.value.name });
    } else {
      await store.createAccount({
        code: accountForm.value.code,
        name: accountForm.value.name,
        parentId: accountForm.value.parentId,
        type: accountForm.value.parentId ? undefined : accountForm.value.type,
      });
    }
    accountDialog.value = false;
    snackbar.value = t('accounting.accounts.saved');
  } catch {
    dialogError.value = store.error;
  }
}

async function toggleAccount(account: Account): Promise<void> {
  try {
    await store.updateAccount(account.id, { status: account.status === 'active' ? 'inactive' : 'active' });
  } catch {
    snackbar.value = store.error;
  }
}

// ── Centros de costo ───────────────────────────────────────────────────────
const ccDialog = ref(false);
const ccEditing = ref<CostCenter | null>(null);
const ccForm = ref({ code: '', name: '' });

function openCostCenter(cc: CostCenter | null): void {
  ccEditing.value = cc;
  dialogError.value = null;
  ccForm.value = { code: cc?.code ?? '', name: cc?.name ?? '' };
  ccDialog.value = true;
}

async function saveCostCenter(): Promise<void> {
  dialogError.value = null;
  try {
    if (ccEditing.value) await store.updateCostCenter(ccEditing.value.id, { name: ccForm.value.name });
    else await store.createCostCenter(ccForm.value);
    ccDialog.value = false;
    snackbar.value = t('accounting.accounts.saved');
  } catch {
    dialogError.value = store.error;
  }
}

async function toggleCostCenter(cc: CostCenter): Promise<void> {
  try {
    await store.updateCostCenter(cc.id, { status: cc.status === 'active' ? 'inactive' : 'active' });
  } catch {
    snackbar.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('accounting.title')" :subtitle="$t('accounting.intro')">
      <template #actions>
        <v-btn v-if="store.configured && canManage && tab === 'accounts'" color="primary" prepend-icon="mdi-plus" @click="openCreate()">
          {{ $t('accounting.accounts.new') }}
        </v-btn>
        <v-btn v-if="store.configured && canManage && tab === 'costCenters'" color="primary" prepend-icon="mdi-plus" @click="openCostCenter(null)">
          {{ $t('accounting.costCenters.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <AccountingTabs />

    <v-alert v-if="loadError" type="error" class="mb-4">{{ loadError }}</v-alert>

    <v-progress-linear v-if="store.loading && store.configured === null" indeterminate />

    <AccountingSetupCard v-else-if="store.configured === false" @done="load" />

    <v-card v-else-if="store.configured">
      <v-tabs v-model="tab" density="comfortable">
        <v-tab value="accounts">{{ $t('accounting.accounts.title') }}</v-tab>
        <v-tab value="costCenters">{{ $t('accounting.costCenters.title') }}</v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text v-if="tab === 'accounts'">
        <div class="d-flex flex-wrap align-center ga-4 mb-4">
          <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" :label="$t('common.search')" clearable class="flex-grow-1" />
          <v-switch v-model="showInactive" color="primary" :label="$t('accounting.accounts.showInactive')" hide-details />
        </div>
        <v-data-table :headers="accountHeaders" :items="visible" :items-per-page="-1" hide-default-footer>
          <template #item.code="{ item }">
            <span :class="{ 'font-weight-medium': !item.isPostable }">{{ item.code }}</span>
          </template>
          <template #item.name="{ item }">
            <span :style="{ paddingLeft: `${(item.level - 1) * 16}px` }" :class="{ 'font-weight-medium': !item.isPostable, 'text-medium-emphasis': item.status === 'inactive' }">
              {{ item.name }}
            </span>
          </template>
          <template #item.type="{ item }">
            <v-chip size="x-small" variant="flat" :color="accountTypeColor(item.type)">{{ $t(`accounting.types.${item.type}`) }}</v-chip>
          </template>
          <template #item.isPostable="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.isPostable ? 'lightinfo' : 'lightsecondary'">
              {{ item.isPostable ? $t('accounting.accounts.detail') : $t('accounting.accounts.group') }}
            </v-chip>
          </template>
          <template #item.status="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'">
              {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="canManage">
              <v-btn icon="mdi-plus" size="small" variant="text" :title="$t('accounting.accounts.addChild')" :aria-label="$t('accounting.accounts.addChild')" @click="openCreate(item)" />
              <v-btn icon="mdi-pencil-outline" size="small" variant="text" :title="$t('common.edit')" :aria-label="$t('common.edit')" @click="openEdit(item)" />
              <v-btn
                :icon="item.status === 'active' ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                size="small"
                variant="text"
                :title="item.status === 'active' ? $t('common.deactivate') : $t('common.active')"
                :aria-label="item.status === 'active' ? $t('common.deactivate') : $t('common.active')"
                @click="toggleAccount(item)"
              />
            </template>
          </template>
        </v-data-table>
      </v-card-text>

      <v-card-text v-else>
        <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('accounting.costCenters.intro') }}</p>
        <v-data-table :headers="costCenterHeaders" :items="store.costCenters" :items-per-page="-1" hide-default-footer>
          <template #item.status="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'">
              {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="canManage">
              <v-btn icon="mdi-pencil-outline" size="small" variant="text" :title="$t('common.edit')" :aria-label="$t('common.edit')" @click="openCostCenter(item)" />
              <v-btn
                :icon="item.status === 'active' ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                size="small"
                variant="text"
                :title="item.status === 'active' ? $t('common.deactivate') : $t('common.active')"
                :aria-label="item.status === 'active' ? $t('common.deactivate') : $t('common.active')"
                @click="toggleCostCenter(item)"
              />
            </template>
          </template>
          <template #no-data>{{ $t('accounting.costCenters.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="accountDialog">
      <v-card>
        <v-card-title>{{ editing ? $t('accounting.accounts.edit') : $t('accounting.accounts.new') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <v-alert v-if="dialogError" type="error">{{ dialogError }}</v-alert>
          <v-autocomplete
            v-model="accountForm.parentId"
            :items="parentOptions"
            :label="$t('accounting.accounts.parent')"
            :hint="$t('accounting.accounts.parentHint')"
            persistent-hint
            clearable
            :disabled="!!editing"
          />
          <v-select v-if="!accountForm.parentId" v-model="accountForm.type" :items="types.map((x) => ({ value: x, title: $t(`accounting.types.${x}`) }))" :label="$t('common.type')" :disabled="!!editing" />
          <v-text-field v-model="accountForm.code" :label="$t('accounting.accounts.code')" :hint="parent ? $t('accounting.accounts.codeHintChild', { code: parent.code }) : $t('accounting.accounts.codeHint')" persistent-hint :disabled="!!editing" />
          <v-text-field v-model="accountForm.name" :label="$t('common.name')" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="accountDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!accountForm.code || !accountForm.name" @click="saveAccount">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="ccDialog">
      <v-card>
        <v-card-title>{{ ccEditing ? $t('accounting.costCenters.edit') : $t('accounting.costCenters.new') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <v-alert v-if="dialogError" type="error">{{ dialogError }}</v-alert>
          <v-text-field v-model="ccForm.code" :label="$t('accounting.accounts.code')" :disabled="!!ccEditing" />
          <v-text-field v-model="ccForm.name" :label="$t('common.name')" />
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="ccDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!ccForm.code || !ccForm.name" @click="saveCostCenter">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>

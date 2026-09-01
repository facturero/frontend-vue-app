<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useCustomerStore } from '@/stores/customers';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useCustomerStore();

const search = ref('');
const statusFilter = ref<string | null>(null);
const typeFilter = ref<string | null>(null);
const tagFilter = ref<string | null>(null);
const filtersApplied = ref(false);

const canCreate = computed(() => auth.can('customer:create'));
const canDisable = computed(() => auth.can('customer:update'));

const disableDialog = ref<{ id: string; name: string } | null>(null);
const disabling = ref(false);
const showDisableDialog = computed(() => disableDialog.value !== null);

async function confirmDisable(): Promise<void> {
  if (!disableDialog.value) return;
  disabling.value = true;
  try {
    await store.disable(disableDialog.value.id);
  } finally {
    disabling.value = false;
    disableDialog.value = null;
  }
}

// computed y no constante: al cambiar de idioma las cabeceras deben re-renderizarse.
const headers = computed(() => [
  { title: t('customers.headers.identification'), key: 'identification', sortable: true, align: 'start' as const },
  { title: t('customers.headers.businessName'), key: 'businessName', sortable: true, align: 'start' as const },
  { title: t('common.type'), key: 'type', sortable: true, align: 'start' as const },
  { title: t('common.email'), key: 'email', sortable: false, align: 'start' as const },
  { title: t('common.phone'), key: 'phone', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: true, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

const filtered = computed(() => {
  let result = store.list;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(
      (c) =>
        c.businessName.toLowerCase().includes(q) ||
        (c.identification ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }
  if (statusFilter.value) {
    result = result.filter((c) => c.status === statusFilter.value);
  }
  if (typeFilter.value) {
    result = result.filter((c) => c.type === typeFilter.value);
  }
  return result;
});

async function doSearch(): Promise<void> {
  filtersApplied.value = true;
  try {
    await store.fetch({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      tagId: tagFilter.value || undefined,
    });
  } finally {
    filtersApplied.value = false;
  }
}

function viewDetail(id: string): void {
  router.push({ name: 'customers-detail', params: { id } });
}

function goCreate(): void {
  router.push({ name: 'customers-create' });
}

onMounted(async () => {
  await Promise.all([
    store.fetch(),
    store.fetchCatalog(),
  ]);
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('customers.title')">
      <template #actions>
        <v-btn v-if="canCreate" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="goCreate">
          {{ $t('customers.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card class="mb-4">
      <v-card-text>
        <v-row dense align="end">
          <v-col cols="12" sm="4">
            <v-text-field v-model="search" :label="$t('customers.searchLabel')" hide-details prepend-inner-icon="mdi-magnify" clearable @keyup.enter="doSearch" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-select v-model="statusFilter" :items="[
              { title: $t('customers.allStatuses'), value: null },
              { title: $t('common.active'), value: 'active' },
              { title: $t('common.inactive'), value: 'inactive' },
            ]" :label="$t('common.status')" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-select v-model="typeFilter" :items="[
              { title: $t('customers.allTypes'), value: null },
              { title: $t('customers.person'), value: 'person' },
              { title: $t('customers.company'), value: 'company' },
            ]" :label="$t('common.type')" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="8" sm="3">
            <v-select v-model="tagFilter" :items="[
              { title: $t('customers.allTags'), value: null },
              ...store.tags.map((tag) => ({ title: tag.name, value: tag.id })),
            ]" :label="$t('customers.tag')" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="4" sm="1">
            <v-btn variant="text" icon="mdi-refresh" :loading="store.loading" @click="doSearch" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table :headers="headers" :items="filtered" :loading="store.loading" item-value="id" :items-per-page="10"
        :items-per-page-options="[
          { title: '5', value: 5 },
          { title: '10', value: 10 },
          { title: '25', value: 25 },
          { title: '50', value: 50 },
        ]">
        <template #item.identification="{ item }">
          <span class="text-caption font-weight-medium">{{ item.identification || '—' }}</span>
        </template>

        <template #item.businessName="{ item }">
          <div>
            <div class="text-body-2">{{ item.businessName }}</div>
            <div v-if="item.tradeName" class="text-caption text-medium-emphasis">{{ item.tradeName }}</div>
          </div>
        </template>

        <template #item.type="{ item }">
          <v-chip size="x-small" :color="item.type === 'company' ? 'primary' : 'info'">
            {{ item.type === 'company' ? $t('customers.company') : $t('customers.person') }}
          </v-chip>
        </template>

        <template #item.email="{ item }">
          <span class="text-caption">{{ item.email || '—' }}</span>
        </template>

        <template #item.phone="{ item }">
          <span class="text-caption">{{ item.phone || '—' }}</span>
        </template>

        <template #item.status="{ item }">
          <v-chip size="x-small" :color="item.status === 'active' ? 'success' : 'warning'">
            {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end ga-1">
            <v-btn size="small" variant="text" icon="mdi-eye" @click="viewDetail(item.id)" />
            <v-btn v-if="item.status === 'active' && item.isSystem === false && canDisable"
              size="small" variant="text" icon="mdi-account-cancel" color="warning"
              @click="disableDialog = { id: item.id, name: item.businessName }" />
          </div>
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            {{ $t('customers.empty') }}
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDisableDialog" max-width="400">
      <v-card>
        <v-card-title>{{ $t('customers.disableTitle') }}</v-card-title>
        <v-card-text>
          <i18n-t keypath="customers.disableConfirm" tag="span">
            <template #name><strong>{{ disableDialog?.name }}</strong></template>
          </i18n-t>
          <p class="text-caption text-medium-emphasis mt-2">{{ $t('customers.disableHint') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="disableDialog = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="warning" variant="tonal" :loading="disabling" @click="confirmDisable">
            {{ $t('customers.disable') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

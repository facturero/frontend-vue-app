<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useProductStore } from '@/stores/products';
import { useOrganizationStore } from '@/stores/organization';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t, locale } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useProductStore();
const organizationStore = useOrganizationStore();

const search = ref('');
const statusFilter = ref<string | null>(null);
const typeFilter = ref<string | null>(null);
const establishmentFilter = ref<string | null>(null);
const filtersApplied = ref(false);

const canCreate = computed(() => auth.can('product:create'));

const establishmentOptions = computed(() => [
  { title: t('products.allEstablishments'), value: null },
  ...organizationStore.establishments.map((e) => ({
    title: `${e.code} — ${e.name}`,
    value: e.id,
  })),
]);

const headers = computed(() => [
  { title: 'SKU', key: 'sku', sortable: true, align: 'start' as const },
  { title: t('common.name'), key: 'name', sortable: true, align: 'start' as const },
  { title: t('common.type'), key: 'type', sortable: true, align: 'start' as const },
  { title: t('products.price'), key: 'price', sortable: true, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: true, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

const filtered = computed(() => {
  let result = store.list;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q),
    );
  }
  if (statusFilter.value) {
    result = result.filter((p) => p.status === statusFilter.value);
  }
  if (typeFilter.value) {
    result = result.filter((p) => p.type === typeFilter.value);
  }
  return result;
});

function formatPrice(cents: number, currency: string, includesTax: boolean): string {
  // El formato de moneda sigue al idioma activo: separadores y posición del
  // símbolo cambian entre es-EC, en-US y fr-FR.
  const amount = (cents / 100).toLocaleString(locale.value, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return includesTax ? `${amount} ${t('products.priceIncludesTaxShort')}` : amount;
}

async function doSearch(): Promise<void> {
  filtersApplied.value = true;
  try {
    await store.fetch({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      type: typeFilter.value || undefined,
      establishmentId: establishmentFilter.value || undefined,
    });
  } finally {
    filtersApplied.value = false;
  }
}

function viewDetail(id: string): void {
  router.push({ name: 'products-detail', params: { id } });
}

function goCreate(): void {
  router.push({ name: 'products-create' });
}

onMounted(async () => {
  await Promise.all([
    store.fetch(),
    store.fetchCatalog(),
    organizationStore.fetchEstablishments(),
  ]);
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('products.title')">
      <template #actions>
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" @click="goCreate">
          {{ $t('products.new') }}
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
          <v-col cols="12" sm="5">
            <v-text-field v-model="search" :label="$t('products.searchLabel')"
              hide-details prepend-inner-icon="mdi-magnify" clearable @keyup.enter="doSearch" />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select v-model="statusFilter" :items="[
              { title: $t('products.allStatuses'), value: null },
              { title: $t('common.active'), value: 'active' },
              { title: $t('common.inactive'), value: 'inactive' },
            ]" :label="$t('common.status')" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select v-model="typeFilter" :items="[
              { title: $t('products.allTypes'), value: null },
              { title: $t('products.good'), value: 'good' },
              { title: $t('products.service'), value: 'service' },
            ]" :label="$t('common.type')" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select v-model="establishmentFilter" :items="establishmentOptions" :label="$t('organization.establishment')" hide-details clearable
              @update:model-value="doSearch" data-testid="products-establishment-filter" />
          </v-col>
          <v-col cols="12" sm="1">
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
        <template #item.sku="{ item }">
          <span class="text-caption font-weight-medium">{{ item.sku || '—' }}</span>
        </template>

        <template #item.type="{ item }">
          <v-chip size="x-small" variant="flat" color="lightinfo">
            {{ item.type === 'good' ? $t('products.good') : $t('products.service') }}
          </v-chip>
        </template>

        <template #item.price="{ item }">
          {{ formatPrice(item.priceCents, item.currencyCode, item.priceIncludesTax) }}
        </template>

        <template #item.status="{ item }">
          <v-chip size="x-small" variant="flat" :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'">
            {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-btn size="small" variant="text" icon="mdi-eye" @click="viewDetail(item.id)" />
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            {{ $t('products.empty') }}
          </div>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

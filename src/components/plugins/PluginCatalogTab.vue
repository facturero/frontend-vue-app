<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';
import type { CatalogPlugin } from '@/types/plugins';

const { t, locale } = useI18n();
const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));
const search = ref('');
const categoryFilter = ref<string | null>(null);
const statusFilter = ref<string | null>(null);
const sortBy = ref('name-asc');

const quoteDialog = ref(false);
const quoting = ref(false);
const activatingCode = ref<string | null>(null);

const categories = computed(() =>
  Array.from(new Set(store.catalog.map((p) => p.category))).sort(),
);

const statusOptions = computed(() => {
  const counts: Record<string, number> = {};
  for (const p of store.catalog) counts[p.display_status] = (counts[p.display_status] ?? 0) + 1;
  const entries = Object.entries(statusMeta.value) as [
    CatalogPlugin['display_status'],
    { label: string; color: string },
  ][];
  return [
    { value: 'all', label: t('plugins.allCount', { count: store.catalog.length }), color: 'grey' },
    ...entries
      .filter(([value]) => (counts[value] ?? 0) > 0)
      .map(([value, meta]) => ({
        value,
        label: t('plugins.statusCount', { label: meta.label, count: counts[value] }),
        color: meta.color,
      })),
  ];
});

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = store.catalog.filter((p) => {
    if (categoryFilter.value && p.category !== categoryFilter.value) return false;
    if (statusFilter.value && statusFilter.value !== 'all' && p.display_status !== statusFilter.value) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  const sorted = [...list];
  switch (sortBy.value) {
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'price-asc':
      sorted.sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name));
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.priceCents - a.priceCents || a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
});

const statusMeta = computed<Record<CatalogPlugin['display_status'], { label: string; color: string }>>(() => ({
  disponible: { label: t('plugins.status.disponible'), color: 'success' },
  comprado: { label: t('plugins.status.comprado'), color: 'primary' },
  en_construccion: { label: t('plugins.status.en_construccion'), color: 'warning' },
  desactivado: { label: t('plugins.status.desactivado'), color: 'grey' },
  incluido: { label: t('plugins.status.incluido'), color: 'info' },
}));

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(cents / 100);
}

async function openQuote(plugin: CatalogPlugin): Promise<void> {
  activatingCode.value = plugin.code;
  const ok = await store.fetchQuote(plugin.code);
  if (ok) quoteDialog.value = true;
}

async function confirmActivate(): Promise<void> {
  if (!activatingCode.value) return;
  quoting.value = true;
  const ok = await store.activate(activatingCode.value);
  quoting.value = false;
  if (ok) quoteDialog.value = false;
}
</script>

<template>
  <div>
    <v-alert
      v-if="store.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.clearError()"
    >
      {{ store.error }}
      <template v-if="store.errorDetails.length">
        <ul class="ml-4 text-caption">
          <li v-for="d in store.errorDetails" :key="d">{{ d }}</li>
        </ul>
      </template>
    </v-alert>

    <v-card elevation="2" rounded="lg" class="mb-4">
      <v-card-text class="pb-2">
        <v-row dense align="end">
          <v-text-field
            v-model="search"
            :label="$t('plugins.search')"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="mr-2"
          />
          <v-select
            v-model="categoryFilter"
            :items="categories"
            :label="$t('products.category')"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="mr-2"
          />
          <v-select
            v-model="sortBy"
            :items="[
              { title: $t('plugins.sortNameAsc'), value: 'name-asc' },
              { title: $t('plugins.sortNameDesc'), value: 'name-desc' },
              { title: $t('plugins.sortPriceAsc'), value: 'price-asc' },
              { title: $t('plugins.sortPriceDesc'), value: 'price-desc' },
            ]"
            :label="$t('plugins.sortBy')"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-row>
        <v-chip-group v-model="statusFilter" class="mt-1" mandatory>
          <v-chip
            v-for="opt in statusOptions"
            :key="opt.value"
            :value="opt.value"
            :color="opt.color"
            :variant="statusFilter === opt.value ? 'flat' : 'tonal'"
            size="small"
          >
            {{ opt.label }}
          </v-chip>
        </v-chip-group>
      </v-card-text>
    </v-card>

    <v-row>
      <v-col v-for="p in filtered" :key="p.id" cols="12" sm="6" md="4" lg="3">
        <v-card elevation="2" rounded="lg" class="d-flex flex-column fill-height">
          <v-card-title class="d-flex align-center justify-space-between">
            <span class="text-subtitle-1 font-weight-medium">{{ p.name }}</span>
            <v-chip v-if="p.is_exclusive" size="x-small" color="deep-purple" variant="tonal">
              {{ $t('plugins.exclusive') }}
            </v-chip>
          </v-card-title>
          <v-card-subtitle class="text-caption">{{ p.code }} · {{ p.category }}</v-card-subtitle>
          <v-card-text class="text-body-2 flex-grow-1">
            {{ p.description }}
            <div v-if="p.depends_on.length" class="mt-2 text-caption text-medium-emphasis">
              {{ $t('plugins.requires') }}
              <v-chip
                v-for="d in p.depends_on"
                :key="d.code"
                size="x-small"
                class="mr-1 mb-1"
                variant="outlined"
              >
                {{ d.name }}
              </v-chip>
            </div>
          </v-card-text>
          <v-card-actions class="pt-0">
            <v-chip size="small" :color="statusMeta[p.display_status].color" variant="tonal">
              {{ statusMeta[p.display_status].label }}
            </v-chip>
            <v-spacer />
            <span class="text-subtitle-2 mr-2">{{ formatPrice(p.priceCents, p.currency) }}{{ $t('plugins.perMonth') }}</span>
            <v-btn
              v-if="canActivate && p.display_status === 'disponible'"
              color="primary"
              variant="tonal"
              size="small"
              :loading="store.loading && activatingCode === p.code"
              @click="openQuote(p)"
            >
              {{ $t('plugins.activate') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <div v-if="!store.loading && !filtered.length" class="text-center text-medium-emphasis mt-8">
      {{ $t('plugins.noMatches') }}
    </div>

    <v-dialog v-model="quoteDialog" max-width="560">
      <v-card v-if="store.currentQuote">
        <v-card-title>{{ $t('plugins.activateTitle', { name: store.currentQuote.plugin.name }) }}</v-card-title>
        <v-card-text>
          <div class="text-body-2 mb-3">
            {{ $t('plugins.quoteIntro') }}
          </div>
          <v-list density="compact" class="bg-grey-lighten-4 rounded-lg mb-3">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-puzzle" />
              </template>
              <v-list-item-title>{{ store.currentQuote.plugin.name }}</v-list-item-title>
              <template #append>
                <span class="text-body-2">{{ formatPrice(store.currentQuote.price, store.currentQuote.plugin.currency) }}</span>
              </template>
            </v-list-item>
            <v-list-item v-for="r in store.currentQuote.requires" :key="r.plugin.id">
              <template #prepend>
                <v-icon icon="mdi-arrow-right-bottom" />
              </template>
              <v-list-item-title>{{ r.plugin.name }}</v-list-item-title>
              <template #append>
                <v-chip
                  v-if="r.already_active"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                  class="mr-2"
                >
                  {{ $t('plugins.alreadyActive') }}
                </v-chip>
                <span class="text-body-2">{{ formatPrice(r.price, r.plugin.currency) }}</span>
              </template>
            </v-list-item>
          </v-list>
          <div class="d-flex justify-end align-center">
            <span class="text-h6">{{ $t('plugins.monthlyTotal') }}
              {{ formatPrice(store.currentQuote.total_monthly, store.currentQuote.plugin.currency) }}
            </span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="quoteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :loading="quoting || store.saving"
            @click="confirmActivate"
          >
            {{ $t('plugins.confirmActivation') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

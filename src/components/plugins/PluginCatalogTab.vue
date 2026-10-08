<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginCartStore } from '@/stores/pluginCart';
import { useAuthStore } from '@/stores/auth';
import type { CatalogPlugin } from '@/types/plugins';

const props = defineProps<{ initialSearch?: string }>();

const { t, locale } = useI18n();
const store = usePluginsStore();
const cart = usePluginCartStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));
const search = ref(props.initialSearch ?? '');
// Estando ya en /plugins, otra búsqueda desde la barra superior cambia la consulta sin remontar la vista.
watch(() => props.initialSearch, (q) => {
  if (q) search.value = q;
});
const categoryFilter = ref<string | null>(null);
const statusFilter = ref<string | null>(null);
const sortBy = ref('name-asc');

// Lo incluido en la plataforma (núcleo y módulos base) no es algo que se elija ni se compre: no se mezcla con los plugins del
// catálogo. Solo se ve si se pide expresamente con el filtro «Incluido».
const offered = computed(() => store.catalog.filter((p) => p.display_status !== 'incluido'));

const categories = computed(() => Array.from(new Set(offered.value.map((p) => p.category))).sort());

const statusOptions = computed(() => {
  const counts: Record<string, number> = {};
  for (const p of store.catalog) counts[p.display_status] = (counts[p.display_status] ?? 0) + 1;
  const entries = Object.entries(statusMeta.value) as [
    CatalogPlugin['display_status'],
    { label: string; color: string },
  ][];
  return [
    { value: 'all', label: t('plugins.allCount', { count: offered.value.length }), color: 'grey' },
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
    if (p.display_status === 'incluido' && statusFilter.value !== 'incluido') return false;
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

const statusMeta = computed<Record<CatalogPlugin['display_status'], { label: string; color: string; variant: 'flat' | 'tonal' }>>(() => ({
  disponible: { label: t('plugins.status.disponible'), color: 'lightsuccess', variant: 'flat' },
  comprado: { label: t('plugins.status.comprado'), color: 'lightprimary', variant: 'flat' },
  en_construccion: { label: t('plugins.status.en_construccion'), color: 'lightwarning', variant: 'flat' },
  desactivado: { label: t('plugins.status.desactivado'), color: 'grey', variant: 'tonal' },
  incluido: { label: t('plugins.status.incluido'), color: 'lightinfo', variant: 'flat' },
}));

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(cents / 100);
}

// Un módulo desactivado cuyo periodo pago no terminó se reactiva directo y gratis; lo demás se agrega al carrito.
async function activateOrReactivate(p: CatalogPlugin): Promise<void> {
  if (p.display_status === 'desactivado' && store.freeReactivationUntil(p.code)) {
    if (await store.reactivate(p.code)) return;
    if (store.errorCode !== 'REACTIVATION_NOT_FREE') return;
    store.clearError();
  }
  await cart.toggle(p.code);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso));
}
</script>

<template>
  <div>
    <v-alert
      v-if="store.subscription?.trial?.active"
      type="info"
      icon="mdi-gift-outline"
      class="mb-4"
    >
      {{ $t('plugins.trialBanner', {
        days: store.subscription.trial.days_left,
        date: formatDate(store.subscription.trial.ends_at),
      }) }}
    </v-alert>
    <v-alert
      v-else-if="store.subscription?.trial"
      type="warning"
      class="mb-4"
    >
      {{ $t('plugins.trialEnded', { date: formatDate(store.subscription.trial.ends_at) }) }}
    </v-alert>
    <v-alert
      v-if="store.error"
      type="error"
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

    <v-card class="mb-4">
      <v-card-text class="pb-2">
        <v-row dense align="end">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="search"
              :label="$t('plugins.search')"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="categoryFilter"
              :items="categories"
              :label="$t('products.category')"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="sortBy"
              :items="[
                { title: $t('plugins.sortNameAsc'), value: 'name-asc' },
                { title: $t('plugins.sortNameDesc'), value: 'name-desc' },
                { title: $t('plugins.sortPriceAsc'), value: 'price-asc' },
                { title: $t('plugins.sortPriceDesc'), value: 'price-desc' },
              ]"
              :label="$t('plugins.sortBy')"
              hide-details
            />
          </v-col>
        </v-row>
        <v-chip-group v-model="statusFilter" class="mt-1" mandatory column>
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
      <v-col v-for="p in filtered" :key="p.id" cols="12" sm="6" lg="4" xl="3">
        <v-card class="d-flex flex-column fill-height">
          <v-card-title class="d-flex align-start justify-space-between ga-2">
            <span class="text-subtitle-1 font-weight-medium">{{ p.name }}</span>
            <v-chip v-if="p.is_exclusive" size="x-small" color="deep-purple">
              {{ $t('plugins.exclusive') }}
            </v-chip>
          </v-card-title>
          <v-card-subtitle class="text-caption">{{ p.code }} · {{ p.category }}</v-card-subtitle>
          <v-card-text class="text-body-2 flex-grow-1">
            {{ p.description }}
            <div v-if="p.depends_on.length" class="mt-2 text-caption text-medium-emphasis">
              {{ $t('plugins.requires') }} {{ p.depends_on.map((d) => d.name).join(', ') }}
            </div>
          </v-card-text>
          <div class="px-4 pb-2 text-subtitle-2">{{ p.display_status === 'incluido' || p.priceCents === 0 ? $t('plugins.included') : formatPrice(p.priceCents, p.currency) + $t('plugins.perMonth') + $t('plugins.plusVat') }}</div>
          <v-card-actions class="pt-0">
            <v-chip size="small" :color="statusMeta[p.display_status].color" :variant="statusMeta[p.display_status].variant">
              {{ statusMeta[p.display_status].label }}
            </v-chip>
            <v-spacer />
            <v-btn
              v-if="canActivate && (p.display_status === 'disponible' || p.display_status === 'desactivado')"
              :color="cart.has(p.code) ? 'success' : 'primary'"
              variant="tonal"
              size="small"
              :prepend-icon="cart.has(p.code) ? 'mdi-check' : 'mdi-cart-plus'"
              @click="activateOrReactivate(p)"
            >
              {{ cart.has(p.code)
                ? $t('plugins.cart.inCart')
                : $t(p.display_status === 'desactivado' ? 'plugins.reactivate' : 'plugins.cart.add') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <div v-if="!store.loading && !filtered.length" class="text-center text-medium-emphasis mt-8">
      {{ $t('plugins.noMatches') }}
    </div>

  </div>
</template>

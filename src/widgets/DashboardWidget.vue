<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EmptyState from '@/components/ui/EmptyState.vue';
import { organizationApi } from '@/api/organization';
import { useAuthStore } from '@/stores/auth';
import type { DashboardItem } from '@/api/dashboard';
import type { EstablishmentDTO } from '@/types/organization';
import type { KpiResult, ListItem, WidgetContext, WidgetDef } from './registry';
import WidgetShell from './WidgetShell.vue';

/**
 * Un widget colocado en el tablero: el marco (WidgetShell) más su cuerpo según el tipo del registro. `kpi` y `list` se pintan aquí con
 * los datos de su `load()`; `component` es un componente propio que se pide sus datos. Cada uno muestra carga, vacío y error (y si su
 * servicio falla, solo él lo dice: el resto del tablero sigue).
 *
 * Los widgets de restaurante (`needs: 'establishment'`) eligen el establecimiento en su cabecera; por defecto el principal. La elección
 * se guarda en el `config` del widget (va al servidor con el resto del tablero).
 */
const props = defineProps<{ item: DashboardItem; def: WidgetDef; editing: boolean }>();
const emit = defineEmits<{ remove: []; config: [Record<string, string | number | boolean>] }>();
const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

// ── Establecimiento (restaurante) ───────────────────────────────────────────
let establishmentsRequest: Promise<EstablishmentDTO[]> | null = null;
const establishments = ref<EstablishmentDTO[]>([]);
const establishmentId = computed<string | null>(() => {
  const chosen = props.item.config?.establishmentId;
  if (typeof chosen === 'string' && establishments.value.some((e) => e.id === chosen)) return chosen;
  return establishments.value.find((e) => e.isMain)?.id ?? establishments.value[0]?.id ?? null;
});

// ── Datos ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const failed = ref(false);
const kpi = ref<KpiResult | null>(null);
const items = ref<ListItem[]>([]);
const custom = shallowRef<ReturnType<typeof defineAsyncComponent> | null>(null);

const ctx = computed<WidgetContext>(() => ({ userId: auth.user?.id ?? '', establishmentId: establishmentId.value, t: (k, v) => t(k, v ?? {}) }));

async function load(): Promise<void> {
  const def = props.def;
  if (def.kind === 'component') {
    loading.value = false;
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    if (def.kind === 'kpi') kpi.value = await def.load(ctx.value);
    else items.value = await def.load(ctx.value);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (props.def.kind === 'component') custom.value = defineAsyncComponent(props.def.component);
  if (props.def.needs === 'establishment') {
    establishmentsRequest ??= organizationApi.getEstablishments().catch(() => []);
    establishments.value = (await establishmentsRequest).filter((e) => e.status === 'active');
  }
  await load();
});
watch(establishmentId, (now, before) => {
  if (before !== undefined && now !== before) void load();
});

function chooseEstablishment(id: string): void {
  emit('config', { ...(props.item.config ?? {}), establishmentId: id });
}

const toneClass = computed(() => (kpi.value?.tone ? `text-${kpi.value.tone}` : ''));
const emptyKey = computed(() => (props.def.kind === 'list' ? props.def.emptyKey : ''));
</script>

<template>
  <WidgetShell :title="t(def.titleKey)" :icon="def.icon" :color="def.color" :to="def.to" :editing="editing" @remove="emit('remove')">
    <template v-if="def.needs === 'establishment' && establishments.length > 1" #actions>
      <v-select
        :model-value="establishmentId"
        :items="establishments"
        item-title="name"
        item-value="id"
        variant="plain"
        class="widget-establishment"
        :aria-label="t('dashboard.establishment')"
        @update:model-value="chooseEstablishment"
      />
    </template>

    <v-skeleton-loader v-if="loading" :type="def.kind === 'list' ? 'list-item-two-line@3' : 'heading'" />
    <div v-else-if="failed" class="d-flex flex-column align-start ga-2">
      <span class="text-body-small text-error">{{ t('dashboard.loadError') }}</span>
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" class="px-0 no-drag" @click="load">{{ t('dashboard.retry') }}</v-btn>
    </div>

    <template v-else-if="def.kind === 'kpi' && kpi">
      <div class="text-headline-small font-weight-bold" :class="toneClass">{{ kpi.value }}</div>
      <div v-if="kpi.caption" class="text-body-small text-medium-emphasis">{{ kpi.caption }}</div>
    </template>

    <template v-else-if="def.kind === 'list'">
      <EmptyState v-if="!items.length" compact icon="mdi-check-circle-outline" :title="t(emptyKey)" />
      <v-list v-else density="compact" class="pa-0">
        <v-list-item
          v-for="row in items"
          :key="row.id"
          class="px-0"
          :class="{ 'no-drag': row.to }"
          :link="!!row.to && !editing"
          @click="row.to && !editing && router.push(row.to)"
        >
          <v-list-item-title class="text-body-medium">{{ row.title }}</v-list-item-title>
          <v-list-item-subtitle v-if="row.subtitle">{{ row.subtitle }}</v-list-item-subtitle>
          <v-progress-linear v-if="row.progress !== undefined" :model-value="row.progress" color="primary" rounded height="4" class="mt-1" />
          <template v-if="row.trailing" #append>
            <span class="text-body-small text-medium-emphasis text-no-wrap ml-2">{{ row.trailing }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>

    <component :is="custom" v-else-if="def.kind === 'component' && custom" :ctx="ctx" :editing="editing" />
  </WidgetShell>
</template>

<style scoped>
.widget-establishment {
  max-width: 180px;
}
</style>

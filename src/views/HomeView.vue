<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { GridItem, GridLayout } from 'grid-layout-plus';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useDashboardStore } from '@/stores/dashboard';
import { useConfirm } from '@/composable/useConfirm';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import DashboardWidget from '@/widgets/DashboardWidget.vue';
import WidgetCatalogDialog from '@/widgets/WidgetCatalogDialog.vue';
import { GRID_COLUMNS, ROW_HEIGHT } from '@/widgets/registry';

/**
 * Inicio = el tablero de la persona: widgets de los plugins activos de su organización que su rol le deja ver, en una rejilla de 12
 * columnas. Con «Editar tablero» se agregan, se arrastran, se agrandan o achican (cada widget entre el mínimo y el máximo de
 * `widgets/registry.ts`, el único listado) y se quitan; se guarda solo, en el servidor (auth-service), por usuario y organización.
 *
 * En el teléfono va en una columna, en el orden del tablero y sin edición (arrastrar y redimensionar con el dedo es torpe); se arma
 * desde una computadora y se ve igual en todas partes.
 */
const { t, locale } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const plugins = usePluginsStore();
const dashboard = useDashboardStore();
const confirm = useConfirm();
const { smAndDown } = useDisplay();

const loading = ref(true);
const loadError = ref<string | null>(null);
const editing = ref(false);
const adding = ref(false);

const todayLabel = computed(() => new Date().toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }));
const orgName = computed(() => (auth.user && 'orgName' in auth.user ? auth.user.orgName || auth.user.email : auth.user?.email));

interface GridEntry { i: string; x: number; y: number; w: number; h: number; minW: number; maxW: number; minH: number; maxH: number }

/**
 * La rejilla: lo visible del tablero, con el mínimo y el máximo de cada widget. Es un ref propio, no un computed del store, porque
 * grid-layout-plus muta este arreglo mientras se arrastra y vuelve a compactar cada vez que recibe uno nuevo: con un computed, cada
 * `applyLayout` producía un arreglo nuevo, la librería re-emitía y Vue cortaba el bucle con «Maximum recursive updates». Por eso solo se
 * reconstruye cuando cambia el conjunto de widgets (agregar, quitar, restablecer, un plugin que se activa), no cuando cambian posiciones.
 */
const gridLayout = ref<GridEntry[]>([]);
watch(
  () => dashboard.visible.map((v) => v.item.i).join(','),
  () => {
    gridLayout.value = dashboard.visible.map(({ item, def }) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: def.size.minW,
      maxW: def.size.maxW,
      minH: def.size.minH,
      maxH: def.size.maxH,
    }));
  },
  { immediate: true },
);
/** La sombra que marca dónde caerá el widget: color del tema (la librería trae rojo). */
const gridStyle = { '--vgl-placeholder-bg': 'rgb(var(--v-theme-primary))' };
const byId = computed(() => new Map(dashboard.visible.map((v) => [v.item.i, v])));
/** En el teléfono, de arriba abajo y de izquierda a derecha. */
const stacked = computed(() => [...dashboard.visible].sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x));

function onLayoutUpdated(next: Array<{ i: string | number; x: number; y: number; w: number; h: number }>): void {
  if (editing.value) dashboard.applyLayout(next);
}

async function finishEditing(): Promise<void> {
  editing.value = false;
  await dashboard.flush();
}

async function reset(): Promise<void> {
  const ok = await confirm({ title: t('dashboard.resetTitle'), text: t('dashboard.resetText'), confirmText: t('dashboard.reset') });
  if (ok) dashboard.reset();
}

onMounted(async () => {
  try {
    await auth.fetchMe();
    if (auth.needsOrg) {
      router.replace({ name: 'profile' });
      return;
    }
    if (auth.needsOrgSetup) {
      router.replace({ name: 'organization-settings' });
      return;
    }
    await plugins.ensureMyLoaded();
    if (!dashboard.loaded) await dashboard.load();
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    loadError.value = err?.response?.data?.message ?? t('home.loadError');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <v-container>
    <PageHeader :title="t('home.title')" :subtitle="t('home.today', { date: todayLabel })">
      <template v-if="!smAndDown && dashboard.loaded" #actions>
        <template v-if="editing">
          <v-btn variant="text" prepend-icon="mdi-restore" @click="reset">{{ t('dashboard.reset') }}</v-btn>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-plus" @click="adding = true">{{ t('dashboard.addWidget') }}</v-btn>
          <v-btn color="primary" prepend-icon="mdi-check" :loading="dashboard.saving" @click="finishEditing">{{ t('dashboard.done') }}</v-btn>
        </template>
        <v-btn v-else variant="text" prepend-icon="mdi-view-dashboard-edit-outline" @click="editing = true">{{ t('dashboard.edit') }}</v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="loadError" type="error" class="mb-4" :text="loadError" />
    <v-alert v-if="dashboard.error" type="warning" closable class="mb-4" :text="t('dashboard.saveError', { message: dashboard.error })" @click:close="dashboard.error = null" />

    <v-alert v-if="plugins.lastBatchResults" type="success" closable class="mb-4" @click:close="plugins.lastBatchResults = null">
      <template #title>{{ t('home.batchResults.title') }}</template>
      <div class="text-body-medium">
        {{
          t('home.batchResults.summary', {
            activated: plugins.lastBatchResults.filter((r) => r.result === 'activated').length,
            failed: plugins.lastBatchResults.filter((r) => r.result !== 'activated').length,
          })
        }}
      </div>
      <ul v-if="plugins.lastBatchResults.some((r) => r.result !== 'activated')" class="ml-4 text-body-small">
        <li v-for="r in plugins.lastBatchResults.filter((r) => r.result !== 'activated')" :key="r.code">
          {{ r.code }} — {{ t(`home.batchResults.reasons.${r.result}`) }}
        </li>
      </ul>
    </v-alert>

    <div v-if="loading" class="text-center py-12"><v-progress-circular indeterminate color="primary" /></div>

    <template v-else>
      <v-alert v-if="editing" type="info" class="mb-4" :text="t('dashboard.editingHint')" />

      <v-card v-if="!dashboard.visible.length" class="mb-4">
        <EmptyState
          icon="mdi-view-dashboard-outline"
          :title="t('dashboard.emptyTitle', { org: orgName })"
          :text="t('dashboard.emptyText')"
          :action-text="!smAndDown ? t('dashboard.addWidget') : undefined"
          action-icon="mdi-plus"
          @action="editing = true; adding = true"
        />
      </v-card>

      <!-- Teléfono y tablet: columnas de Vuetify, sin edición. Teléfono, todo a lo ancho (cols 12); tablet, los indicadores de dos en dos.
           Cada widget mide lo que su contenido (un indicador, solo su cifra); las listas se topan en su alto del tablero y se desplazan
           dentro. Con la celda fija de la rejilla, media tarjeta quedaba en blanco. -->
      <v-row v-else-if="smAndDown" density="comfortable">
        <v-col v-for="{ item, def } in stacked" :key="item.i" cols="12" :sm="def.kind === 'kpi' ? 6 : 12">
          <DashboardWidget
            :item="item"
            :def="def"
            :editing="false"
            fit
            :max-height="def.kind === 'kpi' ? undefined : item.h * ROW_HEIGHT"
          />
        </v-col>
      </v-row>

      <GridLayout
        v-else
        v-model:layout="gridLayout"
        :style="gridStyle"
        :col-num="GRID_COLUMNS"
        :row-height="ROW_HEIGHT"
        :margin="[16, 16]"
        :is-draggable="editing"
        :is-resizable="editing"
        vertical-compact
        use-css-transforms
        class="dashboard-grid"
        @layout-updated="onLayoutUpdated"
      >
        <GridItem
          v-for="l in gridLayout"
          :key="l.i"
          :i="l.i"
          :x="l.x"
          :y="l.y"
          :w="l.w"
          :h="l.h"
          :min-w="l.minW"
          :max-w="l.maxW"
          :min-h="l.minH"
          :max-h="l.maxH"
          drag-ignore-from=".no-drag, a, button, input, .v-field"
        >
          <DashboardWidget
            v-if="byId.get(l.i)"
            :item="byId.get(l.i)!.item"
            :def="byId.get(l.i)!.def"
            :editing="editing"
            @remove="dashboard.remove(l.i)"
            @config="(c) => dashboard.setConfig(l.i, c)"
          />
        </GridItem>
      </GridLayout>
    </template>

    <WidgetCatalogDialog v-model="adding" />
  </v-container>
</template>

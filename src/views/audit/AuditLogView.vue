<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuditStore } from '@/stores/audit';
import PageHeader from '@/components/ui/PageHeader.vue';
import type { AuditLogEntry } from '@/types/audit';

const { t, te } = useI18n();
const store = useAuditStore();

// ── Filtros ────────────────────────────────────────────────────────────────
// En la vista solo queda el buscador. Todo lo demás vive en el menú de filtros:
// una bitácora se consulta casi siempre escribiendo algo, y acotar por módulo,
// rango o uuid es puntual — no merece ocupar la pantalla a diario.
type RangePreset = '24h' | '7d' | '30d' | 'all' | 'custom';

const search = ref('');

/** Estado aplicado (el que se manda al API). */
const applied = ref({
  domain: null as string | null,
  range: '7d' as RangePreset,
  from: '',
  to: '',
  userId: '',
  targetId: '',
  includePlatform: false,
});

/** Borrador del menú: se escribe aquí y solo pasa a `applied` al aceptar, para
 *  que abrir el menú y cerrarlo sin querer no recargue la tabla. */
const draft = ref({ ...applied.value });
const filtersMenu = ref(false);

const page = ref(1);
const itemsPerPage = ref(25);

/** El backend acepta prefijo si la clave acaba en punto (`billing.`). */
const domains = computed(() => [
  { title: t('audit.allDomains'), value: null },
  { title: t('audit.domain.identity'), value: 'identity.' },
  { title: t('audit.domain.billing'), value: 'billing.' },
  { title: t('audit.domain.customer'), value: 'customer.' },
  { title: t('audit.domain.product'), value: 'product.' },
  { title: t('audit.domain.organization'), value: 'organization.' },
  { title: t('audit.domain.plugin'), value: 'plugin.' },
  { title: t('audit.domain.tax'), value: 'tax.' },
  { title: t('audit.domain.document'), value: 'document.' },
]);

const rangeOptions = computed(() => [
  { title: t('audit.range.h24'), value: '24h' },
  { title: t('audit.range.d7'), value: '7d' },
  { title: t('audit.range.d30'), value: '30d' },
  { title: t('audit.range.all'), value: 'all' },
  { title: t('audit.range.custom'), value: 'custom' },
]);

const headers = computed(() => [
  { title: t('audit.headers.occurredAt'), key: 'occurredAt', sortable: false, align: 'start' as const, width: 170 },
  { title: t('audit.headers.action'), key: 'event', sortable: false, align: 'start' as const },
  { title: t('audit.headers.actor'), key: 'userEmail', sortable: false, align: 'start' as const },
  { title: t('audit.headers.target'), key: 'targetId', sortable: false, align: 'start' as const },
  { title: t('audit.headers.ip'), key: 'ip', sortable: false, align: 'start' as const, width: 130 },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 60 },
]);

/**
 * Cada evento tiene su clave i18n (`audit.event.billing_invoice_issued`). Si es
 * uno nuevo sin traducir se cae al `summary` del servidor, que viene en inglés
 * crudo — mejor eso que un hueco en blanco.
 */
function eventLabel(entry: AuditLogEntry): string {
  const key = `audit.event.${entry.event.replace(/\./g, '_')}`;
  return te(key) ? t(key) : entry.summary;
}

function iconFor(entry: AuditLogEntry): string {
  const a = entry.action;
  if (a.includes('deleted') || a.includes('removed')) return 'mdi-delete-outline';
  if (a.includes('disabled') || a.includes('rejected') || a.includes('voided')) return 'mdi-cancel';
  if (a.includes('created') || a.includes('added') || a.includes('invited')) return 'mdi-plus-circle-outline';
  if (a.includes('updated') || a.includes('upserted')) return 'mdi-pencil-outline';
  if (a.includes('issued') || a.includes('enabled') || a.includes('activated')) return 'mdi-check-circle-outline';
  return 'mdi-circle-small';
}

function colorFor(entry: AuditLogEntry): string {
  const a = entry.action;
  if (a.includes('deleted') || a.includes('removed') || a.includes('disabled') || a.includes('voided')) {
    return 'error';
  }
  if (a.includes('created') || a.includes('added')) return 'success';
  return 'primary';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** El input `date` da 'YYYY-MM-DD'; `to` cubre el día entero, no su medianoche. */
function dayToIso(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const d = new Date(value + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Traduce el preset a la ventana que entiende el API. */
function rangeBounds(): { from?: string; to?: string } {
  const a = applied.value;
  if (a.range === 'all') return {};
  if (a.range === 'custom') return { from: dayToIso(a.from), to: dayToIso(a.to, true) };
  const days = { '24h': 1, '7d': 7, '30d': 30 }[a.range];
  return { from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() };
}

async function load(): Promise<void> {
  const a = applied.value;
  const bounds = rangeBounds();
  await store.fetch({
    event: a.domain ?? undefined,
    userId: a.userId.trim() || undefined,
    targetId: a.targetId.trim() || undefined,
    search: search.value.trim() || undefined,
    from: bounds.from,
    to: bounds.to,
    includePlatform: a.includePlatform ? 'true' : undefined,
    limit: itemsPerPage.value,
    offset: (page.value - 1) * itemsPerPage.value,
  });
}

/**
 * Al cambiar un filtro se vuelve a la primera página: mantener el offset
 * mostraría una página vacía de un resultado más corto.
 *
 * Si la página cambia, el propio `@update:page` de la tabla dispara `load()`;
 * llamarlo aquí además pediría los mismos datos dos veces.
 */
async function applyFilters(): Promise<void> {
  if (page.value !== 1) {
    page.value = 1;
    return;
  }
  await load();
}

function openFilters(): void {
  draft.value = { ...applied.value };
  filtersMenu.value = true;
}

function applyDraft(): void {
  applied.value = { ...draft.value };
  filtersMenu.value = false;
  void applyFilters();
}

/** Cuántos filtros hay puestos además de la búsqueda (para el contador del
 *  botón). El rango por defecto — 7 días — no cuenta como filtro puesto. */
const activeCount = computed(() => {
  const a = applied.value;
  let n = 0;
  if (a.domain) n++;
  if (a.range !== '7d') n++;
  if (a.userId.trim()) n++;
  if (a.targetId.trim()) n++;
  if (a.includePlatform) n++;
  return n;
});

/** Resumen legible de lo aplicado, para no obligar a abrir el menú a ver qué
 *  está acotando la lista. Cada chip se quita por separado. */
interface ActiveFilter {
  key: string;
  label: string;
  clear: () => void;
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const a = applied.value;
  const list: ActiveFilter[] = [];
  if (a.domain) {
    const found = domains.value.find((d) => d.value === a.domain);
    list.push({
      key: 'domain',
      label: found?.title ?? a.domain,
      clear: () => { applied.value = { ...a, domain: null }; },
    });
  }
  if (a.range !== '7d') {
    const found = rangeOptions.value.find((r) => r.value === a.range);
    list.push({
      key: 'range',
      label: found?.title ?? '',
      clear: () => { applied.value = { ...a, range: '7d', from: '', to: '' }; },
    });
  }
  if (a.userId.trim()) {
    list.push({
      key: 'userId',
      label: `${t('audit.filters.userId')}: ${a.userId.trim()}`,
      clear: () => { applied.value = { ...a, userId: '' }; },
    });
  }
  if (a.targetId.trim()) {
    list.push({
      key: 'targetId',
      label: `${t('audit.filters.targetId')}: ${a.targetId.trim()}`,
      clear: () => { applied.value = { ...a, targetId: '' }; },
    });
  }
  if (a.includePlatform) {
    list.push({
      key: 'platform',
      label: t('audit.filters.includePlatform'),
      clear: () => { applied.value = { ...a, includePlatform: false }; },
    });
  }
  return list;
});

function removeFilter(f: ActiveFilter): void {
  f.clear();
  void applyFilters();
}

function resetFilters(): void {
  applied.value = {
    domain: null, range: '7d', from: '', to: '',
    userId: '', targetId: '', includePlatform: false,
  };
  draft.value = { ...applied.value };
  void applyFilters();
}

// ── Detalle ────────────────────────────────────────────────────────────────
const detailOpen = ref(false);

async function openDetail(id: string): Promise<void> {
  detailOpen.value = true;
  await store.fetchDetail(id);
}

function closeDetail(): void {
  detailOpen.value = false;
  store.clearDetail();
}

/** El payload ya viene redactado del servidor; aquí solo se formatea. */
const payloadText = computed(() => {
  const payload = store.current?.payload;
  if (!payload || Object.keys(payload).length === 0) return null;
  return JSON.stringify(payload, null, 2);
});

const wasTruncated = computed(() => store.current?.payload?._truncated === true);

onMounted(load);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('audit.title')" :subtitle="$t('audit.subtitle')" />

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card class="mb-4">
      <v-card-text class="py-3">
        <div class="d-flex align-center ga-3">
          <v-text-field
            v-model="search"
            :placeholder="$t('audit.filters.searchPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            @keyup.enter="applyFilters"
            @click:clear="applyFilters"
          />

          <v-menu v-model="filtersMenu" :close-on-content-click="false" location="bottom end">
            <template #activator="{ props }">
              <v-badge :model-value="activeCount > 0" :content="activeCount" color="primary">
                <v-btn
                  v-bind="props"
                  variant="outlined"
                  density="default"
                  prepend-icon="mdi-tune-variant"
                  class="text-none"
                  @click="openFilters"
                >
                  {{ $t('audit.filters.title') }}
                </v-btn>
              </v-badge>
            </template>

            <v-card min-width="360" max-width="420">
              <v-card-text class="pb-2">
                <v-select
                  v-model="draft.domain"
                  :items="domains"
                  :label="$t('audit.filters.domain')"
                  hide-details
                  class="mb-3"
                />

                <v-select
                  v-model="draft.range"
                  :items="rangeOptions"
                  :label="$t('audit.range.label')"
                  hide-details
                  class="mb-3"
                />

                <v-row v-if="draft.range === 'custom'" dense class="mb-1">
                  <v-col cols="6">
                    <v-text-field
                      v-model="draft.from"
                      type="date"
                      :label="$t('audit.filters.from')"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field
                      v-model="draft.to"
                      type="date"
                      :label="$t('audit.filters.to')"
                      hide-details
                    />
                  </v-col>
                </v-row>

                <v-text-field
                  v-model="draft.userId"
                  :label="$t('audit.filters.userId')"
                  :placeholder="$t('audit.filters.uuidPlaceholder')"
                  hide-details
                  clearable
                  class="mb-3"
                />

                <v-text-field
                  v-model="draft.targetId"
                  :label="$t('audit.filters.targetId')"
                  :placeholder="$t('audit.filters.uuidPlaceholder')"
                  hide-details
                  clearable
                />

                <v-switch
                  v-model="draft.includePlatform"
                  :label="$t('audit.filters.includePlatform')"
                  color="primary"
                  density="compact"
                  hide-details
                  class="mt-1"
                />
              </v-card-text>

              <v-divider />
              <v-card-actions>
                <v-btn variant="text" size="small" @click="resetFilters">
                  {{ $t('audit.filters.clearAll') }}
                </v-btn>
                <v-spacer />
                <v-btn variant="text" size="small" @click="filtersMenu = false">
                  {{ $t('common.cancel') }}
                </v-btn>
                <v-btn color="primary" variant="flat" size="small" @click="applyDraft">
                  {{ $t('audit.filters.apply') }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-menu>

          <v-btn
            variant="text"
            density="comfortable"
            icon="mdi-refresh"
            :loading="store.loading"
            :title="$t('common.refresh')"
            @click="load"
          />
        </div>

        <!-- Qué está acotando la lista ahora mismo, sin abrir el menú. -->
        <div v-if="activeFilters.length" class="d-flex flex-wrap align-center ga-2 mt-3">
          <v-chip
            v-for="f in activeFilters"
            :key="f.key"
            size="small"
            color="primary"
            closable
            @click:close="removeFilter(f)"
          >
            {{ f.label }}
          </v-chip>
        </div>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table-server
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="store.items"
        :items-length="store.total"
        :loading="store.loading"
        item-value="id"
        hover
        :items-per-page-options="[
          { title: '25', value: 25 },
          { title: '50', value: 50 },
          { title: '100', value: 100 },
        ]"
        @update:page="load"
        @update:items-per-page="applyFilters"
      >
        <template #item.occurredAt="{ item }">
          <span class="text-caption text-no-wrap">{{ formatDate(item.occurredAt) }}</span>
        </template>

        <template #item.event="{ item }">
          <div class="d-flex align-center ga-2">
            <v-icon :icon="iconFor(item)" :color="colorFor(item)" size="18" />
            <div>
              <div class="text-body-2">{{ eventLabel(item) }}</div>
              <div class="text-caption text-medium-emphasis">{{ item.event }}</div>
            </div>
          </div>
        </template>

        <template #item.userEmail="{ item }">
          <div v-if="item.userEmail || item.userId">
            <div class="text-body-2">{{ item.userEmail || '—' }}</div>
            <div v-if="item.userId" class="text-caption text-medium-emphasis audit-mono">
              {{ item.userId }}
            </div>
          </div>
          <!-- Sin actor = lo hizo el sistema, o el emisor aún no lo propaga. -->
          <v-chip v-else size="x-small">{{ $t('audit.system') }}</v-chip>
        </template>

        <template #item.targetId="{ item }">
          <span class="text-caption audit-mono">{{ item.targetId || '—' }}</span>
        </template>

        <template #item.ip="{ item }">
          <span class="text-caption audit-mono">{{ item.ip || '—' }}</span>
        </template>

        <template #item.actions="{ item }">
          <v-btn size="small" variant="text" icon="mdi-eye" @click="openDetail(item.id)" />
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-8">
            <v-icon icon="mdi-clipboard-text-clock-outline" size="40" class="mb-3 d-block mx-auto" />
            {{ $t('audit.empty') }}
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="detailOpen" max-width="720">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-clipboard-text-clock-outline" />
          {{ $t('audit.detail.title') }}
        </v-card-title>
        <v-divider />

        <v-card-text>
          <div v-if="store.loadingDetail" class="text-center pa-6">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <template v-else-if="store.current">
            <v-list density="compact" class="py-0">
              <v-list-item :title="$t('audit.headers.action')" :subtitle="store.current.event" />
              <v-list-item :title="$t('audit.detail.occurredAt')" :subtitle="formatDate(store.current.occurredAt)" />
              <v-list-item
                :title="$t('audit.headers.actor')"
                :subtitle="store.current.userEmail || store.current.userId || $t('audit.system')"
              />
              <v-list-item :title="$t('audit.headers.target')" :subtitle="store.current.targetId || '—'" />
              <v-list-item :title="$t('audit.headers.ip')" :subtitle="store.current.ip || '—'" />
              <v-list-item :title="$t('audit.detail.requestId')" :subtitle="store.current.requestId || '—'" />
            </v-list>

            <div class="mt-4">
              <div class="text-subtitle-2 mb-1">{{ $t('audit.detail.payload') }}</div>
              <v-alert type="info" class="mb-2">
                {{ $t('audit.detail.redactedNotice') }}
              </v-alert>
              <v-alert v-if="wasTruncated" type="warning" class="mb-2">
                {{ $t('audit.detail.truncatedNotice') }}
              </v-alert>
              <pre v-if="payloadText" class="audit-payload">{{ payloadText }}</pre>
              <p v-else class="text-caption text-medium-emphasis">{{ $t('audit.detail.noPayload') }}</p>
            </div>
          </template>
        </v-card-text>

        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDetail">{{ $t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

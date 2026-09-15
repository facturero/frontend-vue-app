<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useAssistantStore } from '@/stores/assistant';
import { getSearchEntries, scoreMatch, type SearchEntry } from '@/menus/search';
import type { CatalogPlugin } from '@/types/plugins';

interface SearchResult {
  key: string;
  section: 'pages' | 'actions' | 'plugins' | 'assistant';
  title: string;
  subtitle?: string;
  icon: string;
  chip?: { label: string; color: string };
  score: number;
  run: () => void;
}

const MAX_PER_SECTION = 6;
/** Mismas rutas que deja abrir el menú lateral mientras la organización no está configurada. */
const allowedWhenBlocked = ['/profile', '/organization/settings', '/settings?tab=profile', '/settings?tab=organization'];

const { t, te } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const plugins = usePluginsStore();
const assistant = useAssistantStore();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchField = ref<{ focus: () => void } | null>(null);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

const canBrowsePlugins = computed(() => auth.can('plugins:read'));

/** Lo que este usuario puede abrir ahora mismo: mismo filtro que el menú lateral. */
const entries = computed(() =>
  getSearchEntries()
    .filter((e) => !e.permission || auth.can(e.permission))
    .filter((e) => plugins.isActive(e.plugin))
    .filter((e) => !auth.needsOrgSetup || allowedWhenBlocked.includes(e.to)),
);

function keywords(entry: SearchEntry): string {
  const key = `search.keywords.${entry.id}`;
  return te(key) ? t(key) : '';
}

function go(to: string): void {
  open.value = false;
  void router.push(to);
}

/** Un plugin activo lleva a su módulo; el resto, al catálogo ya filtrado por su nombre. */
function pluginDestination(plugin: CatalogPlugin): string {
  if (plugins.isActive(plugin.code)) {
    const page = entries.value.find((e) => e.group === 'pages' && e.plugin === plugin.code);
    if (page) return page.to;
  }
  return `/plugins?q=${encodeURIComponent(plugin.name)}`;
}

const pluginStatusColor: Record<CatalogPlugin['display_status'], string> = {
  disponible: 'lightsuccess',
  comprado: 'lightprimary',
  en_construccion: 'lightwarning',
  desactivado: 'grey',
  incluido: 'lightinfo',
};

function askAssistant(text: string): void {
  open.value = false;
  // Conversación nueva: la búsqueda no debe colarse en el hilo que estuviera abierto.
  assistant.reset();
  if (!assistant.open) assistant.toggle();
  void assistant.send(text);
}

const results = computed<SearchResult[]>(() => {
  const q = query.value.trim();

  const entryResults = entries.value
    .map((entry) => {
      const title = t(entry.titleKey);
      return {
        key: entry.id,
        section: entry.group,
        title,
        icon: entry.icon,
        // Sin consulta se enseña todo en el orden del menú, como lanzador rápido.
        score: q ? scoreMatch(q, title, keywords(entry)) : 1,
        run: () => go(entry.to),
      } satisfies SearchResult;
    })
    .filter((r) => r.score > 0);

  const pluginResults: SearchResult[] = !q || !canBrowsePlugins.value
    ? []
    : plugins.catalog
      .map((plugin) => ({
        key: `plugin:${plugin.code}`,
        section: 'plugins' as const,
        title: plugin.name,
        subtitle: plugin.description,
        icon: 'mdi-puzzle-outline',
        chip: { label: t(`plugins.status.${plugin.display_status}`), color: pluginStatusColor[plugin.display_status] },
        score: scoreMatch(q, plugin.name, `${plugin.code} ${plugin.category} ${plugin.description}`),
        run: () => go(pluginDestination(plugin)),
      }))
      .filter((r) => r.score > 0);

  const bySection = (section: SearchResult['section'], list: SearchResult[]) =>
    list
      .filter((r) => r.section === section)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? MAX_PER_SECTION : undefined);

  const list = [
    ...bySection('pages', entryResults),
    ...bySection('actions', entryResults),
    ...bySection('plugins', pluginResults),
  ];

  // Buscar por funcionalidad a veces no cabe en un título: se le deja la pregunta al asistente.
  if (q.length >= 3) {
    list.push({
      key: 'assistant',
      section: 'assistant',
      title: t('search.askAssistant', { query: q }),
      icon: 'mdi-robot-outline',
      score: 0,
      run: () => askAssistant(q),
    });
  }
  return list;
});

const sections = computed(() => {
  const order: SearchResult['section'][] = ['pages', 'actions', 'plugins', 'assistant'];
  let index = 0;
  return order
    .map((section) => ({
      section,
      items: results.value
        .filter((r) => r.section === section)
        .map((r) => ({ ...r, index: index++ })),
    }))
    .filter((s) => s.items.length > 0);
});

const hasMatches = computed(() => results.value.some((r) => r.section !== 'assistant'));

watch(query, () => {
  activeIndex.value = 0;
});

watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = '';
    return;
  }
  if (canBrowsePlugins.value && plugins.catalog.length === 0 && !plugins.loading) {
    void plugins.fetchCatalog();
  }
});

function moveActive(delta: number): void {
  const total = results.value.length;
  if (total === 0) return;
  activeIndex.value = (activeIndex.value + delta + total) % total;
  void nextTick(() => {
    document.getElementById(`global-search-item-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' });
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    results.value[activeIndex.value]?.run();
  }
}

/** Ctrl+K / ⌘K desde cualquier sitio, y "/" cuando no se está escribiendo en un campo. */
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    open.value = !open.value;
    return;
  }
  const target = event.target as HTMLElement | null;
  const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (event.key === '/' && !typing && !open.value) {
    event.preventDefault();
    open.value = true;
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));
</script>

<template>
  <!-- Como en Modernize: lupa suelta junto a la hamburguesa que despliega el buscador debajo. -->
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom start"
    :offset="8"
    width="420"
    max-width="calc(100vw - 24px)"
    @after-enter="searchField?.focus()"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        icon
        :title="`${$t('search.open')} (${shortcutLabel})`"
        :aria-label="$t('search.open')"
      >
        <v-icon icon="mdi-magnify" />
      </v-btn>
    </template>

    <v-card>
      <v-text-field
        ref="searchField"
        v-model="query"
        :placeholder="$t('search.placeholder')"
        prepend-inner-icon="mdi-magnify"
        variant="solo"
        density="comfortable"
        flat
        clearable
        hide-details
        @keydown="onKeydown"
      />
      <v-divider />

      <v-list nav density="compact" max-height="420" class="overflow-y-auto">
        <template v-for="block in sections" :key="block.section">
          <v-list-subheader>{{ $t(`search.sections.${block.section}`) }}</v-list-subheader>
          <v-list-item
            v-for="item in block.items"
            :id="`global-search-item-${item.index}`"
            :key="item.key"
            :active="item.index === activeIndex"
            :prepend-icon="item.icon"
            :title="item.title"
            :subtitle="item.subtitle"
            color="primary"
            rounded="lg"
            @click="item.run()"
            @mousemove="activeIndex = item.index"
          >
            <template v-if="item.chip" #append>
              <v-chip size="x-small" variant="flat" :color="item.chip.color">{{ item.chip.label }}</v-chip>
            </template>
          </v-list-item>
        </template>

        <v-list-item v-if="query.trim() && !hasMatches" :title="$t('search.noResults', { query: query.trim() })" disabled />
      </v-list>

      <v-divider />
      <div class="d-flex ga-4 px-4 py-2 text-caption text-medium-emphasis">
        <span>↑↓ {{ $t('search.hintNavigate') }}</span>
        <span>↵ {{ $t('search.hintOpen') }}</span>
        <span>Esc {{ $t('search.hintClose') }}</span>
      </div>
    </v-card>
  </v-menu>
</template>

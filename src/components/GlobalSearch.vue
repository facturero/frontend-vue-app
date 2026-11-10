<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useAssistantStore } from '@/stores/assistant';
import { getSearchEntries, scoreMatch, type SearchEntry } from '@/menus/search';
import { projectsApi } from '@/api/projects';
import CommandPalette, { type PaletteItem } from '@/components/ui/CommandPalette.vue';
import type { CatalogPlugin } from '@/types/plugins';
import type { SearchResult as ProjectSearchResult } from '@/types/projects';

/**
 * Búsqueda global (Ctrl+K / ⌘K, o «/» fuera de un campo): pantallas, acciones rápidas, plugins y, si la organización usa Proyectos,
 * proyectos y tareas (como la barra de Asana). Va sobre la paleta de comandos de Vuetify (`CommandPalette`); el orden y la
 * puntuación son nuestros, y lo de Proyectos lo busca el servidor, que solo devuelve lo que quien busca puede ver.
 */
type Section = 'pages' | 'actions' | 'plugins' | 'projects' | 'tasks' | 'assistant';

interface SearchResult {
  key: string;
  section: Section;
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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

const canBrowsePlugins = computed(() => auth.can('plugins:read'));
const canSearchProjects = computed(() => plugins.isActive('projects.tasks_kanban') && auth.can('project:read') && !auth.needsOrgSetup);

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

function go(to: string | { path: string; query?: Record<string, string> }): void {
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

// ── Proyectos y tareas: los busca el servidor, con una pausa para no preguntar en cada tecla ──
const projectHits = ref<ProjectSearchResult | null>(null);
const searchingProjects = ref(false);
let projectTimer: ReturnType<typeof setTimeout> | undefined;

watch(query, (value) => {
  clearTimeout(projectTimer);
  const q = value.trim();
  if (!canSearchProjects.value || q.length < 2) {
    projectHits.value = null;
    searchingProjects.value = false;
    return;
  }
  searchingProjects.value = true;
  projectTimer = setTimeout(async () => {
    try {
      const out = await projectsApi.search(q);
      // Si mientras tanto se siguió escribiendo, esta respuesta ya no vale.
      if (query.value.trim() === q) projectHits.value = out;
    } catch {
      // Sin Proyectos la búsqueda sigue sirviendo para lo demás.
      projectHits.value = null;
    } finally {
      if (query.value.trim() === q) searchingProjects.value = false;
    }
  }, 250);
});

const projectResults = computed<SearchResult[]>(() => {
  const hits = projectHits.value;
  if (!hits) return [];
  const projects = hits.projects.slice(0, MAX_PER_SECTION).map((p) => ({
    key: `project:${p.id}`,
    section: 'projects' as const,
    title: p.name,
    icon: p.icon || 'mdi-folder-outline',
    score: 1,
    run: () => go(`/projects/${p.id}`),
  }));
  const tasks = hits.tasks.slice(0, MAX_PER_SECTION).map((task) => {
    const first = task.projects[0];
    return {
      key: `task:${task.id}`,
      section: 'tasks' as const,
      title: task.title,
      subtitle: task.projects.map((p) => p.name).join(' · ') || t('projects.task.personal'),
      icon: task.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline',
      score: 1,
      // La tarea se abre en su proyecto (`?task=` abre el panel); si no tiene, desde «Mis tareas».
      run: () => go(first ? { path: `/projects/${first.projectId}`, query: { task: task.id } } : { path: '/my-tasks', query: { task: task.id } }),
    };
  });
  return [...projects, ...tasks];
});

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

  const bySection = (section: Section, list: SearchResult[]) =>
    list
      .filter((r) => r.section === section)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? MAX_PER_SECTION : undefined);

  const list = [
    ...bySection('pages', entryResults),
    ...bySection('actions', entryResults),
    ...projectResults.value,
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

/** Lo que pinta la paleta: un subtítulo por grupo y sus filas, en el orden de `results`. */
const paletteItems = computed<PaletteItem[]>(() => {
  const order: Section[] = ['pages', 'actions', 'projects', 'tasks', 'plugins', 'assistant'];
  const items: PaletteItem[] = [];
  for (const section of order) {
    const rows = results.value.filter((r) => r.section === section);
    if (rows.length === 0) continue;
    items.push({ type: 'subheader', title: t(`search.sections.${section}`) });
    for (const r of rows) items.push({ title: r.title, subtitle: r.subtitle, prependIcon: r.icon, value: r.key, chip: r.chip, onClick: r.run });
  }
  return items;
});

const placeholder = computed(() => (canSearchProjects.value ? t('search.placeholderWithProjects') : t('search.placeholder')));

watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = '';
    return;
  }
  if (canBrowsePlugins.value && plugins.catalog.length === 0 && !plugins.loading) {
    void plugins.fetchCatalog();
  }
});

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
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  clearTimeout(projectTimer);
});
</script>

<template>
  <!-- La lupa junto a la hamburguesa abre la paleta; Ctrl+K y «/» también. -->
  <CommandPalette v-model="open" v-model:search="query" :items="paletteItems" :placeholder="placeholder">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon
        :title="`${$t('search.open')} (${shortcutLabel})`"
        :aria-label="$t('search.open')"
      >
        <v-icon icon="mdi-magnify" />
      </v-btn>
    </template>
    <template #no-data>
      <div class="pa-4 text-body-medium text-medium-emphasis">
        {{ searchingProjects ? $t('search.searching') : $t('search.noResults', { query: query.trim() }) }}
      </div>
    </template>
  </CommandPalette>
</template>

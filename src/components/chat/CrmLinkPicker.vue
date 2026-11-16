<script setup lang="ts">
import { computed, mergeProps, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { availableCrmEntities, CRM_SOURCES, type CrmEntity, type CrmLinkAttrs, type CrmOption } from '@/utils/crm-links';

/**
 * Buscador de registros del CRM para poner una tarjeta en un mensaje: el botón junto a «Enviar» o «/» en el editor vacío lo abren.
 * Solo ofrece los tipos cuyo módulo está activo y que la persona puede leer (el mismo criterio que «Vinculado a» de Proyectos).
 * Sin ninguno disponible no se muestra.
 */
const open = defineModel<boolean>('open', { default: false });
withDefaults(defineProps<{ size?: string }>(), { size: 'default' });
const emit = defineEmits<{ pick: [CrmLinkAttrs] }>();
const { t } = useI18n();
const auth = useAuthStore();
const plugins = usePluginsStore();

const available = computed(() => availableCrmEntities((p) => plugins.isActive(p), (p) => auth.can(p)));
const typeItems = computed(() => available.value.map((e) => ({ value: e, title: t(`chat.crm.type.${e}`), props: { prependIcon: CRM_SOURCES[e].icon } })));

const type = ref<CrmEntity | null>(null);
const query = ref('');
const results = ref<CrmOption[]>([]);
const searching = ref(false);
const searchField = ref<{ focus: () => void } | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let ticket = 0;

watch(open, async (isOpen) => {
  if (!isOpen) return;
  if (!type.value || !available.value.includes(type.value)) type.value = available.value[0] ?? null;
  query.value = '';
  void search();
  await nextTick();
  searchField.value?.focus();
});
watch(type, () => void search());
watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void search(), 300);
});

async function search(): Promise<void> {
  if (!type.value || !open.value) return;
  // Respuestas fuera de orden (escribir rápido, cambiar de tipo): solo vale la última búsqueda.
  const mine = ++ticket;
  searching.value = true;
  try {
    const found = await CRM_SOURCES[type.value].search(query.value.trim());
    if (mine === ticket) results.value = found;
  } catch {
    if (mine === ticket) results.value = [];
  } finally {
    if (mine === ticket) searching.value = false;
  }
}

function pick(option: CrmOption | null): void {
  if (!option || !type.value) return;
  open.value = false;
  emit('pick', { entityType: type.value, entityId: option.entityId, label: option.title });
}
</script>

<template>
  <v-menu v-if="available.length" v-model="open" location="top end" :close-on-content-click="false">
    <template #activator="{ props: menu }">
      <v-tooltip location="top" :text="t('chat.crm.add')">
        <template #activator="{ props: tip }">
          <v-btn v-bind="mergeProps(menu, tip)" icon="mdi-link-variant-plus" variant="text" :size="size" :aria-label="t('chat.crm.add')" />
        </template>
      </v-tooltip>
    </template>
    <v-card min-width="320" max-width="400" class="pa-4 d-flex flex-column ga-2">
      <v-select v-model="type" :items="typeItems" :label="t('chat.crm.what')" />
      <v-autocomplete
        ref="searchField"
        v-model:search="query"
        :items="results"
        item-title="title"
        item-value="entityId"
        :loading="searching"
        :label="t('chat.crm.search')"
        :no-data-text="type === 'task' && !query ? t('chat.crm.typeToSearch') : t('chat.crm.none')"
        no-filter
        return-object
        @update:model-value="(v: CrmOption | null) => pick(v)"
      >
        <template #item="{ props: item, item: option }">
          <v-list-item v-bind="item" :subtitle="option.subtitle" />
        </template>
      </v-autocomplete>
    </v-card>
  </v-menu>
</template>

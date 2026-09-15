<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useLocale, type LanguageOption } from '@/composable/useLocale';
import { normalize } from '@/menus/search';

type MenuLocation = 'bottom end' | 'start';

withDefaults(defineProps<{ location?: MenuLocation }>(), { location: 'bottom end' });

const { locale, languages, setLocale } = useLocale();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchField = ref<{ focus: () => void } | null>(null);

const current = computed(() => languages.value.find((lang) => lang.code === locale.value));

/**
 * Pensado para decenas de idiomas: se busca por el nombre nativo ("Deutsch"),
 * por el nombre en el idioma de la interfaz ("Alemán") o por el código ("de"),
 * sin importar mayúsculas ni tildes.
 */
const filtered = computed<LanguageOption[]>(() => {
  const q = normalize(query.value ?? '');
  if (!q) return languages.value;
  return languages.value.filter(({ code, nativeName, localizedName }) =>
    [code, nativeName, localizedName].some((text) => normalize(text).includes(q)),
  );
});

watch(query, () => {
  activeIndex.value = 0;
});

watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = '';
    return;
  }
  // Al abrir, el resaltado arranca en el idioma actual y no en el primero de la lista.
  activeIndex.value = Math.max(0, filtered.value.findIndex((lang) => lang.code === locale.value));
});

function choose(code: string): void {
  setLocale(code);
  open.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  const total = filtered.value.length;
  if (event.key === 'Enter') {
    event.preventDefault();
    const lang = filtered.value[activeIndex.value];
    if (lang) choose(lang.code);
    return;
  }
  if (total === 0 || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
  event.preventDefault();
  activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + total) % total;
  void nextTick(() => {
    document.getElementById(`locale-option-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' });
  });
}
</script>

<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    :location="location"
    :offset="8"
    @after-enter="searchField?.focus()"
  >
    <template #activator="{ props: menuProps }">
      <!-- Quien lo usa puede poner su propio activador (p. ej. una fila de lista); por defecto, un botón con bandera. -->
      <slot name="activator" :props="menuProps" :current="current">
        <v-btn v-bind="menuProps" variant="text" class="px-2" :aria-label="$t('common.language')">
          <span v-if="current" :class="`fi fi-${current.flag}`" class="rounded-sm elevation-1 mr-2" />
          <span class="text-body-2 font-weight-medium">{{ current?.nativeName }}</span>
          <v-icon icon="mdi-chevron-down" size="18" class="ml-1 text-medium-emphasis" />
        </v-btn>
      </slot>
    </template>

    <v-card width="280">
      <v-text-field
        ref="searchField"
        v-model="query"
        :placeholder="$t('common.search')"
        prepend-inner-icon="mdi-magnify"
        variant="solo"
        flat
        clearable
        hide-details
        @keydown="onKeydown"
      />
      <v-divider />

      <v-list density="compact" max-height="300" class="overflow-y-auto">
        <v-list-item
          v-for="(lang, index) in filtered"
          :id="`locale-option-${index}`"
          :key="lang.code"
          :active="index === activeIndex"
          :title="lang.nativeName"
          :subtitle="lang.localizedName !== lang.nativeName ? lang.localizedName : undefined"
          color="primary"
          rounded="lg"
          class="mx-1"
          @click="choose(lang.code)"
          @mousemove="activeIndex = index"
        >
          <template #prepend>
            <span :class="`fi fi-${lang.flag}`" class="rounded-sm elevation-1 mr-3" />
          </template>
          <template v-if="lang.code === locale" #append>
            <v-icon icon="mdi-check" size="18" color="primary" />
          </template>
        </v-list-item>

        <v-list-item v-if="filtered.length === 0" :title="$t('common.noData')" disabled />
      </v-list>
    </v-card>
  </v-menu>
</template>

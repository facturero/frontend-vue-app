<script setup lang="ts">
import { computed } from 'vue';
import { useLocale, type LanguageOption } from '@/composable/useLocale';
import { normalize } from '@/menus/search';

defineProps<{ label?: string }>();

const { locale, languages, setLocale } = useLocale();

const current = computed(() => languages.value.find((lang) => lang.code === locale.value));

/**
 * Pensado para decenas de idiomas: se busca por el nombre nativo ("Deutsch"),
 * por el nombre en el idioma de la interfaz ("Alemán") o por el código ("de"),
 * sin importar mayúsculas ni tildes.
 */
function filterLanguage(_value: string, query: string, item?: { raw: LanguageOption }): boolean {
  if (!item) return false;
  const q = normalize(query);
  const { code, nativeName, localizedName } = item.raw;
  return [code, nativeName, localizedName].some((text) => normalize(text).includes(q));
}

function onSelect(code: string | null): void {
  if (code) setLocale(code);
}
</script>

<template>
  <v-autocomplete
    :model-value="locale"
    :items="languages"
    item-value="code"
    item-title="nativeName"
    :label="label"
    :custom-filter="filterLanguage"
    :aria-label="$t('common.language')"
    :menu-props="{ maxHeight: 320 }"
    auto-select-first
    hide-details
    @update:model-value="onSelect"
  >
    <template #prepend-inner>
      <span v-if="current" :class="`fi fi-${current.flag}`" class="rounded-sm elevation-1" />
    </template>

    <template #item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        :title="item.raw.nativeName"
        :subtitle="item.raw.localizedName !== item.raw.nativeName ? item.raw.localizedName : undefined"
      >
        <template #prepend>
          <span :class="`fi fi-${item.raw.flag}`" class="rounded-sm elevation-1 mr-3" />
        </template>
        <template v-if="item.raw.code === locale" #append>
          <v-icon icon="mdi-check" size="18" color="primary" />
        </template>
      </v-list-item>
    </template>

    <template #no-data>
      <v-list-item :title="$t('common.noData')" disabled />
    </template>
  </v-autocomplete>
</template>

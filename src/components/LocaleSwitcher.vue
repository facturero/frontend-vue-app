<script setup lang="ts">
import { computed } from 'vue';
import { useLocale } from '@/composable/useLocale';

const { locale, setLocale } = useLocale();

const languages = [
  { code: 'es', label: 'Español', icon: '🇪🇸' },
  { code: 'en', label: 'English', icon: '🇺🇸' },
  { code: 'fr', label: 'Français', icon: '🇫🇷' },
];

const current = computed(() => languages.find((lang) => lang.code === locale.value) ?? languages[0]);
</script>

<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="text" class="text-none px-2" size="small">
        <span class="text-body-2">{{ current.icon }}</span>
        <span class="text-body-2 font-weight-medium ml-1">{{ current.code.toUpperCase() }}</span>
        <v-icon icon="mdi-chevron-down" size="16" class="ml-1 text-medium-emphasis" />
      </v-btn>
    </template>

    <v-list density="compact" min-width="170" class="py-1">
      <v-list-item
        v-for="lang in languages"
        :key="lang.code"
        rounded="lg"
        class="mx-1"
        :active="locale === lang.code"
        color="primary"
        @click="setLocale(lang.code)"
      >
        <template #prepend>
          <span class="mr-2">{{ lang.icon }}</span>
        </template>
        <v-list-item-title class="text-body-2">{{ lang.label }}</v-list-item-title>
        <template v-if="locale === lang.code" #append>
          <v-icon icon="mdi-check" size="16" color="primary" />
        </template>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

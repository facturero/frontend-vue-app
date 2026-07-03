<script setup lang="ts">
import { useLocale } from '@/composable/useLocale';

const { locale, setLocale } = useLocale();

const languages = [
  { code: 'es', label: 'Español', icon: '🇪🇸' },
  { code: 'en', label: 'English', icon: '🇺🇸' },
  { code: 'fr', label: 'Français', icon: '🇫🇷' },
];
</script>

<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn icon v-bind="props" variant="plain">
        <v-icon icon="mdi-translate" />
      </v-btn>
    </template>

    <v-card>
      <v-list density="comfortable">
        <v-list-item
          v-for="lang in languages"
          :key="lang.code"
          @click="setLocale(lang.code)"
          rounded="lg"
          :active="locale === lang.code"
          color="primary"
        >
          <v-list-item-title>{{ lang.label }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

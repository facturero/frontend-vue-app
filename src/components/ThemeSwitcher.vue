<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppThemeStore } from '@/stores/appTheme';
import { useNotify } from '@/composable/useNotify';
import type { ThemeRef } from '@/types/appTheme';

/**
 * «Tema» en el menú del avatar: claro, oscuro, como el sistema y los temas de la empresa. Si la empresa fijó su tema y esta
 * persona no administra la organización, se ve cuál es pero no se puede cambiar (docs/TEMAS.md).
 *
 * «El de la empresa» (`null`) es una opción aparte de elegir ese mismo tema a mano: quien la tiene sigue a la empresa si esta
 * cambia su tema; quien eligió uno concreto se queda con el suyo.
 */
const { t } = useI18n();
const store = useAppThemeStore();
const notify = useNotify();
const open = ref(false);

interface Option {
  value: ThemeRef | null;
  title: string;
  icon: string;
  swatch?: string;
}

function nameOf(ref: ThemeRef): string {
  if (ref === 'light' || ref === 'dark' || ref === 'system') return t(`themes.builtin.${ref}`);
  return store.themes.find((th) => th.id === ref)?.name ?? t('themes.builtin.light');
}

const options = computed<Option[]>(() => [
  { value: null, title: t('themes.companyDefault', { name: nameOf(store.settings.defaultTheme) }), icon: 'mdi-domain' },
  { value: 'light', title: t('themes.builtin.light'), icon: 'mdi-weather-sunny' },
  { value: 'dark', title: t('themes.builtin.dark'), icon: 'mdi-weather-night' },
  { value: 'system', title: t('themes.builtin.system'), icon: 'mdi-theme-light-dark' },
  ...store.themes.map((th) => ({ value: th.id, title: th.name, icon: 'mdi-palette-outline', swatch: th.config.colors.primary })),
]);

/** Lo que se ve a la derecha de la fila del menú: el tema que se está viendo. */
const currentLabel = computed(() => nameOf(store.effectiveRef));

async function choose(value: ThemeRef | null): Promise<void> {
  open.value = false;
  try {
    await store.choose(value);
  } catch (e) {
    notify.error(e);
  }
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="start" :offset="8">
    <template #activator="{ props: menuProps }">
      <slot name="activator" :props="menuProps" :current="currentLabel" :locked="store.locked" />
    </template>

    <v-card width="280" data-theme-switcher>
      <v-alert v-if="store.locked" type="info" class="ma-2" data-theme-locked>
        {{ $t('themes.lockedByCompany') }}
      </v-alert>
      <v-list density="compact" max-height="360" class="overflow-y-auto">
        <v-list-item
          v-for="opt in options"
          :key="opt.value ?? 'company'"
          :title="opt.title"
          :prepend-icon="opt.icon"
          :disabled="store.locked"
          :active="!store.locked && store.myChoice === opt.value"
          color="primary"
          rounded="lg"
          class="mx-1"
          :data-theme-option="opt.value ?? 'company'"
          @click="choose(opt.value)"
        >
          <template v-if="opt.swatch" #append>
            <v-avatar :color="opt.swatch" size="16" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

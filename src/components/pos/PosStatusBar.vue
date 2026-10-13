<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';

/**
 * Barra de estado, como la de la caja de escritorio: versión a la izquierda y, a la derecha, el estado de la conexión, la hora y el
 * cambio claro/oscuro (si el tema lo permite). Arriba o abajo según el tema. No se puede ocultar. Sin cable ni Wi-Fi que distinguir:
 * el navegador solo sabe si hay conexión.
 */
const { locale, t } = useI18n();
const theme = usePosCashierThemeStore();

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const now = ref(new Date());
let clock: ReturnType<typeof setInterval> | undefined;

const setOnline = (): void => {
  online.value = navigator.onLine;
};

onMounted(() => {
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  clock = setInterval(() => {
    now.value = new Date();
    theme.tick();
  }, 15_000);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', setOnline);
  window.removeEventListener('offline', setOnline);
  clearInterval(clock);
});

const time = computed(() => now.value.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }));
const version = computed(() => (import.meta.env.DEV ? t('pos.status.dev') : t('pos.status.web')));
</script>

<template>
  <footer class="pk-status" :class="{ 'pk-status--top': theme.config.layout.statusBarPosition === 'top' }">
    <span>{{ version }}</span>
    <div class="pk-status__side">
      <span class="pk-status__item" :class="online ? 'pk-tone-ok' : 'pk-tone-bad'">
        <i class="mdi" :class="online ? 'mdi-wifi' : 'mdi-lan-disconnect'" />
        {{ online ? $t('pos.status.online') : $t('pos.status.offline') }}
      </span>
      <span class="pk-status__item"><i class="mdi mdi-clock-outline" />{{ time }}</span>
      <button
        v-if="theme.canToggleMode"
        type="button"
        :title="theme.mode === 'dark' ? $t('pos.status.lightMode') : $t('pos.status.darkMode')"
        :aria-label="theme.mode === 'dark' ? $t('pos.status.lightMode') : $t('pos.status.darkMode')"
        @click="theme.toggleMode()"
      >
        <i class="mdi" :class="theme.mode === 'dark' ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { baseColorsOf } from '@/stores/appTheme';
import { deriveThemeColors, type AppThemeConfig } from '@/types/appTheme';

/**
 * Vista previa del editor de temas: una maqueta pequeña de la aplicación (barra superior, menú lateral con un elemento activo,
 * una tarjeta con título, texto secundario, un botón principal y etiquetas de estado) pintada con la paleta que saldría del tema
 * (`deriveThemeColors`, la misma que se registra en Vuetify al aplicarlo).
 *
 * Vive dentro del diálogo porque el diálogo tiene velo: la aplicación de detrás queda oscurecida y ya no sirve de vista previa.
 * Los colores son datos del tema que se edita, no decisiones de diseño: van por `color` / `:style`, nunca escritos a mano.
 */
const props = defineProps<{ config: AppThemeConfig }>();
const { t } = useI18n();

const c = computed(() => deriveThemeColors(props.config, baseColorsOf(props.config.base)));
const text = (k: string, alpha = 1) => ({ color: c.value[k], opacity: alpha });
</script>

<template>
  <v-sheet :color="c.background" rounded="lg" class="border overflow-hidden d-flex flex-column" height="300" data-theme-preview>
    <!-- Barra superior -->
    <v-sheet :color="c.surface" height="36" rounded="0" class="d-flex align-center ga-2 px-3 flex-0-0" :style="{ borderBottom: `1px solid ${c.borderColor}` }">
      <v-icon icon="mdi-menu" size="16" :style="text('on-surface', 0.7)" />
      <v-sheet :color="c.grey100" height="16" width="90" rounded="pill" />
      <v-spacer />
      <v-icon icon="mdi-bell-outline" size="16" :style="text('on-surface', 0.7)" />
      <v-avatar :color="c.primary" size="20">
        <span class="text-body-small" :style="text('on-primary')">AB</span>
      </v-avatar>
    </v-sheet>

    <div class="d-flex flex-1-1">
      <!-- Menú lateral -->
      <v-sheet :color="c.surface" width="44" rounded="0" class="d-flex flex-column align-center ga-2 py-2 flex-0-0" :style="{ borderRight: `1px solid ${c.borderColor}` }">
        <v-sheet :color="c.primary" width="28" height="28" rounded="lg" class="d-flex align-center justify-center">
          <v-icon icon="mdi-view-dashboard-outline" size="16" :style="text('on-primary')" />
        </v-sheet>
        <v-icon icon="mdi-forum-outline" size="16" :style="text('on-surface', 0.6)" />
        <v-icon icon="mdi-account-group-outline" size="16" :style="text('on-surface', 0.6)" />
        <v-icon icon="mdi-package-variant-closed" size="16" :style="text('on-surface', 0.6)" />
      </v-sheet>

      <!-- Página -->
      <div class="d-flex flex-column ga-2 pa-3 flex-1-1 overflow-hidden">
        <v-sheet :color="c.lightprimary" rounded="lg" class="px-3 py-2">
          <div class="text-body-medium font-weight-medium" :style="text('on-background')">{{ t('themes.preview.page') }}</div>
        </v-sheet>
        <v-sheet :color="c.surface" rounded="lg" class="pa-3 d-flex flex-column ga-2" :style="{ border: `1px solid ${c.borderColor}` }">
          <div class="text-body-medium font-weight-medium" :style="text('on-surface')">{{ t('themes.preview.card') }}</div>
          <div class="text-body-small" :style="text('on-surface', 0.65)">{{ t('themes.preview.secondary') }}</div>
          <div class="d-flex flex-wrap ga-1">
            <v-sheet :color="c.lightsuccess" rounded="pill" class="px-2">
              <span class="text-body-small" :style="text('on-lightsuccess')">{{ t('themes.preview.paid') }}</span>
            </v-sheet>
            <v-sheet :color="c.lightwarning" rounded="pill" class="px-2">
              <span class="text-body-small" :style="text('on-lightwarning')">{{ t('themes.preview.pending') }}</span>
            </v-sheet>
            <v-sheet :color="c.lighterror" rounded="pill" class="px-2">
              <span class="text-body-small" :style="text('on-lighterror')">{{ t('themes.preview.overdue') }}</span>
            </v-sheet>
          </div>
          <div class="d-flex ga-2 mt-1">
            <v-sheet :color="c.primary" rounded="lg" class="px-3 py-1">
              <span class="text-body-small font-weight-medium" :style="text('on-primary')">{{ t('themes.preview.primaryAction') }}</span>
            </v-sheet>
            <v-sheet :color="c.secondary" rounded="lg" class="px-3 py-1">
              <span class="text-body-small font-weight-medium" :style="text('on-secondary')">{{ t('themes.preview.secondaryAction') }}</span>
            </v-sheet>
          </div>
        </v-sheet>
      </div>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { baseColorsOf, useAppThemeStore } from '@/stores/appTheme';
import { useNotify } from '@/composable/useNotify';
import type { AppThemeConfig, ThemeRef } from '@/types/appTheme';
import ThemeTile, { type TilePalette } from '@/components/themes/ThemeTile.vue';

/**
 * El diálogo «Tema» (lo abre la fila «Tema» del menú del avatar): un cuadro por tema (miniatura con sus colores y su nombre, como
 * en Slack). Vive FUERA del menú del avatar (AppTopBar): si estuviera dentro, cerrar el menú desmontaría el diálogo, y dejar el
 * menú abierto detrás obligaba a cerrarlo después a mano.
 * Claro, oscuro, como el sistema y los temas de la empresa. Si la empresa fijó su tema y esta persona no administra la
 * organización, se ve cuál es pero no se puede cambiar (docs/TEMAS.md).
 *
 * «El de la empresa» (`null`) solo se ofrece si la empresa tiene un tema PROPIO como tema de la empresa: quien lo elige lo sigue
 * aunque la empresa lo cambie. Si la empresa nunca creó un tema, esa opción sería un «Claro» repetido y no aparece (decisión del
 * dueño, 2026-11-18).
 */
const { t } = useI18n();
const store = useAppThemeStore();
const notify = useNotify();
const open = defineModel<boolean>({ required: true });

interface Option {
  value: ThemeRef | null;
  name: string;
  caption?: string;
  palette: TilePalette;
  split?: TilePalette;
}

function paletteOfBase(base: 'light' | 'dark'): TilePalette {
  const c = baseColorsOf(base);
  return { primary: c.primary, background: c.background, surface: c.surface, text: c['on-surface'] };
}

function paletteOf(config: AppThemeConfig): TilePalette {
  const { primary, background, surface, text } = config.colors;
  return { primary, background, surface, text };
}

/** El tema propio que la empresa eligió para todos, si lo hay. */
const companyTheme = computed(() => store.themes.find((th) => th.id === store.settings.defaultTheme) ?? null);

const options = computed<Option[]>(() => {
  const light = paletteOfBase('light');
  const dark = paletteOfBase('dark');
  const list: Option[] = [];
  if (companyTheme.value) {
    list.push({ value: null, name: t('themes.companyOption'), caption: companyTheme.value.name, palette: paletteOf(companyTheme.value.config) });
  }
  list.push(
    { value: 'light', name: t('themes.builtin.light'), palette: light },
    { value: 'dark', name: t('themes.builtin.dark'), palette: dark },
    { value: 'system', name: t('themes.builtin.system'), palette: light, split: dark },
  );
  for (const th of store.themes) list.push({ value: th.id, name: th.name, caption: t('themes.ofCompany'), palette: paletteOf(th.config) });
  return list;
});

/**
 * El cuadro marcado. Fijado: el de la empresa (o el integrado que fijó). Sin elección propia: «El de la empresa» si se ofrece, si
 * no el integrado que la empresa tiene por defecto (claro, si nunca tocó nada).
 */
function isSelected(opt: Option): boolean {
  if (store.locked || store.myChoice === null) return companyTheme.value ? opt.value === null : opt.value === store.settings.defaultTheme;
  return opt.value === store.myChoice;
}

async function choose(value: ThemeRef | null): Promise<void> {
  try {
    await store.choose(value);
  } catch (e) {
    notify.error(e);
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="880" scrollable>

    <v-card data-theme-switcher>
      <v-card-title class="d-flex align-center">
        <span class="flex-1-1">{{ t('themes.dialogTitle') }}</span>
        <v-btn icon="mdi-close" variant="text" :aria-label="t('common.close')" @click="open = false" />
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('themes.dialogIntro') }}</div>
        <v-alert v-if="store.locked" type="info" data-theme-locked>{{ t('themes.lockedByCompany') }}</v-alert>
        <v-row dense>
          <v-col v-for="opt in options" :key="opt.value ?? 'company'" cols="6" sm="4" md="3">
            <ThemeTile
              :name="opt.name"
              :caption="opt.caption"
              :palette="opt.palette"
              :split="opt.split"
              :selected="isSelected(opt)"
              :disabled="store.locked"
              :data-theme-option="opt.value ?? 'company'"
              @select="choose(opt.value)"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useAppThemeStore, baseColorsOf } from '@/stores/appTheme';
import ThemePreview from '@/components/themes/ThemePreview.vue';
import { useConfirm } from '@/composable/useConfirm';
import { extractError, extractErrorCode } from '@/utils/error';
import { isValidHexColor } from '@/types/posTheme';
import {
  APP_THEME_COLOR_TOKENS,
  CONTRAST_MIN_ADVISORY,
  CONTRAST_MIN_BLOCKING,
  configFromBase,
  contrastPairs,
  type AppThemeBase,
  type AppThemeColorToken,
  type AppThemeConfig,
  type AppThemeDTO,
} from '@/types/appTheme';

/**
 * Crear o editar un tema de la empresa, en un diálogo normal (con velo; decisión del dueño, 2026-11-18: ni panel lateral ni
 * diálogo sin velo). Como el velo oscurece la aplicación, la vista previa va DENTRO del diálogo (`ThemePreview`): una maqueta de
 * la aplicación con la paleta que saldría del tema. Formulario a la izquierda y vista previa a la derecha; en teléfono, a
 * pantalla completa y la vista previa debajo del formulario (REGLAS-FRONT R-96).
 */
const props = defineProps<{ theme: AppThemeDTO | null }>();
const open = defineModel<boolean>({ required: true });

const { t } = useI18n();
const { mobile } = useDisplay();
const store = useAppThemeStore();
const confirm = useConfirm();

const name = ref('');
const config = ref<AppThemeConfig>(configFromBase('light', baseColorsOf('light')));
const initial = ref('');
const saving = ref(false);
const error = ref<string | null>(null);
/** El color que se está tocando en el selector: uno a la vez, para no tapar el diálogo con ocho selectores. */
const picking = ref<AppThemeColorToken | null>(null);

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    error.value = null;
    name.value = props.theme?.name ?? '';
    // Un tema nuevo arranca con el que se está viendo.
    config.value = props.theme ? structuredClone(props.theme.config) : store.currentConfig();
    initial.value = JSON.stringify([name.value, config.value]);
  },
  { immediate: true },
);

const dirty = computed(() => JSON.stringify([name.value, config.value]) !== initial.value);
const validColors = computed(() => APP_THEME_COLOR_TOKENS.every((k) => isValidHexColor(config.value.colors[k])));
const pairs = computed(() => (validColors.value ? contrastPairs(config.value) : []));
const blocking = computed(() => pairs.value.filter((p) => p.ratio < CONTRAST_MIN_BLOCKING));
const advisory = computed(() => pairs.value.filter((p) => p.ratio >= CONTRAST_MIN_BLOCKING && p.ratio < CONTRAST_MIN_ADVISORY));
const valid = computed(() => name.value.trim().length > 0 && validColors.value && blocking.value.length === 0);

/** Cambiar la base reemplaza fondo, tarjetas y texto por los de esa base: un fondo claro con base oscura no tiene sentido. */
function setBase(base: AppThemeBase): void {
  if (config.value.base === base) return;
  const from = configFromBase(base, baseColorsOf(base));
  config.value = { ...config.value, base, colors: { ...config.value.colors, background: from.colors.background, surface: from.colors.surface, text: from.colors.text } };
}

function setColor(token: AppThemeColorToken, value: string | null): void {
  config.value.colors[token] = (value ?? '').trim().toLowerCase();
}

function pairLabel(p: { a: string; b: string; ratio: number }): string {
  return t('themes.editor.contrastPair', { a: t(`themes.editor.pair.${p.a}`), b: t(`themes.editor.pair.${p.b}`), ratio: p.ratio.toFixed(2) });
}

async function close(): Promise<void> {
  if (dirty.value && !(await confirm({ title: t('themes.editor.discardTitle'), text: t('themes.editor.discardText'), confirmText: t('themes.editor.discard'), destructive: true }))) return;
  open.value = false;
}

async function save(): Promise<void> {
  if (!valid.value) return;
  saving.value = true;
  error.value = null;
  try {
    if (props.theme) await store.update(props.theme.id, name.value.trim(), config.value);
    else await store.create(name.value.trim(), config.value);
    initial.value = JSON.stringify([name.value, config.value]);
    open.value = false;
  } catch (e) {
    const code = extractErrorCode(e);
    error.value = code === 'APP_THEME_NAME_EXISTS' ? t('themes.editor.nameTaken') : code === 'APP_THEME_LIMIT' ? t('themes.editor.limit') : extractError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <!-- Escape y clic fuera llaman a `close`: con cambios sin guardar, pide confirmar (REGLAS-FRONT §4). -->
  <v-dialog :model-value="open" max-width="880" :fullscreen="mobile" scrollable @update:model-value="(v: boolean) => !v && close()">
    <v-card data-theme-editor>
      <v-card-title class="d-flex align-center">
        <span class="flex-1-1">{{ theme ? t('themes.editor.editTitle') : t('themes.editor.newTitle') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="close" />
      </v-card-title>
      <v-card-text>
        <v-row>
          <!-- Columnas sin flex: la de la vista previa es más alta, y en una columna flex los campos (v-input es flex: 1 1 auto) se
               estiraban a lo alto para igualarla. El espacio vertical lo pone el `div` de dentro. -->
          <v-col cols="12" md="6">
            <div class="d-flex flex-column ga-4">
            <v-alert v-if="error" type="error" closable @click:close="error = null">{{ error }}</v-alert>

            <v-text-field v-model="name" :label="t('themes.editor.name')" maxlength="60" autofocus data-theme-name />

            <div>
              <div class="text-body-medium mb-2">{{ t('themes.editor.base') }}</div>
              <v-btn-toggle :model-value="config.base" mandatory color="primary" variant="outlined" divided @update:model-value="setBase">
                <v-btn value="light" prepend-icon="mdi-weather-sunny">{{ t('themes.builtin.light') }}</v-btn>
                <v-btn value="dark" prepend-icon="mdi-weather-night" data-theme-base-dark>{{ t('themes.builtin.dark') }}</v-btn>
              </v-btn-toggle>
            </div>

            <v-row dense>
              <v-col v-for="token in APP_THEME_COLOR_TOKENS" :key="token" cols="6">
                <v-text-field
                  :model-value="config.colors[token]"
                  :label="t(`themes.editor.color.${token}`)"
                  :error="!isValidHexColor(config.colors[token])"
                  maxlength="7"
                  :data-theme-color="token"
                  @update:model-value="setColor(token, $event)"
                >
                  <template #prepend-inner>
                    <v-menu :model-value="picking === token" :close-on-content-click="false" location="bottom start" @update:model-value="(v: boolean) => (picking = v ? token : null)">
                      <template #activator="{ props: menuProps }">
                        <v-avatar v-bind="menuProps" :color="isValidHexColor(config.colors[token]) ? config.colors[token] : undefined" size="22" class="border cursor-pointer" :aria-label="t('themes.editor.pick')" />
                      </template>
                      <v-color-picker
                        :model-value="config.colors[token]"
                        mode="hex"
                        :modes="['hex']"
                        elevation="8"
                        @update:model-value="setColor(token, $event)"
                      />
                    </v-menu>
                  </template>
                </v-text-field>
              </v-col>
            </v-row>
            </div>
          </v-col>

          <v-col cols="12" md="6">
            <div class="d-flex flex-column ga-4">
            <div class="text-body-medium">{{ t('themes.editor.preview') }}</div>
            <ThemePreview v-if="validColors" :config="config" />
            <v-alert v-if="blocking.length" type="error" data-theme-contrast-error>
              {{ t('themes.editor.contrastBlocking') }}
              <div v-for="p in blocking" :key="p.a + p.b" class="text-body-small">{{ pairLabel(p) }}</div>
            </v-alert>
            <v-alert v-else-if="advisory.length" type="warning">
              {{ t('themes.editor.contrastAdvisory') }}
              <div v-for="p in advisory" :key="p.a + p.b" class="text-body-small">{{ pairLabel(p) }}</div>
            </v-alert>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="close">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" :disabled="!valid" data-theme-save @click="save">
          {{ theme ? t('themes.editor.save') : t('themes.editor.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

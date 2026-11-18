<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppThemeStore } from '@/stores/appTheme';
import { useConfirm } from '@/composable/useConfirm';
import { useNotify } from '@/composable/useNotify';
import EmptyState from '@/components/ui/EmptyState.vue';
import AppThemeEditorDialog from '@/components/themes/AppThemeEditorDialog.vue';
import { APP_THEME_COLOR_TOKENS, APP_THEME_MAX_PER_ORGANIZATION, PRESET_THEMES, presetRef, type AppThemeDTO, type ThemeRef } from '@/types/appTheme';

/**
 * Ajustes → Temas, para quien administra la organización (docs/TEMAS.md): crear los temas de la empresa, elegir cuál ve todo el
 * mundo por defecto y, si se quiere, fijarlo para que el resto no lo cambie. Cada persona elige el suyo en el menú del avatar.
 */
defineProps<{ embedded?: boolean }>();

const { t } = useI18n();
const store = useAppThemeStore();
const confirm = useConfirm();
const notify = useNotify();

const editorOpen = ref(false);
const editing = ref<AppThemeDTO | null>(null);
const savingSettings = ref(false);

onMounted(() => {
  if (!store.loaded) void store.load();
});

const defaultOptions = computed(() => [
  { value: 'light', title: t('themes.builtin.light') },
  { value: 'dark', title: t('themes.builtin.dark') },
  { value: 'system', title: t('themes.builtin.system') },
  ...PRESET_THEMES.map((p) => ({ value: presetRef(p.id), title: t(`themes.preset.${p.id}`) })),
  ...store.themes.map((th) => ({ value: th.id, title: th.name })),
]);

const atLimit = computed(() => store.themes.length >= APP_THEME_MAX_PER_ORGANIZATION);

async function saveSettings(patch: { defaultTheme?: ThemeRef; enforced?: boolean }): Promise<void> {
  savingSettings.value = true;
  try {
    await store.saveSettings({ ...store.settings, ...patch });
    notify.success(t('themes.settingsSaved'));
  } catch (e) {
    notify.error(e);
  } finally {
    savingSettings.value = false;
  }
}

function openEditor(theme: AppThemeDTO | null): void {
  editing.value = theme;
  editorOpen.value = true;
}

async function remove(theme: AppThemeDTO): Promise<void> {
  const isDefault = store.settings.defaultTheme === theme.id;
  const ok = await confirm({
    title: t('themes.removeTitle', { name: theme.name }),
    text: isDefault ? t('themes.removeTextDefault') : t('themes.removeText'),
    confirmText: t('common.delete'),
    destructive: true,
  });
  if (!ok) return;
  try {
    await store.remove(theme.id);
    notify.success(t('themes.removed', { name: theme.name }));
  } catch (e) {
    notify.error(e);
  }
}
</script>

<template>
  <div class="d-flex flex-column ga-6" data-app-themes>
    <section>
      <div class="text-title-large mb-2">{{ t('themes.companyTitle') }}</div>
      <div class="text-body-medium text-medium-emphasis mb-4">{{ t('themes.companyIntro') }}</div>
      <v-row>
        <v-col cols="12" md="6">
          <v-select
            :model-value="store.settings.defaultTheme"
            :items="defaultOptions"
            :label="t('themes.companyDefaultLabel')"
            :disabled="savingSettings"
            data-theme-default
            @update:model-value="saveSettings({ defaultTheme: $event })"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-switch
            :model-value="store.settings.enforced"
            :label="t('themes.enforce')"
            :hint="t('themes.enforceHint')"
            persistent-hint
            color="primary"
            :disabled="savingSettings"
            data-theme-enforce
            @update:model-value="saveSettings({ enforced: !!$event })"
          />
        </v-col>
      </v-row>
    </section>

    <section>
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <div>
          <div class="text-title-large">{{ t('themes.listTitle') }}</div>
          <div class="text-body-medium text-medium-emphasis">{{ t('themes.listIntro', { max: APP_THEME_MAX_PER_ORGANIZATION }) }}</div>
        </div>
        <v-spacer />
        <v-btn v-if="store.themes.length" color="primary" prepend-icon="mdi-plus" :disabled="atLimit" data-theme-new @click="openEditor(null)">
          {{ t('themes.new') }}
        </v-btn>
      </div>

      <EmptyState
        v-if="!store.themes.length"
        icon="mdi-palette-outline"
        :title="t('themes.emptyTitle')"
        :text="t('themes.emptyText')"
        :action-text="t('themes.new')"
        action-icon="mdi-plus"
        @action="openEditor(null)"
      />

      <v-row v-else>
        <v-col v-for="theme in store.themes" :key="theme.id" cols="12" sm="6" lg="4">
          <v-card :data-theme-card="theme.name">
            <div class="d-flex">
              <v-sheet v-for="token in APP_THEME_COLOR_TOKENS" :key="token" :color="theme.config.colors[token]" height="36" rounded="0" class="flex-1-1" />
            </div>
            <v-card-item>
              <v-card-title class="text-body-large font-weight-medium">{{ theme.name }}</v-card-title>
              <v-card-subtitle class="d-flex align-center flex-wrap ga-2">
                <v-chip size="x-small" variant="flat" :color="theme.config.base === 'dark' ? 'lightsecondary' : 'lightinfo'">
                  {{ t(`themes.builtin.${theme.config.base}`) }}
                </v-chip>
                <v-chip v-if="store.settings.defaultTheme === theme.id" size="x-small" variant="flat" color="lightprimary">
                  {{ store.settings.enforced ? t('themes.isEnforced') : t('themes.isDefault') }}
                </v-chip>
              </v-card-subtitle>
            </v-card-item>
            <v-card-actions>
              <v-btn prepend-icon="mdi-pencil-outline" @click="openEditor(theme)">{{ t('common.edit') }}</v-btn>
              <v-spacer />
              <v-btn icon="mdi-delete-outline" color="error" variant="text" :aria-label="t('common.delete')" @click="remove(theme)" />
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </section>

    <AppThemeEditorDialog v-model="editorOpen" :theme="editing" />
  </div>
</template>

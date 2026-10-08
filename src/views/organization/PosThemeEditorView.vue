<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { usePosThemeStore } from '@/stores/posTheme';
import { useAuthStore } from '@/stores/auth';
import PosThemeLogoField from '@/components/pos-theme/PosThemeLogoField.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PosThemePreview from '@/components/pos-theme/PosThemePreview.vue';
import {
  CONTRAST_MIN_ADVISORY,
  CONTRAST_MIN_BLOCKING,
  POS_THEME_BORDER_WIDTHS,
  POS_THEME_CART_POSITIONS,
  POS_THEME_CART_WIDTHS,
  POS_THEME_CATEGORIES_PLACEMENTS,
  POS_THEME_DENSITIES,
  POS_THEME_FONT_FAMILIES,
  POS_THEME_HEADING_WEIGHTS,
  POS_THEME_LOGIN_BACKGROUND_MAX_MB,
  POS_THEME_LOGO_POSITIONS,
  POS_THEME_LOGO_SIZES,
  POS_THEME_MODES,
  POS_THEME_PRESETS,
  POS_THEME_PRODUCT_CARDS,
  POS_THEME_RADII,
  POS_THEME_STATUS_BAR_POSITIONS,
  checkContrast,
  defaultPosThemeConfig,
  isValidHexColor,
  isValidTimeHHMM,
  normalizeHexColor,
  type PosThemeColors,
  type PosThemeConfig,
  type PosThemePresetKey,
} from '@/types/posTheme';

const { t } = useI18n();
const store = usePosThemeStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const themeId = computed(() => {
  const id = route.params.themeId;
  return typeof id === 'string' ? id : null;
});
const isNew = computed(() => !themeId.value);

/** Los archivos de marca cuelgan de la organización (el tema nuevo aún no tiene id). */
const organizationId = computed(() => {
  const u = auth.user;
  return u && 'orgId' in u ? (u.orgId ?? '') : '';
});

const name = ref('');
const config = ref<PosThemeConfig>(defaultPosThemeConfig());
/** Qué paleta se está editando. El config guarda las dos; la caja usa una según
 * la hora, así que hay que poder verlas por separado. */
const editMode = ref<'light' | 'dark'>('light');
const selectedPreset = ref<PosThemePresetKey>('classic');
const notFound = ref(false);

const colors = computed(() => config.value.colors[editMode.value]);

/** El fondo del acceso es una unión color|imagen. La pestaña es estado propio: elegir
 * "Imagen" antes de subirla no puede colar un `type: 'image'` sin archivo en el tema
 * (el servidor lo rechazaría), así que el config solo cambia cuando hay imagen. */
const loginBgTab = ref<'color' | 'image'>('color');
watch(
  () => config.value.branding.loginBackground.type,
  (type) => {
    loginBgTab.value = type;
  },
  { immediate: true },
);
function setLoginBgTab(tab: 'color' | 'image'): void {
  loginBgTab.value = tab;
  if (tab === 'color') {
    config.value.branding.loginBackground = { type: 'color', color: null, imageFileId: null };
  }
}
const loginBgImageId = computed({
  get: () => {
    const bg = config.value.branding.loginBackground;
    return bg.type === 'image' && bg.imageFileId ? bg.imageFileId : null;
  },
  set: (id: string | null) => {
    config.value.branding.loginBackground = id
      ? { type: 'image', color: null, imageFileId: id }
      : { type: 'color', color: null, imageFileId: null };
  },
});

/* ------------------------------------------------------------------ *
 * Opciones de los desplegables
 *
 * Las listas de valores NO van en los ficheros de i18n: allí solo hay cadenas
 * (vue-i18n no devuelve un array desde `$t`). Los valores salen de las constantes
 * del contrato, que es donde viven, y lo único que se traduce es la etiqueta de
 * cada uno. Así el editor no puede ofrecer un valor que el servidor no acepte.
 * ------------------------------------------------------------------ */

function options<T extends string | number>(values: readonly T[], key: (v: T) => string) {
  return values.map((value) => ({ title: t(key(value)), value }));
}

const modeOptions = computed(() => options(POS_THEME_MODES, (v) => `posThemes.values.mode.${v}`));
const fontFamilyOptions = computed(() =>
  options(POS_THEME_FONT_FAMILIES, (v) => `posThemes.values.fontFamily.${v}`),
);
const radiusOptions = computed(() => options(POS_THEME_RADII, (v) => `posThemes.values.radius.${v}`));
const densityOptions = computed(() =>
  options(POS_THEME_DENSITIES, (v) => `posThemes.values.density.${v}`),
);
const cartPositionOptions = computed(() =>
  options(POS_THEME_CART_POSITIONS, (v) => `posThemes.values.cartPosition.${v}`),
);
const cartWidthOptions = computed(() =>
  options(POS_THEME_CART_WIDTHS, (v) => `posThemes.values.cartWidth.${v}`),
);
const productCardOptions = computed(() =>
  options(POS_THEME_PRODUCT_CARDS, (v) => `posThemes.values.productCard.${v}`),
);
const categoriesOptions = computed(() =>
  options(POS_THEME_CATEGORIES_PLACEMENTS, (v) => `posThemes.values.categoriesPlacement.${v}`),
);
const statusBarOptions = computed(() =>
  options(POS_THEME_STATUS_BAR_POSITIONS, (v) => `posThemes.values.statusBarPosition.${v}`),
);
const logoPositionOptions = computed(() =>
  options(POS_THEME_LOGO_POSITIONS, (v) => `posThemes.values.logoPosition.${v}`),
);
const logoSizeOptions = computed(() => options(POS_THEME_LOGO_SIZES, (v) => `posThemes.values.logoSize.${v}`));
const borderWidthOptions = computed(() => [...POS_THEME_BORDER_WIDTHS]);
const headingWeightOptions = computed(() => [...POS_THEME_HEADING_WEIGHTS]);
const columnOptions = computed(() => [
  { title: t('posThemes.values.catalogColumns.auto'), value: 'auto' as const },
  ...[2, 3, 4, 5, 6].map((n) => ({ title: String(n), value: n })),
]);

/* ------------------------------------------------------------------ *
 * Colores
 * ------------------------------------------------------------------ */

const COLOR_TOKENS = [
  'primary',
  'background',
  'surface',
  'surfaceAlt',
  'text',
  'textMuted',
  'border',
  'success',
  'warning',
  'danger',
] as const satisfies readonly (keyof PosThemeColors)[];

function setColor(token: keyof PosThemeColors, value: string): void {
  config.value.colors[editMode.value][token] = normalizeHexColor(value);
}

/** El input de color nativo devuelve siempre `#rrggbb` en minúsculas, que es
 * justo lo que pide el contrato. El campo de texto de al lado deja pegar un
 * valor a mano; se normaliza al perder el foco para no enviar `#5D87FF` y comerse
 * un 422. */
function setColorFromText(token: keyof PosThemeColors, value: string): void {
  if (isValidHexColor(normalizeHexColor(value))) setColor(token, value);
}

/* ------------------------------------------------------------------ *
 * Contraste
 * ------------------------------------------------------------------ */

/** El espejo local del servidor: avisa mientras se escribe, sin round-trip. */
const advisoryPairs = computed(() => checkContrast(config.value, CONTRAST_MIN_ADVISORY));
const blockingPairs = computed(() => checkContrast(config.value, CONTRAST_MIN_BLOCKING));

/* ------------------------------------------------------------------ *
 * Validación antes de gastar un rechazo del servidor
 * ------------------------------------------------------------------ */

const invalidColors = computed(() =>
  COLOR_TOKENS.filter((t2) => !isValidHexColor(colors.value[t2])).map((t2) => t2),
);

const scheduleInvalid = computed(
  () => !isValidTimeHHMM(config.value.schedule.darkFrom) || !isValidTimeHHMM(config.value.schedule.darkTo),
);

const welcomeTooLong = computed(
  () => (config.value.branding.welcomeMessage?.length ?? 0) > 80,
);

const nameInvalid = computed(() => name.value.trim().length < 1 || name.value.length > 80);

const canSave = computed(
  () =>
    !nameInvalid.value &&
    invalidColors.value.length === 0 &&
    !scheduleInvalid.value &&
    !welcomeTooLong.value &&
    blockingPairs.value.length === 0 &&
    !store.saving,
);

/* ------------------------------------------------------------------ *
 * Carga y guardado
 * ------------------------------------------------------------------ */

/** Los presets solo se ofrecen en un tema nuevo, así que aplicarlos no tira
 * trabajo: no hay nada guardado que perder. */
function applyPreset(key: PosThemePresetKey): void {
  const preset = POS_THEME_PRESETS.find((p) => p.key === key);
  if (preset) config.value = preset.build();
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  // Se normaliza todo antes de mandar: el contrato no admite alfa ni mayúsculas
  // y el rechazo por eso sería confuso ("El color debe ser #rrggbb en minúsculas").
  for (const mode of ['light', 'dark'] as const) {
    for (const token of COLOR_TOKENS) {
      config.value.colors[mode][token] = normalizeHexColor(config.value.colors[mode][token]);
    }
  }

  const trimmed = name.value.trim();
  const saved = isNew.value
    ? await store.createTheme(trimmed, config.value)
    : themeId.value
      ? await store.updateTheme(themeId.value, trimmed, config.value)
      : null;

  if (saved) await router.push('/settings?tab=pos-themes');
}

/* Al montar, un tema ya guardado entra en la paleta con la que se va a ver por
   defecto: si es de horario, en claro. */
onMounted(async () => {
  if (isNew.value) {
    config.value = defaultPosThemeConfig();
    name.value = '';
    return;
  }
  await store.fetchTheme(themeId.value!);
  if (store.current) {
    name.value = store.current.name;
    // `structuredClone` lanza DataCloneError con un Proxy de Vue (el tema del store es
    // reactivo) y el editor se quedaba con los valores por defecto sin avisar. El
    // config es JSON puro, así que este viaje de ida y vuelta es seguro.
    config.value = JSON.parse(JSON.stringify(store.current.config)) as PosThemeConfig;
    editMode.value = store.current.config.mode === 'dark' ? 'dark' : 'light';
  } else {
    notFound.value = true;
  }
});
</script>

<template>
  <v-container>
    <PageHeader
      :title="isNew ? $t('posThemes.editor.newTitle') : $t('posThemes.editor.editTitle')"
      :subtitle="$t('posThemes.editor.subtitle')"
    >
      <template #actions>
        <v-btn variant="text" :to="'/settings?tab=pos-themes'">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="store.saving" :disabled="!canSave" @click="save">
          {{ $t('common.save') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="notFound" type="warning" class="mb-4">
      {{ $t('posThemes.notFound') }}
    </v-alert>

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.clearError()">
      {{ store.error }}
      <!-- LOW_CONTRAST: el servidor manda los pares concretos, así que se listan
           en vez de decir solo "contraste bajo". -->
      <ul v-if="store.errorCode === 'LOW_CONTRAST' && store.errorPairs.length > 0" class="ml-4 mt-2">
        <li v-for="pair in store.errorPairs" :key="`${pair.a}-${pair.b}`" class="text-caption">
          {{ $t('posThemes.contrastPair', {
            a: pair.a,
            b: pair.b,
            ratio: pair.ratio.toFixed(2),
            min: pair.min,
          }) }}
        </li>
      </ul>
    </v-alert>

    <v-row>
      <!-- ---------------------------------------------------------------- -->
      <!-- Formulario                                                        -->
      <!-- ---------------------------------------------------------------- -->
      <v-col cols="12" md="7">
        <!-- Presets -->
        <v-card v-if="isNew" class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.presetsTitle') }}
          </v-card-title>
          <v-card-text>
            <v-btn-toggle
              v-model="selectedPreset"
              mandatory
              color="primary"
              density="comfortable"
              class="mb-2"
            >
              <v-btn
                v-for="preset in POS_THEME_PRESETS"
                :key="preset.key"
                :value="preset.key"
                @click="applyPreset(preset.key)"
              >
                {{ $t(preset.titleKey) }}
              </v-btn>
            </v-btn-toggle>
            <p class="text-caption text-medium-emphasis">{{ $t('posThemes.presetsHint') }}</p>
          </v-card-text>
        </v-card>

        <!-- Nombre -->
        <v-card class="mb-4">
          <v-card-text>
            <v-text-field
              v-model="name"
              :label="$t('common.name')"
              :error-messages="nameInvalid ? $t('posThemes.nameError') : undefined"
              counter="80"
            />
          </v-card-text>
        </v-card>

        <!-- Colores -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.colorsTitle') }}
          </v-card-title>
          <v-card-text>
            <!-- Modo del tema: fijo claro, fijo oscuro, o automático por horario. -->
            <v-select
              v-model="config.mode"
              :items="modeOptions"
              :label="$t('posThemes.mode')"
              class="mb-4"
            />

            <v-tabs v-model="editMode" color="primary" class="mb-4">
              <v-tab value="light">{{ $t('posThemes.modeLight') }}</v-tab>
              <v-tab value="dark">{{ $t('posThemes.modeDark') }}</v-tab>
            </v-tabs>

            <p v-if="config.mode === 'schedule'" class="text-caption text-medium-emphasis mb-2">
              {{ $t('posThemes.scheduleHint') }}
            </p>
            <v-row v-if="config.mode === 'schedule'" dense>
              <v-col cols="6">
                <v-text-field
                  v-model="config.schedule.darkFrom"
                  :label="$t('posThemes.darkFrom')"
                  placeholder="19:00"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="config.schedule.darkTo"
                  :label="$t('posThemes.darkTo')"
                  placeholder="07:00"
                />
              </v-col>
            </v-row>

            <v-row dense>
              <v-col v-for="token in COLOR_TOKENS" :key="token" cols="12" sm="6">
                <div class="d-flex align-center ga-2">
                  <!-- Input nativo: siempre `#rrggbb` en minúsculas, que es lo que
                       acepta el contrato. Sin hoja de estilo propia (el guardián
                       de UI no admite estilos de vista): el borde sale del token
                       `borderColor` del tema, no de un color escrito aquí. -->
                  <input
                    type="color"
                    :value="colors[token]"
                    :aria-label="$t(`posThemes.tokens.${token}`)"
                    style="width: 38px; height: 38px; padding: 2px; cursor: pointer; flex-shrink: 0; border-radius: 6px; border: 1px solid rgb(var(--v-border-color)); background: transparent;"
                    @input="setColor(token, ($event.target as HTMLInputElement).value)"
                  />
                  <v-text-field
                    :model-value="colors[token]"
                    :label="$t(`posThemes.tokens.${token}`)"
                    :error="invalidColors.includes(token)"
                    @update:model-value="setColorFromText(token, $event as string)"
                    @blur="setColorFromText(token, colors[token])"
                  />
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Contraste -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.contrastTitle') }}
          </v-card-title>
          <v-card-text>
            <v-alert v-if="blockingPairs.length > 0" type="error" class="mb-2">
              {{ $t('posThemes.contrastBlocking') }}
            </v-alert>
            <v-alert v-else-if="advisoryPairs.length > 0" type="warning" class="mb-2">
              {{ $t('posThemes.contrastAdvisory') }}
            </v-alert>
            <v-alert v-else type="success">
              {{ $t('posThemes.contrastOk') }}
            </v-alert>

            <ul v-if="advisoryPairs.length > 0" class="ml-4">
              <li v-for="pair in advisoryPairs" :key="`${pair.a}-${pair.b}`" class="text-caption">
                {{ $t('posThemes.contrastPair', {
                  a: pair.a,
                  b: pair.b,
                  ratio: pair.ratio.toFixed(2),
                  min: pair.min,
                }) }}
              </li>
            </ul>
          </v-card-text>
        </v-card>

        <!-- Tipografía -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.typographyTitle') }}
          </v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="config.typography.fontFamily"
                  :items="fontFamilyOptions"
                  :label="$t('posThemes.fontFamily')"
                />
              </v-col>
              <v-col cols="6" sm="3">
                <v-slider
                  v-model="config.typography.baseSize"
                  :min="14"
                  :max="20"
                  :step="1"
                  thumb-label
                  :label="$t('posThemes.baseSize')"
                />
              </v-col>
              <v-col cols="6" sm="3">
                <v-select
                  v-model="config.typography.headingWeight"
                  :items="headingWeightOptions"
                  :label="$t('posThemes.headingWeight')"
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Forma -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.shapeTitle') }}
          </v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="6" sm="3">
                <v-select v-model="config.shape.radius" :items="radiusOptions" :label="$t('posThemes.radius')" />
              </v-col>
              <v-col cols="6" sm="3">
                <v-select v-model="config.shape.density" :items="densityOptions" :label="$t('posThemes.density')" />
              </v-col>
              <v-col cols="6" sm="3">
                <v-select v-model="config.shape.borderWidth" :items="borderWidthOptions" :label="$t('posThemes.borderWidth')" />
              </v-col>
              <v-col cols="6" sm="3" class="d-flex align-center">
                <v-switch v-model="config.shape.shadows" :label="$t('posThemes.shadows')" color="primary" />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Distribución -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.layoutTitle') }}
          </v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.cartPosition" :items="cartPositionOptions" :label="$t('posThemes.cartPosition')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.cartWidth" :items="cartWidthOptions" :label="$t('posThemes.cartWidth')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.catalogColumns" :items="columnOptions" :label="$t('posThemes.columns')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.productCard" :items="productCardOptions" :label="$t('posThemes.productCard')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.categoriesPlacement" :items="categoriesOptions" :label="$t('posThemes.categories')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.layout.statusBarPosition" :items="statusBarOptions" :label="$t('posThemes.statusBar')" />
              </v-col>
              <v-col cols="12" class="d-flex align-center">
                <v-switch v-model="config.layout.showProductImages" :label="$t('posThemes.showImages')" color="primary" />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Marca -->
        <v-card class="mb-4">
          <v-card-title class="text-body-1 font-weight-medium">
            {{ $t('posThemes.brandingTitle') }}
          </v-card-title>
          <v-card-text>
            <v-text-field
              v-model="config.branding.welcomeMessage"
              :label="$t('posThemes.welcomeMessage')"
              :error-messages="welcomeTooLong ? $t('posThemes.welcomeTooLong') : undefined"
              counter="80"
              class="mb-4"
            />
            <v-row dense class="mb-2">
              <v-col cols="12" md="6">
                <PosThemeLogoField
                  v-model="config.branding.logoFileId"
                  :label="$t('posThemes.logo')"
                  :hint="$t('posThemes.logoHint')"
                  category="logo"
                  :organization-id="organizationId"
                />
              </v-col>
              <v-col cols="12" md="6">
                <PosThemeLogoField
                  v-model="config.branding.logoDarkFileId"
                  :label="$t('posThemes.logoDark')"
                  :hint="$t('posThemes.logoDarkHint')"
                  category="logo-dark"
                  :organization-id="organizationId"
                />
              </v-col>
            </v-row>
            <v-row dense>
              <v-col cols="6" sm="4">
                <v-select v-model="config.branding.logoPosition" :items="logoPositionOptions" :label="$t('posThemes.logoPosition')" />
              </v-col>
              <v-col cols="6" sm="4">
                <v-select v-model="config.branding.logoSize" :items="logoSizeOptions" :label="$t('posThemes.logoSize')" />
              </v-col>
              <v-col cols="12" sm="4" class="d-flex align-center">
                <v-switch v-model="config.branding.showLogoOnLogin" :label="$t('posThemes.showLogoOnLogin')" color="primary" />
              </v-col>
            </v-row>

            <div class="text-body-2 font-weight-medium mb-1">{{ $t('posThemes.loginBackground') }}</div>
            <v-btn-toggle
              :model-value="loginBgTab"
              mandatory
              density="comfortable"
              color="primary"
              class="mb-2"
              @update:model-value="setLoginBgTab"
            >
              <v-btn value="color">{{ $t('posThemes.loginBgColor') }}</v-btn>
              <v-btn value="image">{{ $t('posThemes.loginBgImage') }}</v-btn>
            </v-btn-toggle>
            <p v-if="loginBgTab === 'color'" class="text-caption text-medium-emphasis">
              {{ $t('posThemes.loginBgColorHint') }}
            </p>
            <PosThemeLogoField
              v-else
              v-model="loginBgImageId"
              :label="$t('posThemes.loginBgImage')"
              category="login-background"
              :organization-id="organizationId"
              :max-size-mb="POS_THEME_LOGIN_BACKGROUND_MAX_MB"
            />
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ---------------------------------------------------------------- -->
      <!-- Vista previa                                                     -->
      <!-- ---------------------------------------------------------------- -->
      <v-col cols="12" md="5">
        <!-- Sticky en línea: Vuetify no tiene utilidad para `position: sticky` y
             una hoja de estilo en la vista no es opción. -->
        <div style="position: sticky; top: calc(var(--v-layout-top, 0px) + 68px);">
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span class="text-body-1 font-weight-medium">{{ $t('posThemes.previewTitle') }}</span>
              <v-btn-toggle v-model="editMode" mandatory density="comfortable" color="primary">
                <v-btn value="light">{{ $t('posThemes.modeLight') }}</v-btn>
                <v-btn value="dark">{{ $t('posThemes.modeDark') }}</v-btn>
              </v-btn-toggle>
            </v-card-title>
            <v-card-text>
              <PosThemePreview :config="config" :mode="editMode" />
            </v-card-text>
          </v-card>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

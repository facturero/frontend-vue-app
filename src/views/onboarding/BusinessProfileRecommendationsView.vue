<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import type { RecommendationItem } from '@/types/plugins';
import PageHeader from '@/components/ui/PageHeader.vue';

/**
 * Alta, paso 4: los módulos recomendados por el perfil elegido. Aquí se ve el
 * estado real de cada cosa (hoy el grueso del catálogo está en construcción, y
 * la pantalla lo dice en vez de esconderlo), cuáles ya están activos y cuáles
 * se marcan por defecto (los esenciales). La activación es en lote y tolerante:
 * el resultado se enseña al llegar a inicio.
 */
const router = useRouter();
const { t, locale } = useI18n();
const store = usePluginsStore();

const activating = ref(false);
const selected = ref<Set<string>>(new Set());

const profileCode = computed(() => store.myProfile?.profile?.code ?? '');
const items = computed(() => store.recommendations?.items ?? []);

const activatable = computed(() => items.value.filter((i) => i.state === 'activatable'));
const blocked = computed(() => items.value.filter((i) => i.state === 'blocked'));
const alreadyActive = computed(() => items.value.filter((i) => i.state === 'already_active'));
const comingSoon = computed(() => items.value.filter((i) => i.state === 'coming_soon'));

/** Los esenciales se marcan por defecto; los sugeridos no. El lote nunca incluye lo ya activo. */
const defaultsChecked = computed(() => {
  const s = new Set<string>();
  for (const i of items.value) {
    if (i.state === 'activatable' && i.recommendation === 'essential') s.add(i.plugin.code);
  }
  return s;
});

/** Agrupación por categoría de lo marcable (activatable + blocked, que pide acción). */
const groups = computed(() => {
  const map = new Map<string, RecommendationItem[]>();
  for (const i of [...activatable.value, ...blocked.value]) {
    const list = map.get(i.plugin.category) ?? [];
    list.push(i);
    map.set(i.plugin.category, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
});

const selectedList = computed(() => [...selected.value]);

const selectedTotalCents = computed(() =>
  activatable.value
    .filter((i) => selected.value.has(i.plugin.code))
    .reduce((sum, i) => sum + i.plugin.priceCents, 0),
);

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(cents / 100);
}

onMounted(async () => {
  // El perfil ya elegido es el que dispara la carga; sin él no hay nada que recomendar.
  if (store.myProfile?.status !== 'selected' && !profileCode.value) {
    await router.replace({ name: 'business-profile' });
    return;
  }
  const ok = await store.fetchRecommendations(profileCode.value);
  if (!ok) return;
  selected.value = defaultsChecked.value;
});

function toggle(code: string, checked: boolean): void {
  const next = new Set(selected.value);
  if (checked) next.add(code);
  else next.delete(code);
  selected.value = next;
}

function blockedDetail(i: RecommendationItem): string {
  const missing = i.requires.filter((r) => !r.alreadyActive).map((r) => r.code);
  return t('onboarding.businessProfile.neededFirst', { codes: missing.join(', ') });
}

async function activateSelected(): Promise<void> {
  activating.value = true;
  const ok = await store.activateBatch(selectedList.value);
  activating.value = false;
  store.clearError();
  if (!ok) return;
  await router.push({ name: 'home' });
}

function skip(): void {
  void router.push({ name: 'home' });
}
</script>

<template>
  <v-container>
    <PageHeader
      :title="t('onboarding.businessProfile.recommendationsTitle', { profile: store.recommendations?.profile.name ?? '' })"
    >
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push({ name: 'business-profile' })">
          {{ t('onboarding.businessProfile.backToProfile') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert
      v-if="store.error"
      type="error"
      closable
      class="mb-4"
      @click:close="store.clearError()"
    >
      {{ store.error }}
    </v-alert>

    <v-row v-if="store.loading && !store.recommendations" dense>
      <v-col cols="12" class="text-center py-12">
        <v-progress-circular indeterminate color="primary" />
      </v-col>
    </v-row>

    <template v-else>
      <v-row dense>
        <v-col v-for="[category, list] in groups" :key="category" cols="12" md="6">
          <v-card class="mb-4">
            <v-card-title class="text-h6 font-weight-medium pb-0">
              {{ category }}
            </v-card-title>
            <v-card-text>
              <v-list lines="two" density="compact">
                <v-list-item v-for="i in list" :key="i.plugin.code">
                  <template #prepend>
                    <v-checkbox
                      :model-value="selected.has(i.plugin.code)"
                      :disabled="i.state === 'blocked'"
                      color="primary"
                      hide-details
                      @update:model-value="(v) => toggle(i.plugin.code, Boolean(v))"
                    />
                  </template>
                  <v-list-item-title>
                    {{ i.plugin.name }}
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="i.state === 'blocked' && i.requires.some((r) => !r.alreadyActive)" class="text-caption">
                      {{ blockedDetail(i) }}
                    </span>
                  </v-list-item-subtitle>
                  <template #append>
                    <span class="text-body-2">{{ formatPrice(i.plugin.priceCents, i.plugin.currency) }}{{ t('plugins.perMonth') }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row v-if="alreadyActive.length" dense>
        <v-col cols="12" md="6">
          <v-card class="mb-4">
            <v-card-title class="text-h6 font-weight-medium pb-0">
              {{ t('onboarding.businessProfile.alreadyActiveTitle') }}
            </v-card-title>
            <v-card-text>
              <v-list lines="two" density="compact">
                <v-list-item v-for="i in alreadyActive" :key="i.plugin.code">
                  <v-list-item-title>
                    {{ i.plugin.name }}
                  </v-list-item-title>
                  <template #append>
                    <v-chip size="small" color="lightsuccess">
                      {{ t('onboarding.businessProfile.alreadyActive') }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row v-if="comingSoon.length" dense>
        <v-col cols="12" md="6">
          <v-card class="mb-4">
            <v-card-title class="text-h6 font-weight-medium pb-0">
              {{ t('onboarding.businessProfile.comingSoon') }}
            </v-card-title>
            <v-card-text>
              <v-list lines="two" density="compact">
                <v-list-item v-for="i in comingSoon" :key="i.plugin.code">
                  <v-list-item-title>
                    {{ i.plugin.name }}
                  </v-list-item-title>
                  <template #append>
                    <v-chip size="small" color="lightwarning">
                      {{ t('plugins.status.en_construccion') }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <div class="d-flex flex-wrap align-center ga-4">
        <span class="text-body-2 text-medium-emphasis">
          {{ t('onboarding.businessProfile.monthlyTotal', { amount: formatPrice(selectedTotalCents, 'USD') }) }}
        </span>
        <v-spacer />
        <v-btn variant="text" :disabled="activating" @click="skip">
          {{ t('onboarding.businessProfile.skipRecommendations') }}
        </v-btn>
        <v-btn
          color="primary"
          :loading="activating"
          :disabled="!selectedList.length"
          @click="activateSelected"
        >
          {{ t('onboarding.businessProfile.activateSelected', { count: selectedList.length }) }}
        </v-btn>
      </div>
    </template>
  </v-container>
</template>
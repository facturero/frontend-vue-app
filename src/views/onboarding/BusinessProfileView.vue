<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import PageHeader from '@/components/ui/PageHeader.vue';

/**
 * Alta, paso 3: perfil de negocio. Razón de ser: una organización recién creada
 * no tiene que elegir entre 66 módulos sin saber por dónde empezar. El perfil
 * solo decide qué se recomienda y en qué orden — no limita nada —, por eso la
 * elección es omitible y se puede cambiar después desde la vista de módulos.
 *
 * `source=settings` (enlace "cambiar perfil" de /plugins) modifica la elección
 * ya hecha y vuelve a módulos; sin parámetro es el alta, y al elegir se avanza
 * a la pantalla de recomendados.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const store = usePluginsStore();

const isSettings = route.query.source === 'settings';
const selectingCode = ref<string | null>(null);
const omitting = ref(false);

onMounted(() => {
  void store.fetchBusinessProfiles();
});

async function select(code: string): Promise<void> {
  selectingCode.value = code;
  const ok = await store.chooseProfile(code, isSettings ? 'settings' : 'onboarding');
  selectingCode.value = null;
  store.clearError();
  if (!ok) return;
  await router.push(isSettings ? { name: 'plugins' } : { name: 'business-profile-plugins' });
}

async function omit(): Promise<void> {
  omitting.value = true;
  const ok = await store.chooseProfile(null, isSettings ? 'settings' : 'onboarding');
  omitting.value = false;
  store.clearError();
  if (!ok) return;
  await router.push(isSettings ? { name: 'plugins' } : { name: 'home' });
}
</script>

<template>
  <v-container>
    <PageHeader :title="t('onboarding.businessProfile.title')" :subtitle="t('onboarding.businessProfile.intro')" />

    <v-alert
      v-if="store.error"
      type="error"
      closable
      class="mb-4"
      @click:close="store.clearError()"
    >
      {{ store.error }}
    </v-alert>

    <v-row v-if="store.loading && !store.businessProfiles.length" dense>
      <v-col cols="12" class="text-center py-12">
        <v-progress-circular indeterminate color="primary" />
      </v-col>
    </v-row>

    <v-row v-else dense>
      <v-col v-for="p in store.businessProfiles" :key="p.code" cols="12" sm="6" md="4" lg="3">
        <v-card
          :loading="selectingCode === p.code"
          :border="selectingCode === p.code"
          class="cursor-pointer fill-height"
          @click="select(p.code)"
        >
          <v-card-text>
            <v-sheet color="lightprimary" class="w-12 h-12 d-flex align-center justify-center mb-4">
              <v-icon :icon="p.icon" color="primary" size="26" />
            </v-sheet>
            <div class="text-subtitle-1 font-weight-medium">{{ p.name }}</div>
            <div class="text-body-2 text-medium-emphasis mt-1">{{ p.description }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div class="d-flex flex-wrap align-center ga-4 mt-4">
      <p class="text-body-2 text-medium-emphasis">
        {{ t('onboarding.businessProfile.selectHint') }}
      </p>
      <v-btn
        variant="text"
        :loading="omitting"
        :disabled="store.profileSaving"
        @click="omit"
      >
        {{ t('onboarding.businessProfile.omit') }}
      </v-btn>
    </div>
  </v-container>
</template>
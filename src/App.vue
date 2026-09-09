<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { shouldAutoStartTour, useAppTour } from '@/composable/useAppTour';
import { useBareShell } from '@/composable/useBareShell';
import AppNavigationDrawer from '@/layouts/AppNavigationDrawer.vue';
import AppTopBar from '@/layouts/AppTopBar.vue';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const auth = useAuthStore();
const plugins = usePluginsStore();
const { startTour } = useAppTour();
const { mobile } = useDisplay();
const bareShell = useBareShell();

const showShell = computed(() => !!route.meta.requiresAuth);

/**
 * El tour automático sale una sola vez por usuario, cuando la sesión ya tiene
 * los datos necesarios (usuario cargado, plugins de la organización cargados y
 * organizacion configurada). Se marca como visto al cerrarse: el botón de la
 * top bar permite relanzarlo cuando quiera.
 *
 * Las dos pantallas del perfil de negocio son parte del alta y se explican
 * solas con su encabezado (ver perfiles-de-negocio.md): el tour sigue
 * arrancando al llegar a inicio, donde el alta ya terminó.
 */
const autoStarted = ref(false);

watch(
  [showShell, () => auth.user, () => plugins.myLoaded, () => auth.needsOrgSetup, () => route.name],
  () => {
    if (autoStarted.value) return;
    if (showShell.value && auth.user && plugins.myLoaded && !auth.needsOrgSetup && !bareShell.value) {
      autoStarted.value = true;
      if (shouldAutoStartTour(auth.user.id, 'app')) startTour();
    }
  },
  { immediate: true },
);

watch(
  mobile,
  (isMobile) => ui.setDrawer(!isMobile),
  { immediate: true },
);
</script>

<template>
  <v-app>
    <template v-if="showShell">
      <AppNavigationDrawer v-if="!bareShell" />
      <AppTopBar />
      <v-main>
        <v-container :fluid="mobile">
          <router-view />
        </v-container>
      </v-main>
    </template>
    <template v-else>
      <v-main>
        <router-view />
      </v-main>
    </template>
  </v-app>
</template>

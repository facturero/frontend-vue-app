<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useAssistantStore } from '@/stores/assistant';
import { shouldAutoStartTour, useAppTour } from '@/composable/useAppTour';
import { useBareShell } from '@/composable/useBareShell';
import AssistantPanel from '@/components/AssistantPanel.vue';
import AppNavigationDrawer from '@/layouts/AppNavigationDrawer.vue';
import AppTopBar from '@/layouts/AppTopBar.vue';
import ReportProblemDialog from '@/components/ReportProblemDialog.vue';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const auth = useAuthStore();
const plugins = usePluginsStore();
const assistant = useAssistantStore();
const { startTour } = useAppTour();
const { mobile } = useDisplay();
const bareShell = useBareShell();

/** La caja web (y su acceso en el dominio `pos.`) ocupa toda la ventana con su propia cabecera: sin el armazón del CRM. */
const kiosk = computed(() => route.meta.kiosk === true);
const showShell = computed(() => !!route.meta.requiresAuth);

/**
 * El tour automático sale una sola vez por usuario, cuando la sesión ya tiene
 * los datos necesarios (usuario cargado, plugins de la organización cargados y
 * organizacion configurada). Se marca como visto al cerrarse: el menú del
 * avatar permite relanzarlo cuando quiera.
 *
 * Las dos pantallas del perfil de negocio son parte del alta y se explican
 * solas con su encabezado (ver perfiles-de-negocio.md): el tour sigue
 * arrancando al llegar a inicio, donde el alta ya terminó.
 */
const autoStarted = ref(false);

watch(
  [showShell, kiosk, () => auth.user, () => plugins.myLoaded, () => auth.needsOrgSetup, () => route.name],
  () => {
    if (autoStarted.value) return;
    // El recorrido guiado es del CRM: en la caja (pantalla completa, sin menú) taparía la venta con su capa.
    if (showShell.value && !kiosk.value && auth.user && plugins.myLoaded && !auth.needsOrgSetup && !bareShell.value) {
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
    <template v-if="kiosk">
      <router-view />
    </template>
    <template v-else-if="showShell">
      <AppNavigationDrawer v-if="!bareShell" />
      <AppTopBar />
      <AssistantPanel v-if="!bareShell" />
      <!-- Acceso fijo al asistente abajo a la derecha; se oculta mientras el panel está abierto para no taparle el campo de mensaje. -->
      <v-fab
        v-if="!bareShell"
        :active="!assistant.open"
        app
        appear
        location="bottom end"
        size="large"
        color="primary"
        icon="mdi-robot-outline"
        :title="$t('assistant.title')"
        :aria-label="$t('assistant.title')"
        @click="assistant.toggle()"
      />
      <v-main>
        <!-- En el teléfono el contenedor de aquí no lleva relleno: cada vista trae el suyo y, sumados, eran 32 px por lado. `pb-16` deja sitio
             al botón flotante del asistente, que si no tapa el final de cada pantalla. -->
        <v-container :fluid="mobile" :class="mobile ? 'pa-0 pb-16' : undefined">
          <router-view />
        </v-container>
      </v-main>
    </template>
    <template v-else>
      <v-main>
        <router-view />
      </v-main>
    </template>

    <!-- Fuera de los dos casos de arriba: también se reporta desde el login, donde están los errores más difíciles de ver. -->
    <ReportProblemDialog />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { resolveFileUrl } from '@/composable/useFileUrl';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import { useAppThemeStore } from '@/stores/appTheme';
import { builtinNameKey } from '@/types/appTheme';
import { useI18n } from 'vue-i18n';
import NotificationBell from '@/components/NotificationBell.vue';
import MessageInbox from '@/components/MessageInbox.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import { useAppTour } from '@/composable/useAppTour';
import { useBareShell } from '@/composable/useBareShell';
import { useAssistantStore } from '@/stores/assistant';
import { useFeedbackStore } from '@/stores/feedback';
import type { Me } from '@/types/auth';

const ui = useUiStore();
const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const { mobile } = useDisplay();
const bareShell = useBareShell();
const assistant = useAssistantStore();
const { startTour } = useAppTour();
const feedbackUrl = import.meta.env.VITE_FEEDBACK_URL;

/** En móvil el drawer es temporal (se abre y cierra); en escritorio es fijo y alterna entre rail y ancho completo. */
function toggleNavigation(): void {
  if (mobile.value) ui.toggleDrawer();
  else ui.toggleRail();
}

const avatarUrl = ref<string | null>(null);
const menuOpen = ref(false);

const me = computed(() => auth.user as Me | null);

const initials = computed(() => {
  const name = me.value?.fullName?.trim();
  if (!name) return (me.value?.email?.charAt(0) ?? '?').toUpperCase();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
});

async function loadAvatar(): Promise<void> {
  const fileId = me.value?.avatarFileId;
  if (!fileId) {
    avatarUrl.value = null;
    return;
  }
  try {
    avatarUrl.value = await resolveFileUrl(fileId);
  } catch {
    avatarUrl.value = null;
  }
}

onMounted(async () => {
  try {
    // El guard del router ya lo trajo antes de montar la barra; pedirlo otra vez era un `/auth/me` de más en cada carga.
    if (!auth.user) await auth.fetchMe();
    await loadAvatar();
  } catch {
    // ignora
  }
  // Reabre la última conversación del asistente sin esperar a que el panel se
  // abra: al recargar, el chat que estabas viendo vuelve a aparecer.
  void assistant.restoreActive();
});

watch(() => me.value?.avatarFileId, () => {
  loadAvatar();
});

function goToProfile(): void {
  menuOpen.value = false;
  router.push({ name: 'profile' });
}

function openTour(): void {
  menuOpen.value = false;
  startTour();
}

function openReport(): void {
  menuOpen.value = false;
  ui.openReport();
}

/* Tema: la fila del menú cierra el menú y abre el diálogo, que vive fuera de él (ver ThemeSwitcher.vue). */
const appTheme = useAppThemeStore();
const themeOpen = ref(false);
const themeLabel = computed(() => {
  const r = appTheme.effectiveRef;
  const key = builtinNameKey(r);
  if (key) return t(key);
  return appTheme.themes.find((th) => th.id === r)?.name ?? t('themes.builtin.light');
});

function openTheme(): void {
  menuOpen.value = false;
  themeOpen.value = true;
}

function go(name: string): void {
  menuOpen.value = false;
  void router.push({ name });
}

// Al abrir el menú, los números del buzón al día (sin tiempo real: los avisos llegan por la campana).
const feedbackStore = useFeedbackStore();
watch(menuOpen, (open) => {
  if (open) void feedbackStore.refresh();
});

function logout(): void {
  menuOpen.value = false;
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-app-bar app density="comfortable">
    <template v-if="!bareShell">
      <v-btn icon :title="$t('nav.menu')" :aria-label="$t('nav.menu')" @click="toggleNavigation">
        <v-icon icon="mdi-menu" />
      </v-btn>
      <GlobalSearch />
    </template>

    <v-spacer></v-spacer>

    <template v-if="!bareShell">
      <!-- El asistente vive aquí, con la campana y los mensajes: como botón flotante tapaba el contenido (tablero de proyectos, panel de
           la tarea, «Enviar» del chat). Resaltado mientras su panel está abierto. -->
      <v-btn
        icon
        :color="assistant.open ? 'primary' : undefined"
        :title="$t('assistant.title')"
        :aria-label="$t('assistant.title')"
        data-topbar-assistant
        @click="assistant.toggle()"
      >
        <v-icon icon="mdi-robot-outline" />
      </v-btn>
      <NotificationBell />
      <MessageInbox />
    </template>

    <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom end" min-width="300" :offset="8">
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps" icon class="ml-2">
          <v-avatar :color="avatarUrl ? undefined : 'primary'" size="32">
            <v-img v-if="avatarUrl" :src="avatarUrl" alt="avatar" cover />
            <span v-else class="text-body-medium font-weight-bold text-white">{{ initials }}</span>
          </v-avatar>
        </v-btn>
      </template>

      <v-card>
        <v-list density="compact" class="pa-0 rounded-lg">
        <v-list-item class="py-3">
          <template #append>
            <v-avatar :color="avatarUrl ? undefined : 'primary'" size="40">
              <v-img v-if="avatarUrl" :src="avatarUrl" alt="avatar" cover />
              <span v-else class="text-body-medium font-weight-bold text-white">{{ initials }}</span>
            </v-avatar>
          </template>
          <v-list-item-title class="font-weight-medium">{{ me?.fullName || me?.email }}</v-list-item-title>
          <v-list-item-subtitle v-if="me?.fullName" class="text-body-small text-medium-emphasis">{{ me?.email }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>

      <template v-if="!bareShell">
        <v-divider />

        <v-list density="compact" class="py-0">
          <v-list-item prepend-icon="mdi-account-outline" :title="$t('common.myProfile')" value="profile"
            @click="goToProfile" />
        </v-list>
      </template>

      <v-divider />

      <v-list density="compact" class="py-0">
        <!-- Tema: claro, oscuro, como el sistema y los de la empresa (docs/TEMAS.md). Reemplazó al interruptor «Modo nocturno»,
             que no guardaba la elección. En el alta todavía no hay empresa: no se ofrece. -->
        <v-list-item v-if="!bareShell" prepend-icon="mdi-palette-outline" :title="$t('themes.menu')" value="theme" data-menu-theme
          @click="openTheme">
          <template #append>
            <v-icon v-if="appTheme.locked" icon="mdi-lock-outline" size="16" class="ml-2 text-medium-emphasis" />
            <span class="text-body-medium text-medium-emphasis ml-2">{{ themeLabel }}</span>
            <v-icon icon="mdi-chevron-right" size="18" class="ml-1 text-medium-emphasis" />
          </template>
        </v-list-item>
        <!-- La fila entera es el botón: abre el selector de idioma al costado del menú. -->
        <LocaleSwitcher location="start">
          <template #activator="{ props: localeProps, current }">
            <v-list-item v-bind="localeProps" prepend-icon="mdi-translate" :title="$t('common.language')"
              value="language">
              <template #append>
                <span v-if="current" :class="`fi fi-${current.flag}`" class="rounded-sm elevation-1 ml-2" />
                <span class="text-body-medium text-medium-emphasis ml-2">{{ current?.nativeName }}</span>
                <v-icon icon="mdi-chevron-right" size="18" class="ml-1 text-medium-emphasis" />
              </template>
            </v-list-item>
          </template>
        </LocaleSwitcher>

        <v-list-item v-if="!bareShell" prepend-icon="mdi-help-circle-outline" :title="$t('tour.help')" value="tour"
          @click="openTour" />

        <v-list-item prepend-icon="mdi-bug-outline" :title="$t('report.menu')" value="report" @click="openReport" />
        <!-- Comentarios y mejoras (feedback-service): con número si el equipo de la plataforma respondió algo mío. -->
        <v-list-item v-if="!bareShell" prepend-icon="mdi-lightbulb-on-outline" :title="$t('feedbackBox.menu')" value="feedback-box" data-menu-feedback @click="go('feedback')">
          <template v-if="feedbackStore.unread" #append><v-badge :content="feedbackStore.unread" color="error" inline /></template>
        </v-list-item>
        <v-list-item
          v-if="!bareShell && auth.can('feedback:manage')"
          prepend-icon="mdi-inbox-arrow-down-outline"
          :title="$t('feedbackBox.platformMenu')"
          value="platform-feedback"
          data-menu-platform-feedback
          @click="go('platform-feedback')"
        >
          <template v-if="feedbackStore.platformUnread" #append><v-badge :content="feedbackStore.platformUnread" color="error" inline /></template>
        </v-list-item>
      </v-list>

      <v-divider />

      <v-list density="compact" class="py-0">
        <v-list-item
          v-if="feedbackUrl"
          prepend-icon="mdi-comment-outline"
          :title="$t('feedback.send')"
          value="feedback"
          :href="feedbackUrl"
          target="_blank"
          rel="noopener noreferrer"
        />
        <v-list-item prepend-icon="mdi-logout" :title="$t('common.logout')" value="logout" @click="logout" />
      </v-list>
      </v-card>
    </v-menu>
    <ThemeSwitcher v-if="!bareShell" v-model="themeOpen" />
  </v-app-bar>
</template>

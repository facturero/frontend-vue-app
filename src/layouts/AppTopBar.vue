<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useThemeToggle } from '@/composable/useThemeToggle';
import { LANGUAGES, useLocale } from '@/composable/useLocale';
import { useRouter } from 'vue-router';
import { resolveFileUrl } from '@/composable/useFileUrl';
import NotificationBell from '@/components/NotificationBell.vue';
import MessageInbox from '@/components/MessageInbox.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import { useAppTour } from '@/composable/useAppTour';
import { useBareShell } from '@/composable/useBareShell';
import { useAssistantStore } from '@/stores/assistant';
import type { Me } from '@/types/auth';

const ui = useUiStore();
const auth = useAuthStore();
const router = useRouter();
const { mobile } = useDisplay();
const { toggleTheme, isDark } = useThemeToggle();
const { locale, setLocale } = useLocale();
const bareShell = useBareShell();
const assistant = useAssistantStore();
const { startTour } = useAppTour();

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
    await auth.fetchMe();
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
      <NotificationBell />
      <MessageInbox />
    </template>

    <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom end" min-width="300" :offset="8">
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps" icon class="ml-2">
          <v-avatar :color="avatarUrl ? undefined : 'primary'" size="32">
            <v-img v-if="avatarUrl" :src="avatarUrl" alt="avatar" cover />
            <span v-else class="text-body-2 font-weight-bold text-white">{{ initials }}</span>
          </v-avatar>
        </v-btn>
      </template>

      <v-card>
        <v-list density="compact" class="pa-0 rounded-lg">
        <v-list-item class="py-3">
          <template #append>
            <v-avatar :color="avatarUrl ? undefined : 'primary'" size="40">
              <v-img v-if="avatarUrl" :src="avatarUrl" alt="avatar" cover />
              <span v-else class="text-body-2 font-weight-bold text-white">{{ initials }}</span>
            </v-avatar>
          </template>
          <v-list-item-title class="font-weight-medium">{{ me?.fullName || me?.email }}</v-list-item-title>
          <v-list-item-subtitle v-if="me?.fullName" class="text-caption text-medium-emphasis">{{ me?.email }}</v-list-item-subtitle>
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
        <!-- El switch es solo indicador: el clic lo recoge la fila entera, así no alterna dos veces. -->
        <v-list-item :prepend-icon="isDark() ? 'mdi-weather-night' : 'mdi-weather-sunny'" :title="$t('common.darkMode')"
          value="theme" @click="toggleTheme">
          <template #append>
            <v-switch :model-value="isDark()" color="primary" density="compact" hide-details readonly inset
              class="ml-2" />
          </template>
        </v-list-item>

        <v-list-item prepend-icon="mdi-translate" :title="$t('common.language')">
          <template #append>
            <v-btn-toggle :model-value="locale" mandatory divided density="compact" color="primary" class="ml-2"
              @update:model-value="setLocale">
              <v-btn v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code" :title="lang.label" size="small">
                {{ lang.code.toUpperCase() }}
              </v-btn>
            </v-btn-toggle>
          </template>
        </v-list-item>

        <v-list-item v-if="!bareShell" prepend-icon="mdi-help-circle-outline" :title="$t('tour.help')" value="tour"
          @click="openTour" />
      </v-list>

      <v-divider />

      <v-list density="compact" class="py-0">
        <v-list-item prepend-icon="mdi-logout" :title="$t('common.logout')" value="logout" @click="logout" />
      </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>
</template>

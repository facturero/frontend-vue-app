<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useThemeToggle } from '@/composable/useThemeToggle';
import { useRouter } from 'vue-router';
import { fileApi } from '@/api/files';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import MessageInbox from '@/components/MessageInbox.vue';
import type { Me } from '@/types/auth';

const ui = useUiStore();
const auth = useAuthStore();
const router = useRouter();
const { toggleTheme, isDark } = useThemeToggle();
const { mobile } = useDisplay();

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
    const blob = await fileApi.getDownloadBlob(fileId);
    if (avatarUrl.value) URL.revokeObjectURL(avatarUrl.value);
    avatarUrl.value = URL.createObjectURL(blob);
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
});

watch(() => me.value?.avatarFileId, () => {
  loadAvatar();
});

function goToProfile(): void {
  menuOpen.value = false;
  router.push({ name: 'profile' });
}

function logout(): void {
  menuOpen.value = false;
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-toolbar :elevation="mobile ? 0 : 2" density="comfortable" :rounded="mobile ? '0' : 'lg'">
    <v-card elevation="0" :rounded="mobile ? '0' : 'lg'" flat width="100%" height="100%" class="d-flex align-center px-4">
      <v-btn icon @click="ui.toggleDrawer()" class="d-lg-none">
        <v-icon icon="mdi-menu" />
      </v-btn>

      <v-spacer></v-spacer>

      <NotificationBell />
      <MessageInbox />

      <LocaleSwitcher />

      <v-btn icon @click="toggleTheme">
        <v-icon :icon="isDark() ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
      </v-btn>

      <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom end" min-width="220" :offset="8">
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

        <v-divider />

        <v-list density="compact" class="py-0">
          <v-list-item prepend-icon="mdi-account-outline" title="Mi perfil" value="profile" @click="goToProfile" />
        </v-list>

        <v-divider />

        <v-list density="compact" class="py-0">
          <v-list-item prepend-icon="mdi-logout" title="Cerrar sesión" value="logout" @click="logout" />
        </v-list>
        </v-card>
      </v-menu>
    </v-card>
  </v-toolbar>
</template>

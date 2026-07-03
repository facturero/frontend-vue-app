<script setup lang="ts">
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useThemeToggle } from '@/composable/useThemeToggle';
import { useRouter } from 'vue-router';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import MessageInbox from '@/components/MessageInbox.vue';

const ui = useUiStore();
const auth = useAuthStore();
const router = useRouter();
const { toggleTheme, isDark } = useThemeToggle();

function logout(): void {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-toolbar elevation="2" density="comfortable"  rounded="lg">
    <v-card elevation="0"  rounded="lg" flat width="100%" height="100%" class="d-flex align-center px-4">
      <v-spacer></v-spacer>

      <NotificationBell />
      <MessageInbox />

      <LocaleSwitcher />

      <v-btn icon @click="toggleTheme">
        <v-icon :icon="isDark() ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
      </v-btn>

      <v-btn icon @click="logout">
        <v-icon icon="mdi-logout" />
      </v-btn>

    </v-card>


  </v-toolbar>
</template>

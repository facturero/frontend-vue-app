<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import AppNavigationDrawer from '@/layouts/AppNavigationDrawer.vue';
import AppTopBar from '@/layouts/AppTopBar.vue';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const auth = useAuthStore();
const { mobile } = useDisplay();

const showShell = computed(() => !!route.meta.requiresAuth);

watch(
  mobile,
  (isMobile) => ui.setDrawer(!isMobile),
  { immediate: true },
);
</script>

<template>
  <v-app>
    <template v-if="showShell">
      <AppNavigationDrawer />
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

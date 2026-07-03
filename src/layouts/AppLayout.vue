<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';


const auth = useAuthStore();
const router = useRouter();
const drawer = ref(true);

const navItems = [
  { title: 'Home', icon: 'mdi-home', route: 'home' },
];

function logout(): void {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>

<AppTopBar />

  <v-main>
    <slot />
  </v-main>
</template>

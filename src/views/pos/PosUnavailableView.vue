<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import { isPosHost } from '@/utils/host-mode';

/**
 * Por qué esta persona no puede usar la caja. En el dominio `pos.` el CRM no existe, así que no hay otra pantalla a la que
 * mandarla: se le dice qué falta (el módulo del POS en su organización, o el permiso de facturar) y se le deja salir.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const reason = computed(() => (route.query.reason === 'plugin' ? 'plugin' : 'permission'));

function logout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="pa-4 pa-md-6">
    <PageHeader :title="$t('pos.unavailable.title')" :sticky="false" />
    <v-alert type="warning" class="mb-6">{{ $t(`pos.unavailable.${reason}`) }}</v-alert>
    <div class="d-flex flex-wrap ga-2">
      <v-btn v-if="!isPosHost()" variant="tonal" :to="{ name: 'home' }">{{ $t('pos.unavailable.home') }}</v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-logout" @click="logout">{{ $t('common.logout') }}</v-btn>
    </div>
  </div>
</template>

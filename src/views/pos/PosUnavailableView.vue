<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PosBrand from '@/components/pos/PosBrand.vue';
import { useAuthStore } from '@/stores/auth';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import { isPosHost } from '@/utils/host-mode';
import '@/styles/pos-kiosk.css';

/**
 * Por qué esta persona no puede usar la caja. En el dominio `pos.` el CRM no existe, así que no hay otra pantalla a la que
 * mandarla: se le dice qué falta (el módulo del POS en su organización, o el permiso de facturar) y se le deja salir.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = usePosCashierThemeStore();

const reason = computed(() => (route.query.reason === 'plugin' ? 'plugin' : 'permission'));

function logout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="pk pk-login" :style="theme.vars" :data-mode="theme.mode">
    <div class="pk-grow" :style="{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }">
      <div class="pk-login__card">
        <div class="pk-login__logo"><PosBrand :height="44" /></div>
        <h1 class="pk-login__title">{{ $t('pos.unavailable.title') }}</h1>
        <div class="pk-banner pk-banner--warn" :style="{ margin: '0 0 1.5rem' }" role="alert">
          <i class="mdi mdi-alert-outline" />
          <div class="pk-grow">{{ $t(`pos.unavailable.${reason}`) }}</div>
        </div>
        <div class="pk-modal__actions">
          <router-link v-if="!isPosHost()" :to="{ name: 'home' }" class="pk-btn pk-btn--alt">{{ $t('pos.unavailable.home') }}</router-link>
          <button type="button" class="pk-btn pk-btn--primary" @click="logout"><i class="mdi mdi-logout" /> {{ $t('common.logout') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

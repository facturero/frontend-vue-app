<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import PosBrand from '@/components/pos/PosBrand.vue';
import { useAuthStore } from '@/stores/auth';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';

/**
 * Cabecera de la caja, como la de escritorio: marca a la izquierda (o derecha, según el tema), el estado de la caja y el mensaje de
 * bienvenida del tema; a la derecha quién vende y «Salir». En lugar del estado de sincronización (aquí no hay base local) muestra el
 * punto de emisión con el que se factura, que se cambia desde la cabecera.
 */
defineProps<{ pointLabel: string | null }>();
const emit = defineEmits<{ 'change-point': [] }>();

const auth = useAuthStore();
const theme = usePosCashierThemeStore();
const router = useRouter();

const userName = computed(() => {
  const u = auth.user as { fullName?: string | null; email?: string } | null;
  return u?.fullName || u?.email || '';
});

function logout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <header class="pk-header" :class="{ 'pk-header--flip': theme.config.branding.logoPosition === 'right' }">
    <div class="pk-header__side">
      <PosBrand />
      <button type="button" class="pk-chip" :class="pointLabel ? 'pk-chip--ok' : 'pk-chip--warn'" :title="$t('pos.setup.change')" @click="emit('change-point')">
        <i class="mdi" :class="pointLabel ? 'mdi-cash-register' : 'mdi-alert-outline'" />
        {{ pointLabel ?? $t('pos.setup.required') }}
      </button>
      <span v-if="theme.config.branding.welcomeMessage" class="pk-welcome pk-truncate">{{ theme.config.branding.welcomeMessage }}</span>
    </div>
    <div class="pk-header__side pk-header__side--right">
      <router-link :to="{ name: 'home' }" class="pk-link pk-hide-sm"><i class="mdi mdi-view-dashboard-outline" /> {{ $t('pos.header.crm') }}</router-link>
      <span class="pk-sep pk-hide-sm">|</span>
      <span class="pk-hide-sm">{{ userName }}</span>
      <button type="button" class="pk-link pk-link--danger" @click="logout"><i class="mdi mdi-logout" /> {{ $t('pos.header.logout') }}</button>
    </div>
  </header>
</template>

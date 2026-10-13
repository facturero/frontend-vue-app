<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import PosBrand from '@/components/pos/PosBrand.vue';
import { useAuthStore } from '@/stores/auth';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import '@/styles/pos-kiosk.css';

/**
 * Acceso del dominio de la caja (`pos.`): la misma tarjeta centrada de la caja de escritorio, con el tema integrado (todavía no se
 * sabe de qué organización es quien entra). El CRM completo (registro, Google, etc.) no existe en este dominio.
 */
const auth = useAuthStore();
const theme = usePosCashierThemeStore();
const router = useRouter();

const email = ref('');
const password = ref('');

async function submit(): Promise<void> {
  try {
    await auth.login(email.value, password.value);
    // La respuesta del acceso no trae los permisos y la caja los exige para entrar (invoice:create): se piden antes de navegar, o el
    // primer acceso caería en «Caja no disponible» hasta recargar la página.
    await auth.fetchMe();
    await router.push({ name: 'home' });
  } catch {
    // el error ya queda en auth.error para mostrarse en la plantilla
  }
}
</script>

<template>
  <div class="pk pk-login" :style="theme.vars" :data-mode="theme.mode">
    <div class="pk-grow" :style="{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }">
      <form class="pk-login__card" @submit.prevent="submit">
        <div class="pk-login__logo"><PosBrand :height="44" byline /></div>
        <h1 class="pk-login__title">{{ $t('pos.login.title') }}</h1>

        <div class="pk-login__field">
          <label class="pk-label" for="pk-email">{{ $t('pos.login.email') }}</label>
          <input id="pk-email" v-model="email" type="email" class="pk-input" autofocus autocomplete="username" />
        </div>
        <div class="pk-login__field">
          <label class="pk-label" for="pk-password">{{ $t('pos.login.password') }}</label>
          <input id="pk-password" v-model="password" type="password" class="pk-input" autocomplete="current-password" />
        </div>

        <p v-if="auth.error" class="pk-error" role="alert">{{ auth.error }}</p>

        <button type="submit" class="pk-btn pk-btn--primary pk-btn--block" :disabled="auth.loading">
          {{ auth.loading ? $t('pos.login.submitting') : $t('pos.login.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>

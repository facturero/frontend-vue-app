<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import GoogleSignIn from '@/components/GoogleSignIn.vue';
import loginBg from '@/assets/login-bg.svg';

const { t } = useI18n();

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const email = ref('admin@admin.com');
const password = ref('admin');
const confirmPassword = ref('');
const identification = ref('');
const rememberDevice = ref(true);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const isLogin = computed(() => mode.value === 'login');

async function submit(): Promise<void> {
  try {
    if (isLogin.value) {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(email.value, password.value, identification.value || undefined);
    }
    if (auth.needsOrg) {
      router.push({ name: 'profile' });
    } else {
      router.push({ name: 'home' });
    }
  } catch {
    /* manejado por el store */
  }
}

function toggleMode(): void {
  mode.value = isLogin.value ? 'register' : 'login';
  auth.error = null;
}
</script>

<template>
  <v-row no-gutters class="h-lg-screen">
    <!-- Panel de marca -->
    <v-col cols="12" lg="7" class="d-flex">
      <v-sheet
        color="auth-panel"
        class="flex-1-1 ma-3 pa-6 position-relative d-flex align-center justify-center"
      >
        <div class="position-absolute top-0 left-0 d-flex align-center ga-3 pa-6">
          <v-avatar color="primary" size="38" rounded="lg">
            <v-icon icon="mdi-shield-lock-outline" size="22" />
          </v-avatar>
          <span class="text-h6 font-weight-bold">CRM</span>
        </div>

        <v-img
          :src="loginBg"
          :max-width="660"
          :aspect-ratio="620 / 520"
          alt="login-background"
          class="d-none d-lg-block"
        />
      </v-sheet>
    </v-col>

    <!-- Formulario -->
    <v-col cols="12" lg="5" class="d-flex align-center justify-center pa-3">
      <v-sheet :max-width="420" width="100%" color="transparent">
        <div class="d-flex justify-end mb-2">
          <LocaleSwitcher />
        </div>

        <h1 class="text-h5 font-weight-bold">{{ t('auth.welcomeTitle') }}</h1>
        <p class="text-body-2 text-medium-emphasis mt-1 mb-6">
          {{ t('auth.welcomeSubtitle') }}
        </p>

        <GoogleSignIn
          :locale="$i18n.locale"
          :divider-label="isLogin ? t('auth.orSignInWith') : t('auth.orSignUpWith')"
        />

        <v-alert
          v-if="auth.error"
          type="error"
          closable
          class="mb-6"
          @click:close="auth.error = null"
        >
          {{ auth.error }}
        </v-alert>

        <v-form class="d-flex flex-column ga-6" @submit.prevent="submit">
          <div>
            <v-label for="auth-email" class="text-body-2 font-weight-medium mb-2">
              {{ t('auth.email') }}
            </v-label>
            <v-text-field
              id="auth-email"
              v-model="email"
              type="email"
              autocomplete="email"
            />
          </div>

          <div v-if="!isLogin">
            <v-label for="auth-identification" class="text-body-2 font-weight-medium mb-2">
              {{ t('auth.idNumberLabel') }}
            </v-label>
            <v-text-field id="auth-identification" v-model="identification" />
          </div>

          <div>
            <v-label for="auth-password" class="text-body-2 font-weight-medium mb-2">
              {{ t('auth.password') }}
            </v-label>
            <v-text-field
              id="auth-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              :autocomplete="isLogin ? 'current-password' : 'new-password'"
              @click:append-inner="showPassword = !showPassword"
            />
          </div>

          <div v-if="!isLogin">
            <v-label for="auth-confirm-password" class="text-body-2 font-weight-medium mb-2">
              {{ t('auth.confirmPassword') }}
            </v-label>
            <v-text-field
              id="auth-confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
              autocomplete="new-password"
              @click:append-inner="showConfirmPassword = !showConfirmPassword"
            />
          </div>

          <div v-if="isLogin" class="d-flex align-center justify-space-between ga-2">
            <v-checkbox v-model="rememberDevice" :label="t('auth.rememberDevice')" />
            <a
              href="#"
              class="text-primary text-body-2 font-weight-medium text-decoration-none ml-auto"
              @click.prevent
            >
              {{ t('auth.forgotPassword') }}
            </a>
          </div>

          <v-btn size="large" color="primary" type="submit" block :loading="auth.loading">
            {{ isLogin ? t('auth.signIn') : t('auth.register') }}
          </v-btn>
        </v-form>

        <div class="d-flex flex-wrap align-center ga-1 mt-6">
          <span class="text-body-2 font-weight-medium">
            {{ isLogin ? t('auth.notRegisteredYet') : t('auth.alreadyRegistered') }}
          </span>
          <v-btn variant="plain" color="primary" density="comfortable" @click="toggleMode">
            {{ isLogin ? t('auth.createAccount') : t('auth.signIn') }}
          </v-btn>
        </div>
      </v-sheet>
    </v-col>
  </v-row>
</template>

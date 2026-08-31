<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import GoogleSignIn from '@/components/GoogleSignIn.vue';

const { t, locale } = useI18n();

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const step = ref<'email' | 'password'>('email');
const email = ref('admin@admin.com');
const password = ref('admin');
const confirmPassword = ref('');
const identification = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);

async function submit(): Promise<void> {
  try {
    if (mode.value === 'login') {
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
  mode.value = mode.value === 'login' ? 'register' : 'login';
  step.value = 'email';
  auth.error = null;
}

function goToPassword(): void {
  if (email.value) step.value = 'password';
}

function changeEmail(): void {
  step.value = 'email';
}

</script>

<template>
  <div class="auth-wrapper fill-height">
    <v-row no-gutters class="fill-height">
      <!-- Left: brand panel -->
      <v-col
        cols="12"
        md="5"
        class="pa-8 d-none d-md-flex flex-column auth-panel"
      >
        <div class="d-flex align-center">
          <v-avatar color="primary" variant="tonal" size="36" class="mr-2">
            <v-icon icon="mdi-shield-lock-outline" size="20" />
          </v-avatar>
          <span class="text-subtitle-1 font-weight-bold">CRM</span>
        </div>

        <div class="flex-grow-1 d-flex flex-column align-center justify-center text-center">
          <div class="auth-illustration mb-6">
            <v-icon icon="mdi-view-dashboard-outline" size="56" color="primary" />
          </div>
          <h6 class="text-h6 font-weight-bold mb-2">{{ mode === 'login' ? t('auth.notRegisteredYet') : t('auth.alreadyRegistered') }}</h6>
          <p class="text-body-2 text-medium-emphasis" style="max-width: 260px;">
            {{ mode === 'login' ? t('auth.descriptionLogin') : t('auth.descriptionRegister') }}
          </p>
        </div>
      </v-col>

      <!-- Right: form -->
      <v-col cols="12" md="7" class="pa-sm-8 pa-6 d-flex flex-column justify-center align-center bg-surface">
        <div class="auth-form-inner">
        <div class="d-flex justify-end mb-2">
          <LocaleSwitcher />
        </div>

        <v-card-item class="px-0">
          <v-card-title class="px-0 text-h5 font-weight-bold">{{ mode === 'login' ? t('auth.signIn') : t('auth.createAccount') }}</v-card-title>
          <v-card-subtitle class="px-0">{{ mode === 'login' ? t('auth.toAccessTemplate') : t('auth.registerToGetStarted') }}</v-card-subtitle>
        </v-card-item>

        <v-card-text class="px-0">

            <!-- Error alert -->
            <v-alert
              v-if="auth.error"
              type="error"
              variant="tonal"
              closable
              class="mb-4"
              density="compact"
              @click:close="auth.error = null"
            >
              {{ auth.error }}
            </v-alert>

            <v-form @submit.prevent="submit">
              <!-- Login: two-step flow -->
              <template v-if="mode === 'login'">
                <div v-if="step === 'email'">
                  <v-text-field
                    v-model="email"
                    :label="t('auth.email')"
                    variant="outlined"
                    density="compact"
                    class="mb-6"
                    hide-details="auto"
                  />
                  <v-btn
                    block
                    color="primary"
                    @click="goToPassword"
                  >
                    {{ t('auth.next') }}
                  </v-btn>
                </div>
                <div v-else>
                  <div
                    class="d-flex align-center border rounded py-1 px-2 mb-6"
                    style="background-color: rgba(var(--v-theme-secondary), var(--v-hover-opacity));"
                  >
                    <span class="text-caption">{{ email }}</span>
                    <v-spacer />
                    <v-btn
                      variant="text"
                      size="small"
                      color="primary"
                      @click="changeEmail"
                    >
                      {{ t('auth.change') }}
                    </v-btn>
                  </div>
                  <v-text-field
                    v-model="password"
                    :label="t('auth.password')"
                    variant="outlined"
                    density="compact"
                    class="mb-6"
                    :type="showPassword ? 'text' : 'password'"
                    :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    @click:append-inner="showPassword = !showPassword"
                    hide-details="auto"
                  />
                  <v-btn
                    block
                    color="primary"
                    type="submit"
                    class="mb-3"
                    :loading="auth.loading"
                  >
                    {{ t('auth.login') }}
                  </v-btn>
                  <v-btn
                    block
                    variant="tonal"
                    href="#"
                    @click.prevent
                  >
                    {{ t('auth.forgotPassword') }}
                  </v-btn>
                </div>
              </template>

              <!-- Register: all fields at once -->
              <template v-else>
                <v-text-field
                  v-model="email"
                  :label="t('auth.email')"
                  variant="outlined"
                  density="compact"
                  class="mb-6"
                  type="email"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="identification"
                  :label="$t('auth.idNumberLabel')"
                  variant="outlined"
                  density="compact"
                  class="mb-6"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="password"
                  :label="t('auth.password')"
                  variant="outlined"
                  density="compact"
                  class="mb-6"
                  :type="showPassword ? 'text' : 'password'"
                  :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                  @click:append-inner="showPassword = !showPassword"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="confirmPassword"
                  :label="t('auth.confirmPassword')"
                  variant="outlined"
                  density="compact"
                  class="mb-6"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
                  @click:append-inner="showConfirmPassword = !showConfirmPassword"
                  hide-details="auto"
                />
                <v-btn
                  block
                  color="primary"
                  type="submit"
                  class="mb-3"
                  :loading="auth.loading"
                >
                  {{ t('auth.register') }}
                </v-btn>
              </template>
            </v-form>

            <GoogleSignIn :locale="$i18n.locale" />

            <h6 class="text-body-2 text-medium-emphasis d-flex justify-center align-center mt-6">
              {{ mode === 'login' ? t('auth.notRegisteredYet') : t('auth.alreadyRegistered') }}
              <a
                href="#"
                class="text-primary text-decoration-none font-weight-medium pl-2"
                @click.prevent="toggleMode"
              >
                {{ mode === 'login' ? t('auth.register') : t('auth.login') }}
              </a>
            </h6>
        </v-card-text>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.auth-panel {
  background: rgba(var(--v-theme-primary), 0.06);
}

.auth-form-inner {
  width: 100%;
  max-width: 420px;
}

.auth-illustration {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 96px;
  block-size: 96px;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 24px -8px rgba(var(--v-theme-primary), 0.35);
}
</style>

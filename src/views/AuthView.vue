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
const showPassword = ref(false);
const showConfirmPassword = ref(false);

async function submit(): Promise<void> {
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(email.value, password.value);
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
  <div class="auth-wrapper d-flex align-center justify-center fill-height bg-background">
    <v-card
      max-width="900"
      class="mx-auto"
      rounded="lg"
      style="width: 100%;"
    >
      <v-row no-gutters >
        <!-- Left column: Form -->
        <v-col cols="12" md="6" class="pa-sm-8 pa-4">

          <v-card-item class="px-0">
            <v-card-title class="px-0">{{ mode === 'login' ? t('auth.signIn') : t('auth.createAccount') }}</v-card-title>
            <v-card-subtitle class="px-0">{{ mode === 'login' ? t('auth.toAccessTemplate') : t('auth.registerToGetStarted') }}</v-card-subtitle>
            <template #append>
              <a
                href="#"
                class="text-body-2 text-medium-emphasis d-block d-md-none"
                @click.prevent="toggleMode"
              >
                {{ mode === 'login' ? t('auth.register') : t('auth.login') }}
              </a>
            </template>
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
          </v-card-text>
        </v-col>

        <!-- Right column: Illustration & CTA -->
        <v-col
          cols="6"
          class="pa-8 text-center border-s d-none d-md-flex flex-column align-center justify-center position-relative"
          style="block-size: 33rem;"
        >

          <div class="position-absolute top-0 right-0 pa-4">
            <LocaleSwitcher />
          </div>

          <template v-if="mode === 'login'">
            <h6 class="text-body-1 font-weight-semibold mb-3">{{ t('auth.notRegisteredYet') }}</h6>
            <p class="text-body-2 text-medium-emphasis mb-6" style="max-width: 260px;">
              {{ t('auth.descriptionLogin') }}
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              append-icon="mdi-account-plus"
              @click="mode = 'register'; step = 'email'"
            >
              {{ t('auth.register') }}
            </v-btn>
          </template>
          <template v-else>
            <h6 class="text-body-1 font-weight-semibold mb-3">{{ t('auth.alreadyRegistered') }}</h6>
            <p class="text-body-2 text-medium-emphasis mb-6" style="max-width: 260px;">
              {{ t('auth.descriptionRegister') }}
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              append-icon="mdi-login"
              @click="toggleMode"
            >
              {{ t('auth.login') }}
            </v-btn>
          </template>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}
</style>

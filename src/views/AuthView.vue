<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const step = ref<'email' | 'password'>('email');
const email = ref('admin@admin.com');
const password = ref('admin');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const googleEnabled = !!googleClientId && !googleClientId.startsWith('xxxx');

async function submit(): Promise<void> {
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(email.value, password.value);
    }
    router.push({ name: 'home' });
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

function initGoogle(): void {
  if (!googleEnabled) return;
  const g = (window as unknown as { google?: any }).google;
  if (!g?.accounts?.id) return;
  g.accounts.id.initialize({
    client_id: googleClientId,
    callback: async (resp: { credential: string }) => {
      try {
        await auth.loginWithGoogle(resp.credential);
        router.push({ name: 'home' });
      } catch {
        /* manejado por el store */
      }
    },
  });
  const el = document.getElementById('google-btn');
  if (el) {
    g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 320 });
  }
}

onMounted(() => {
  setTimeout(initGoogle, 400);
});
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
            <v-card-title class="px-0">{{ mode === 'login' ? 'Sign in' : 'Create account' }}</v-card-title>
            <v-card-subtitle class="px-0">{{ mode === 'login' ? 'To access template' : 'Register to get started' }}</v-card-subtitle>
            <template #append>
              <a
                href="#"
                class="text-body-2 text-medium-emphasis d-block d-md-none"
                @click.prevent="toggleMode"
              >
                {{ mode === 'login' ? 'Register' : 'Login' }}
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
                    label="Email"
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
                    Next
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
                      change
                    </v-btn>
                  </div>
                  <v-text-field
                    v-model="password"
                    label="Password"
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
                    Login
                  </v-btn>
                  <v-btn
                    block
                    variant="tonal"
                    href="#"
                    @click.prevent
                  >
                    Forgot Password?
                  </v-btn>
                </div>
              </template>

              <!-- Register: all fields at once -->
              <template v-else>
                <v-text-field
                  v-model="email"
                  label="Email"
                  variant="outlined"
                  density="compact"
                  class="mb-6"
                  type="email"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="password"
                  label="Password"
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
                  label="Confirm Password"
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
                  Register
                </v-btn>
              </template>
            </v-form>

            <!-- Google sign-in (solo si configurado) -->
            <div v-if="googleEnabled" class="mt-4">
              <v-divider class="mb-4" />
              <div id="google-btn" class="d-flex justify-center"></div>
            </div>
          </v-card-text>
        </v-col>

        <!-- Right column: Illustration & CTA -->
        <v-col
          cols="6"
          class="pa-8 text-center border-s d-none d-md-flex flex-column align-center justify-center position-relative"
          style="block-size: 33rem;"
        >

          <div class="position-absolute top-0 right-0 pa-4">
            <v-menu :offset="[-8,-12]" location="bottom end">
              <template #activator="{ props }">
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  v-bind="props"
                >
                  <v-icon>mdi-web</v-icon>
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item value="en">
                  <v-list-item-title>English</v-list-item-title>
                </v-list-item>
                <v-list-item value="es">
                  <v-list-item-title>Español</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </div>

          <template v-if="mode === 'login'">
            <h6 class="text-body-1 font-weight-semibold mb-3">Not Register yet?</h6>
            <p class="text-body-2 text-medium-emphasis mb-6" style="max-width: 260px;">
              Lost access to OneAuth? Worry not. Set up passphrase and backup number to recover OneAuth easily.
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              append-icon="mdi-account-plus"
              @click="mode = 'register'; step = 'email'"
            >
              Register
            </v-btn>
          </template>
          <template v-else>
            <h6 class="text-body-1 font-weight-semibold mb-3">Already registered?</h6>
            <p class="text-body-2 text-medium-emphasis mb-6" style="max-width: 260px;">
              Go back to sign in with your existing account.
            </p>
            <v-btn
              color="primary"
              variant="tonal"
              append-icon="mdi-login"
              @click="toggleMode"
            >
              Login
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

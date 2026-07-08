<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authApi } from '@/api/auth';
import { setTokens } from '@/utils/http';
import { extractError } from '@/utils/error';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const token = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);

onMounted(() => {
  const tkn = route.query.token as string | undefined;
  if (tkn) {
    token.value = tkn;
  } else {
    error.value = 'No se encontró el token de invitación.';
  }
});

async function submit(): Promise<void> {
  if (password.value !== confirmPassword.value) {
    error.value = 'Las contraseñas no coinciden.';
    return;
  }
  if (password.value.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.';
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const data = await authApi.acceptInvite({ token: token.value, password: password.value });
    setTokens(data.accessToken, data.refreshToken);
    router.push({ name: 'profile' });
  } catch (e) {
    error.value = extractError(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-wrapper d-flex align-center justify-center fill-height bg-background">
    <v-card max-width="480" class="mx-auto" rounded="lg" style="width: 100%;">
      <v-card-item class="pa-6">
        <v-card-title>{{ t('auth.acceptInvite') }}</v-card-title>
        <v-card-subtitle>{{ t('auth.setPasswordToJoin') }}</v-card-subtitle>
      </v-card-item>

      <v-card-text class="pa-6 pt-0">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          closable
          class="mb-4"
          density="compact"
          @click:close="error = null"
        >
          {{ error }}
        </v-alert>

        <v-form @submit.prevent="submit">
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
            :loading="loading"
          >
            {{ t('auth.acceptAndContinue') }}
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}
</style>

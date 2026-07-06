<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    await auth.fetchMe();
    if (auth.needsOrg) {
      router.replace({ name: 'profile' });
    }
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    loadError.value = err?.response?.data?.message ?? 'No se pudo cargar /auth/me';
  }
});
</script>

<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" md="8" lg="7">
        <h2 class="text-h5 font-weight-medium mt-6 mb-4">Inicio</h2>

        <v-card elevation="4" rounded="lg">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-account-circle" class="mr-2" />
            Sesión activa
          </v-card-title>

          <v-card-text>
            <v-alert
              v-if="loadError"
              type="error"
              density="compact"
              variant="tonal"
              class="mb-4"
              :text="loadError"
            />

            <template v-if="auth.user">
              <v-list lines="two" density="comfortable">
                <v-list-item title="User ID" :subtitle="auth.user.id" prepend-icon="mdi-identifier" />
                <v-list-item
                  title="Email"
                  :subtitle="auth.user.email"
                  prepend-icon="mdi-email-outline"
                />
                <v-list-item
                  title="Email verificado"
                  :subtitle="auth.user.emailVerified ? 'Sí' : 'No'"
                  prepend-icon="mdi-check-decagram-outline"
                />
                <v-list-item
                  title="Proveedor"
                  :subtitle="auth.user.authProvider"
                  prepend-icon="mdi-account-key-outline"
                />
              </v-list>

              <v-alert
                type="success"
                variant="tonal"
                class="mt-4"
                text="GET /auth/me respondió a través del gateway ✔"
              />
            </template>

            <div v-else-if="!loadError" class="d-flex justify-center py-8">
              <v-progress-circular indeterminate color="primary" />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

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
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    loadError.value = err?.response?.data?.message ?? 'No se pudo cargar /auth/me';
  }
});

function logout(): void {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" md="7" lg="6">
        <div class="d-flex align-center justify-space-between mt-8 mb-4">
          <h2 class="text-h5 font-weight-medium">CRM · prueba de auth</h2>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-logout" @click="logout">
            Salir
          </v-btn>
        </div>

        <v-card elevation="4" rounded="lg">
          
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

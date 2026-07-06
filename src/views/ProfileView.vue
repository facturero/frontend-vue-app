<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { fileApi } from '@/api/files';
import ImageUploader from '@/components/ImageUploader.vue';
import type { Me } from '@/types/auth';
import type { FileResponse } from '@/types/files';

const auth = useAuthStore();
const router = useRouter();

const fullName = ref('');
const identificationType = ref('cedula');
const identificationNumber = ref('');
const loading = ref(false);
const checking = ref(true);
const saved = ref(false);

const avatarFiles = ref<FileResponse[]>([]);
const currentAvatarUrl = ref<string | null>(null);
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null);

const isSetup = computed(() => auth.needsOrg);
const userId = computed(() => (auth.user as Me | null)?.id ?? '');

onMounted(async () => {
  try {
    const me: Me = await auth.fetchMe();
    if (me.fullName) fullName.value = me.fullName;
    if (me.identification) {
      identificationType.value = me.identification.type;
      identificationNumber.value = me.identification.number;
    }
    if (me.id) {
      await loadAvatar(me.id);
    }
  } catch {
    // si falla fetchMe, mostrar formulario de todas formas
  } finally {
    checking.value = false;
  }
});

async function loadAvatar(userId: string): Promise<void> {
  try {
    const result = await fileApi.listByResource('user', userId, 'avatar');
    avatarFiles.value = result.files;
    if (result.files.length > 0) {
      const latest = result.files[0];
      const blob = await fileApi.getDownloadBlob(latest.id);
      currentAvatarUrl.value = URL.createObjectURL(blob);
    }
  } catch {
    // no hay avatar aún
  }
}

async function submit(): Promise<void> {
  if (!fullName.value || !identificationNumber.value) return;
  loading.value = true;
  auth.error = null;
  saved.value = false;
  try {
    let avatarFileId: string | undefined;
    if (imageUploaderRef.value?.hasPending()) {
      const ids = await imageUploaderRef.value.uploadAll();
      avatarFileId = ids[0];
    }
    await auth.completeProfile({
      fullName: fullName.value,
      identificationType: identificationType.value,
      identificationNumber: identificationNumber.value,
      avatarFileId,
    });
    await auth.fetchMe();
    if (isSetup.value) {
      router.push({ name: 'home' });
    } else {
      saved.value = true;
    }
  } catch {
    /* manejado por el store */
  } finally {
    loading.value = false;
  }
}

function onAvatarSuccess(fileIds: string[]): void {
  if (fileIds.length > 0 && userId.value) {
    if (currentAvatarUrl.value) URL.revokeObjectURL(currentAvatarUrl.value);
    loadAvatar(userId.value);
  }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center mt-6 mb-4">
      <h2 class="text-h5 font-weight-medium">{{ isSetup ? 'Completa tu perfil' : 'Mi perfil' }}</h2>
    </div>

    <v-row>
      <!-- Avatar column -->
      <v-col cols="12" md="4">
        <v-card elevation="2" rounded="lg">
          <v-card-text class="d-flex flex-column align-center">
            <ImageUploader
              ref="imageUploaderRef"
              style="width: 200px; height: 200px"
              v-if="userId"
              resource-type="user"
              :resource-id="userId"
              category="avatar"
              :existing-images="currentAvatarUrl ? [{ id: '', url: currentAvatarUrl }] : []"
              @upload-success="onAvatarSuccess"
            />
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Profile form column -->
      <v-col cols="12" md="8">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-4">
              {{ isSetup ? 'Necesitamos algunos datos para que puedas manejar tu cuenta' : 'Actualiza tus datos personales' }}
            </p>

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

            <v-alert
              v-if="saved"
              type="success"
              variant="tonal"
              closable
              class="mb-4"
              density="compact"
              @click:close="saved = false"
            >
              Perfil actualizado
            </v-alert>

            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="fullName"
                label="Nombre completo"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
              />

              <v-select
                v-model="identificationType"
                label="Tipo de identificación"
                :items="[
                  { title: 'Cédula', value: 'cedula' },
                  { title: 'RUC', value: 'ruc' },
                  { title: 'Pasaporte', value: 'pasaporte' },
                ]"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
              />

              <v-text-field
                v-model="identificationNumber"
                :label="identificationType === 'ruc' ? 'Número de RUC' : 'Número de identificación'"
                variant="outlined"
                density="compact"
                class="mb-6"
                hide-details="auto"
              />

              <v-btn
                block
                color="primary"
                type="submit"
                :loading="loading"
                :disabled="!fullName || !identificationNumber"
              >
                {{ isSetup ? 'Completar perfil' : 'Guardar cambios' }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

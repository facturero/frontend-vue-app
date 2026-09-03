<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { fileApi } from '@/api/files';
import ImageUploader from '@/components/ImageUploader.vue';
import type { Me } from '@/types/auth';
import type { FileResponse } from '@/types/files';
import PageHeader from '@/components/ui/PageHeader.vue';

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
    } else if (auth.needsOrgSetup) {
      router.push({ name: 'organization-settings' });
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
    <PageHeader :title="isSetup ? $t('profile.completeTitle') : $t('common.myProfile')" />

    <v-sheet :max-width="640" class="mx-auto" color="transparent">
      <v-card class="overflow-hidden">
        <div
          style="height: 120px; background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-info)) 100%)"
        />

        <v-card-text class="pt-0 pb-8 px-6">
          <div class="d-flex justify-center">
            <div class="position-relative" style="width: 148px; margin-top: -74px">
              <div
                class="rounded-circle overflow-hidden d-flex align-center justify-center"
                style="width: 148px; height: 148px; border: 4px solid rgb(var(--v-theme-surface)); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18); background: rgba(var(--v-theme-primary), 0.08)"
              >
                <ImageUploader
                  v-if="userId"
                  ref="imageUploaderRef"
                  style="width: 100%; height: 100%"
                  resource-type="user"
                  :resource-id="userId"
                  category="avatar"
                  compact
                  :existing-images="currentAvatarUrl ? [{ id: '', url: currentAvatarUrl }] : []"
                  @upload-success="onAvatarSuccess"
                />
              </div>

              <v-btn
                v-if="userId"
                icon="mdi-camera"
                size="small"
                rounded="circle"
                color="primary"
                elevation="2"
                class="position-absolute"
                style="right: 0; bottom: 0; border: 3px solid rgb(var(--v-theme-surface))"
                :aria-label="$t('profile.changePhoto')"
                @click="imageUploaderRef?.openPicker()"
              />
            </div>
          </div>

          <div v-if="checking" class="mt-8">
            <v-skeleton-loader type="text, text, text, button" />
          </div>

          <div v-else class="mt-8">
            <p class="text-body-2 text-medium-emphasis text-center mb-6">
              {{ isSetup ? $t('profile.setupIntro') : $t('profile.editIntro') }}
            </p>

            <v-alert
              v-if="auth.error"
              type="error"
              closable
              class="mb-4"
              @click:close="auth.error = null"
            >
              {{ auth.error }}
            </v-alert>

            <v-alert
              v-if="saved"
              type="success"
              closable
              class="mb-4"
              @click:close="saved = false"
            >
              {{ $t('profile.updated') }}
            </v-alert>

            <v-form class="d-flex flex-column ga-6" @submit.prevent="submit">
              <div>
                <v-label for="profile-full-name" class="text-body-2 font-weight-medium mb-2">
                  {{ $t('customers.fullName') }}
                </v-label>
                <v-text-field
                  id="profile-full-name"
                  v-model="fullName"
                  prepend-inner-icon="mdi-account-outline"
                />
              </div>

              <v-row>
                <v-col cols="12" sm="5">
                  <v-label class="text-body-2 font-weight-medium mb-2">
                    {{ $t('customers.idType') }}
                  </v-label>
                  <v-select
                    v-model="identificationType"
                    prepend-inner-icon="mdi-card-account-details-outline"
                    :items="[
                      { title: $t('profile.idTypeCedula'), value: 'cedula' },
                      { title: $t('profile.idTypeRuc'), value: 'ruc' },
                      { title: $t('profile.idTypePassport'), value: 'pasaporte' },
                    ]"
                  />
                </v-col>
                <v-col cols="12" sm="7">
                  <v-label for="profile-id-number" class="text-body-2 font-weight-medium mb-2">
                    {{ identificationType === 'ruc' ? $t('profile.rucNumber') : $t('customers.idNumber') }}
                  </v-label>
                  <v-text-field
                    id="profile-id-number"
                    v-model="identificationNumber"
                    prepend-inner-icon="mdi-identifier"
                  />
                </v-col>
              </v-row>

              <v-btn
                block
                size="large"
                color="primary"
                type="submit"
                :loading="loading"
                :disabled="!fullName || !identificationNumber"
              >
                {{ isSetup ? $t('profile.completeProfile') : $t('common.saveChanges') }}
              </v-btn>
            </v-form>
          </div>
        </v-card-text>
      </v-card>
    </v-sheet>
  </v-container>
</template>

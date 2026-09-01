<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    await auth.fetchMe();
    if (auth.needsOrg) {
      router.replace({ name: 'profile' });
    } else if (auth.needsOrgSetup) {
      router.replace({ name: 'organization-settings' });
    }
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    loadError.value = err?.response?.data?.message ?? t('home.loadError');
  }
});
</script>

<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" md="8" lg="7">
        <PageHeader :title="$t('home.title')" />

        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-account-circle" class="mr-2" />
            {{ $t('home.sessionActive') }}
          </v-card-title>

          <v-card-text>
            <v-alert
              v-if="loadError"
              type="error"
              class="mb-4"
              :text="loadError"
            />

            <template v-if="auth.user">
              <v-list lines="two" density="comfortable">
                <v-list-item :title="$t('home.userIdLabel')" :subtitle="auth.user.id" prepend-icon="mdi-identifier" />
                <v-list-item
                  :title="$t('common.email')"
                  :subtitle="auth.user.email"
                  prepend-icon="mdi-email-outline"
                />
                <v-list-item
                  :title="$t('home.emailVerified')"
                  :subtitle="auth.user.emailVerified ? $t('common.yes') : $t('common.no')"
                  prepend-icon="mdi-check-decagram-outline"
                />
                <v-list-item
                  :title="$t('home.providerLabel')"
                  :subtitle="auth.user.authProvider"
                  prepend-icon="mdi-account-key-outline"
                />
              </v-list>

              <v-alert
                type="success"
                class="mt-4"
                :text="$t('home.gatewayOk')"
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

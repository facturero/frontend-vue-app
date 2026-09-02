<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

defineProps<{ dividerLabel: string }>();

const auth = useAuthStore();
const router = useRouter();
const { locale } = useI18n();

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const enabled = !!clientId;

async function handleCredential(response: { credential: string }): Promise<void> {
  try {
    await auth.loginWithGoogle(response.credential);
    router.push({ name: auth.needsOrg ? 'profile' : 'home' });
  } catch {
    /* manejado por el store */
  }
}

onMounted(() => {
  if (!enabled) return;

  const script = document.createElement('script');
  script.src = `https://accounts.google.com/gsi/client?hl=${locale.value}`;
  script.async = true;
  script.onload = () => {
    const google = (window as unknown as { google?: any }).google;
    if (!google?.accounts?.id) return;
    google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    google.accounts.id.renderButton(document.getElementById('google-btn'), {
      theme: 'outline',
      size: 'large',
      width: 360,
    });
  };
  document.head.appendChild(script);
});
</script>

<template>
  <div v-if="enabled">
    <div id="google-btn" class="d-flex justify-center" />

    <div class="d-flex align-center ga-4 my-6">
      <v-divider />
      <span class="text-body-2 text-medium-emphasis flex-shrink-0">{{ dividerLabel }}</span>
      <v-divider />
    </div>
  </div>
</template>

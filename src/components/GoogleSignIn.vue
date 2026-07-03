<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ locale: string }>();

const auth = useAuthStore();
const router = useRouter();

const loading = ref(false);

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const enabled = !!googleClientId && !googleClientId.startsWith('xxxx');

function loadScript(locale: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
    if (existing) existing.remove();
    delete (window as any).google;
    const script = document.createElement('script');
    script.src = `https://accounts.google.com/gsi/client?hl=${locale}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

async function init(locale: string): Promise<void> {
  if (!enabled) return;
  loading.value = true;
  await loadScript(locale);
  const g = (window as unknown as { google?: any }).google;
  if (!g?.accounts?.id) {
    loading.value = false;
    return;
  }
  g.accounts.id.initialize({
    client_id: googleClientId,
    locale,
    callback: async (resp: { credential: string }) => {
      try {
        await auth.loginWithGoogle(resp.credential);
        router.push({ name: 'home' });
      } catch {
        /* manejado por el store */
      }
    },
  });
  const el = document.getElementById('google-btn-inner');
  if (el) {
    el.innerHTML = '';
    g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 320 });
  }
  loading.value = false;
}

onMounted(() => {
  setTimeout(() => init(props.locale), 300);
});

watch(() => props.locale, (val) => {
  init(val);
});
</script>

<template>
  <div v-if="enabled" class="mt-4">
    <v-divider class="mb-4" />
    <div
      :id="'google-btn-inner'"
      :key="locale"
      class="d-flex justify-center"
      :class="{ 'google-loading': loading }"
    />
  </div>
</template>

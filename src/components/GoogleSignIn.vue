<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ locale: string; dividerLabel?: string }>();

const auth = useAuthStore();
const router = useRouter();

const loading = ref(false);
const container = ref<HTMLElement | null>(null);

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

/** El botón de Google se renderiza en un iframe y sólo acepta un ancho numérico. */
function buttonWidth(): number {
  const w = container.value?.clientWidth ?? 320;
  return Math.min(400, Math.max(200, Math.round(w)));
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
        if (auth.needsOrg) {
          router.push({ name: 'profile' });
        } else {
          router.push({ name: 'home' });
        }
      } catch {
        /* manejado por el store */
      }
    },
  });
  const el = document.getElementById('google-btn-inner');
  if (el) {
    el.innerHTML = '';
    g.accounts.id.renderButton(el, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      logo_alignment: 'center',
      width: buttonWidth(),
    });
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
  <div v-if="enabled" ref="container">
    <div
      :id="'google-btn-inner'"
      :key="locale"
      class="d-flex justify-center"
    />

    <div v-if="dividerLabel" class="d-flex align-center ga-4 my-6">
      <v-divider />
      <span class="text-body-2 text-medium-emphasis flex-shrink-0">{{ dividerLabel }}</span>
      <v-divider />
    </div>
  </div>
</template>

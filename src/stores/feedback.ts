import { ref } from 'vue';
import { defineStore } from 'pinia';
import { feedbackApi } from '@/api/feedback';
import { useAuthStore } from '@/stores/auth';

/**
 * Contadores del buzón de comentarios y mejoras para el menú del avatar: novedades de lo mío (respuestas, estado, puntos) y, para el
 * dueño de la plataforma, envíos que todavía no leyó. Se piden al abrir el menú y al entrar a las pantallas; sin tiempo real (los
 * avisos llegan por la campana).
 */
export const useFeedbackStore = defineStore('feedback', () => {
  const unread = ref(0);
  const platformUnread = ref(0);

  async function refresh(): Promise<void> {
    const auth = useAuthStore();
    if (!auth.user) return;
    try {
      unread.value = await feedbackApi.unread();
      platformUnread.value = auth.can('feedback:manage') ? await feedbackApi.adminUnread() : 0;
    } catch {
      // Sin feedback-service (aún no desplegado o caído): el menú no muestra número; no es motivo para molestar.
    }
  }

  function reset(): void {
    unread.value = 0;
    platformUnread.value = 0;
  }

  return { unread, platformUnread, refresh, reset };
});

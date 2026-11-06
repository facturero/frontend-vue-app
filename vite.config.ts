import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Vuetify 4 apila los menús dentro de un diálogo con un `useStack` único. En desarrollo, el pre-empaquetado de Vite puede servir
  // parte de Vuetify desde su caché y parte sin empaquetar: quedan dos `useStack` y el menú se abre DETRÁS del diálogo. Forzar
  // estos módulos al pre-empaquetado lo evita (guía de migración de Vuetify 4, «Vite: overlay z-index in dev mode»).
  optimizeDeps: {
    include: ['vuetify/components/VOverlay', 'vuetify/components/VDialog', 'vuetify/components/VMenu', 'vuetify/components/VSelect', 'vuetify/components/VTooltip'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173, // coincide con CORS_ORIGIN del gateway y auth-service
    host: true, // escucha en 0.0.0.0 para que ngrok pueda proxear
    allowedHosts: [
      '.ngrok-free.app', // cualquier subdominio gratuito de ngrok
      '.ngrok.app',      // cualquier subdominio de pago/reservado
    ],
  },
});

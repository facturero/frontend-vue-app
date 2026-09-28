import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/**
 * Este fichero existe sobre todo por el `include` de abajo. Por defecto vitest
 * recoge cualquier `spec.ts` del repo, y los de `e2e/specs` son de Playwright:
 * sin acotar, vitest se los tragaba y los contaba como fallidos (15 de ellos), y
 * entonces un rojo en `npm test` no significa nada.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

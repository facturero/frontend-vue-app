import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Capturas de referencia de TODAS las pantallas, para comparar antes y después de un cambio que toca a toda la app (la migración a
 * Vuetify 4, ver docs/MIGRACION-VUETIFY-4.md). No es parte de la suite e2e: no comprueba nada, solo fotografía.
 *
 *   VISUAL_LABEL=v3 npx playwright test -c e2e/visual/visual.config.ts
 *
 * Deja los PNG y un manifest.json en `VISUAL_OUT` (por defecto `../.visual/<VISUAL_LABEL>`, fuera de cualquier repo: son pesados y
 * no son código). Usa la misma sesión que la suite e2e (global-setup.ts → e2e/.auth/user.json) y el frontend del contenedor (:5173).
 */
export default defineConfig({
  testDir: '.',
  globalSetup: '../global-setup.ts',
  // Solo lee: puede ir en paralelo, una combinación de tamaño y tema por worker.
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 30 * 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    storageState: resolve(here, '../.auth/user.json'),
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
    browserName: 'chromium',
  },
  projects: [
    // Primero, una sola vez: resolver las rutas con parámetro a URLs reales (routes.json).
    { name: 'descubrir', testMatch: 'discover.spec.ts', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'laptop-claro', use: { viewport: { width: 1366, height: 768 } }, testMatch: 'capture.spec.ts', dependencies: ['descubrir'], metadata: { dark: false } },
    { name: 'laptop-oscuro', use: { viewport: { width: 1366, height: 768 } }, testMatch: 'capture.spec.ts', dependencies: ['descubrir'], metadata: { dark: true } },
    { name: 'telefono-claro', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, testMatch: 'capture.spec.ts', dependencies: ['descubrir'], metadata: { dark: false } },
    { name: 'telefono-oscuro', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, testMatch: 'capture.spec.ts', dependencies: ['descubrir'], metadata: { dark: true } },
  ],
});

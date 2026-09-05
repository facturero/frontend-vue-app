import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  // La suite muta datos del backend de desarrollo compartido; un solo worker
  // evita interferencias entre ficheros (registros, creaciones, ediciones).
  workers: 1,
  forbidOnly: !!process.env.CI,
  // El backend de desarrollo parpadea bajo carga sostenida (páginas en blanco
  // puntuales); un reintento estabiliza la suite sin ocultar fallos reales.
  retries: process.env.CI ? 2 : 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    storageState: './e2e/.auth/user.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});

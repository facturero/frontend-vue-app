/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Dónde vive el sitio público de reservas (`reservas-web`). Por defecto https://reservas.noahsolution.com; en local, http://localhost:5180. */
  readonly VITE_RESERVATIONS_URL?: string;
  /** Telemetría hacia SigNoz: por defecto activa solo en el build de producción; 'true'/'false' fuerza el valor. */
  readonly VITE_OTEL_ENABLED?: string;
  /** Fracción de trazas que se envían (0 a 1). Por defecto 1. */
  readonly VITE_OTEL_SAMPLE_RATIO?: string;
  /** Versión de la app (SHA del commit): sale en cada span para saber qué despliegue falló. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

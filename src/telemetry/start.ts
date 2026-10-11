import { ParentBasedSampler, TraceIdRatioBasedSampler, BatchSpanProcessor, type Span, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { currentTelemetryContext } from './index';

/**
 * Registra el SDK: de aquí en adelante los spans de `index.ts` se exportan. Este archivo arrastra el SDK completo, por eso solo
 * se importa de forma dinámica (ver `startTelemetry`).
 *
 * El destino es el gateway (`/telemetry/v1/traces`), no el colector: el navegador de un cliente no llega a la red de
 * observabilidad, y el gateway pone el límite de peticiones y de tamaño.
 */

/** Añade a cada span dónde está la persona (ruta, usuario, organización...) sin que cada llamada tenga que acordarse. */
class ContextProcessor implements SpanProcessor {
  onStart(span: Span): void {
    for (const [key, value] of Object.entries(currentTelemetryContext())) {
      if (value) span.setAttribute(key, value);
    }
  }
  onEnd(): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export function start(): void {
  const base = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
  const ratio = Number(import.meta.env.VITE_OTEL_SAMPLE_RATIO ?? 1);

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'crm-frontend',
      [ATTR_SERVICE_VERSION]: import.meta.env.VITE_APP_VERSION ?? 'dev',
      'deployment.environment.name': import.meta.env.PROD ? 'production' : 'development',
    }),
    // Si la traza ya viene decidida (p. ej. un servicio que nos llamó) se respeta; si no, la fracción configurada.
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(Number.isFinite(ratio) ? ratio : 1) }),
    spanProcessors: [
      new ContextProcessor(),
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${base}/telemetry/v1/traces` }), {
        maxQueueSize: 200,
        maxExportBatchSize: 50,
        scheduledDelayMillis: 5000,
      }),
    ],
  });
  provider.register();

  // Al ocultar o cerrar la pestaña, lo pendiente se envía ya: si no, el último error antes de cerrar se perdería.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void provider.forceFlush();
  });
}

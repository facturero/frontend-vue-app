import { trace, SpanStatusCode } from '@opentelemetry/api';
import { formatBreadcrumbs, recentBreadcrumbs } from './breadcrumbs';
import { currentTelemetryContext, flushTelemetry, isTelemetryReady, telemetryEnabled } from './index';

/** Lo que la persona escribe se acota: no es un canal para pegar documentos, y todo viaja en un solo span. */
export const MAX_MESSAGE = 2000;

export interface ProblemReport {
  /** Qué pasó, con sus palabras. */
  message: string;
  /** Si es true, adjunta sus últimos pasos (llamadas a la API y navegación, sin contenido). */
  includeActivity: boolean;
}

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Envía un reporte de problema a SigNoz como un span `frontend.user_report`. Devuelve el código del reporte (el id de su traza):
 * la persona lo da a soporte y, en SigNoz, se busca por `trace_id` para ver el reporte con el resto de lo que pasó.
 *
 * Siempre se muestrea y se envía ya, sin esperar al lote de 5 s. Si la telemetría está apagada (desarrollo) no sale nada: se deja en
 * consola y el código es local, para que la pantalla se comporte igual.
 */
export async function submitProblemReport(report: ProblemReport): Promise<{ id: string; sent: boolean }> {
  const message = report.message.trim().slice(0, MAX_MESSAGE);
  const activity = report.includeActivity ? formatBreadcrumbs(recentBreadcrumbs()) : '';

  if (!telemetryEnabled() || !isTelemetryReady()) {
    console.info('[report] telemetría apagada o sin cargar: el reporte no se envió', { message, activity });
    return { id: randomId().slice(0, 12), sent: false };
  }

  const span = trace.getTracer('crm-frontend').startSpan('frontend.user_report', {
    attributes: {
      'app.report.message': message,
      'app.report.includes_activity': report.includeActivity,
      'app.report.url_path': window.location.pathname,
      'app.report.user_agent': navigator.userAgent.slice(0, 200),
      'app.report.online': navigator.onLine,
      ...(activity ? { 'app.report.activity': activity } : {}),
    },
  });
  // El contexto (ruta, usuario, organización, versión) lo añade el procesador al abrir el span; se repite aquí por si el
  // procesador no estuviera: un reporte sin quién ni dónde casi no sirve.
  for (const [key, value] of Object.entries(currentTelemetryContext())) if (value) span.setAttribute(key, value);
  span.setStatus({ code: SpanStatusCode.OK });
  const id = span.spanContext().traceId;
  span.end();
  await flushTelemetry();
  return { id, sent: true };
}

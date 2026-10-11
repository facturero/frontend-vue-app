import { context, propagation, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { maskBody, normalizePath } from './sanitize';

/**
 * Telemetría del navegador hacia SigNoz. Este archivo es la parte LIGERA: solo usa `@opentelemetry/api`, que sin SDK registrado
 * es un no-op (no crea spans ni cuesta nada). El SDK completo (`./start`) se carga aparte, tras montar la app, así que activar
 * la telemetría no retrasa la primera pantalla. Mientras no esté listo, o si está apagada, todo lo de aquí no hace nada.
 *
 * Qué viaja: una traza por llamada a la API, ENLAZADA con la del backend (cabecera `traceparent`), y los errores no controlados.
 * Una petición que falla añade su cuerpo y el de la respuesta, enmascarados (ver `sanitize.ts`).
 */

const TRACER = 'crm-frontend';

export type TelemetryContext = Record<string, string | undefined>;
let contextProvider: () => TelemetryContext = () => ({});

/** Quién y dónde está la persona (ruta, usuario, organización...): cada span lo lleva para poder filtrar en SigNoz. */
export function setTelemetryContext(provider: () => TelemetryContext): void {
  contextProvider = provider;
}
export function currentTelemetryContext(): TelemetryContext {
  try {
    return contextProvider();
  } catch {
    return {};
  }
}

export function telemetryEnabled(): boolean {
  const flag = import.meta.env.VITE_OTEL_ENABLED;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return import.meta.env.PROD;
}

/** Carga el SDK y empieza a exportar. Nunca lanza: la telemetría no puede romper la app. */
export async function startTelemetry(): Promise<void> {
  if (!telemetryEnabled()) return;
  try {
    const { start } = await import('./start');
    start();
    flushPendingErrors();
  } catch (e) {
    console.warn('[telemetry] no se pudo iniciar', e);
  }
}

// ── Llamadas HTTP ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const requestSpans = new WeakMap<object, Span>();

/** Abre el span de una llamada y le pone `traceparent` a la petición para que el gateway y los servicios cuelguen de él. */
export function traceRequest(config: InternalAxiosRequestConfig): void {
  const span = trace.getTracer(TRACER).startSpan(`HTTP ${(config.method ?? 'get').toUpperCase()} ${normalizePath(config.url ?? '')}`, {
    attributes: {
      'http.request.method': (config.method ?? 'get').toUpperCase(),
      'url.path': normalizePath(config.url ?? ''),
    },
  });
  if (!span.isRecording()) return;
  requestSpans.set(config, span);
  propagation.inject(trace.setSpan(context.active(), span), config.headers, {
    set: (carrier, key, value) => carrier.set(key, value),
  });
}

export function traceResponse(response: AxiosResponse): void {
  const span = requestSpans.get(response.config);
  if (!span) return;
  requestSpans.delete(response.config);
  span.setAttribute('http.response.status_code', response.status);
  span.end();
}

/**
 * Llamada fallida. El cuerpo de la petición y el de la respuesta se adjuntan solo aquí (y enmascarados): es lo que permite
 * reproducir el caso. Un 401 no los lleva: lo resuelve el refresco de sesión y su cuerpo no explica nada.
 */
export function traceFailure(error: AxiosError): void {
  const config = error.config;
  const span = config ? requestSpans.get(config) : undefined;
  if (!span || !config) return;
  requestSpans.delete(config);
  const status = error.response?.status;
  if (status) span.setAttribute('http.response.status_code', status);
  if (status !== 401) {
    const request = maskBody(config.data);
    const response = maskBody(error.response?.data);
    if (request) span.setAttribute('app.http.request_body', request);
    if (response) span.setAttribute('app.http.response_body', response);
  }
  span.setAttribute('error.type', status ? String(status) : (error.code ?? 'network'));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.end();
}

// ── Errores no controlados ─────────────────────────────────────────────────────────────────────────────────────────────────

const MAX_ERRORS_PER_MINUTE = 10;
const recent = new Map<string, number>();
let reportedThisMinute: number[] = [];
const pending: Array<{ error: unknown; source: string; at: number }> = [];
let sdkReady = false;

function fingerprint(error: unknown): string {
  if (error instanceof Error) return `${error.name}:${error.message}:${(error.stack ?? '').split('\n')[1] ?? ''}`;
  return String(error);
}

/**
 * Registra un error que nadie atrapó (Vue, `window.onerror`, promesas rechazadas). Se limita a 10 por minuto y no repite el
 * mismo error: un bucle de errores no debe inundar el colector ni el cupo de telemetría.
 */
export function reportError(error: unknown, source: string): void {
  const now = Date.now();
  const key = fingerprint(error);
  if (now - (recent.get(key) ?? 0) < 60_000) return;
  reportedThisMinute = reportedThisMinute.filter((t) => now - t < 60_000);
  if (reportedThisMinute.length >= MAX_ERRORS_PER_MINUTE) return;
  recent.set(key, now);
  reportedThisMinute.push(now);
  if (!telemetryEnabled()) return;
  // Los errores de arranque ocurren antes de que el SDK termine de cargar: se guardan y salen cuando esté listo.
  if (!sdkReady) {
    if (pending.length < 10) pending.push({ error, source, at: now });
    return;
  }
  emitError(error, source);
}

function emitError(error: unknown, source: string): void {
  const span = trace.getTracer(TRACER).startSpan('frontend.error', { attributes: { 'app.error.source': source } });
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error no controlado');
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.end();
}

function flushPendingErrors(): void {
  sdkReady = true;
  for (const p of pending.splice(0)) emitError(p.error, p.source);
}

/** Engancha los errores globales del navegador. Va aparte de `startTelemetry` para no perder los de arranque. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}

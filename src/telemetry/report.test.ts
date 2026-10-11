import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBreadcrumb, clearBreadcrumbs, formatBreadcrumbs, recentBreadcrumbs } from './breadcrumbs';

// Se sustituye ./start (arrastra el SDK completo y un exportador de red): aquí se registra uno propio con exportador en memoria.
const flush = vi.fn(async () => {});
vi.mock('./start', () => ({ start: () => {}, flush }));

const exporter = new InMemorySpanExporter();

describe('registro de lo último que hizo la persona', () => {
  beforeEach(clearBreadcrumbs);

  it('guarda solo los últimos 30 pasos', () => {
    for (let i = 0; i < 45; i++) addBreadcrumb({ kind: 'route', text: `paso ${i}` });
    const pasos = recentBreadcrumbs();
    expect(pasos).toHaveLength(30);
    expect(pasos[0].text).toBe('paso 15');
    expect(pasos.at(-1)?.text).toBe('paso 44');
  });

  it('una línea por paso: hora, qué, estado, duración y traza', () => {
    addBreadcrumb({ kind: 'http', text: 'POST /invoices/:id/lines', status: 400, ms: 119.6, traceId: 'bf893050a3790c05877494cd853dcbf8' });
    addBreadcrumb({ kind: 'route', text: 'abrió /invoices/new' });
    const [primera, segunda] = formatBreadcrumbs().split('\n');
    expect(primera).toMatch(/^\d{2}:\d{2}:\d{2} POST \/invoices\/:id\/lines → 400 \(120 ms\) traza=bf893050a3790c05877494cd853dcbf8$/);
    expect(segunda).toMatch(/^\d{2}:\d{2}:\d{2} abrió \/invoices\/new$/);
  });

  it('una traza vacía (span que no se grabó) no se imprime', () => {
    addBreadcrumb({ kind: 'http', text: 'GET /x', status: 200, traceId: '00000000000000000000000000000000' });
    expect(formatBreadcrumbs()).not.toContain('traza=');
  });
});

describe('reporte de problema', () => {
  beforeAll(async () => {
    vi.stubEnv('VITE_OTEL_ENABLED', 'true');
    vi.stubGlobal('window', { location: { pathname: '/invoices/new' }, addEventListener: () => {} });
    vi.stubGlobal('navigator', { userAgent: 'Prueba/1.0', onLine: true });
    new WebTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register();
    const { startTelemetry } = await import('./index');
    await startTelemetry(); // con ./start sustituido: solo deja el SDK «listo»
  });

  beforeEach(() => {
    exporter.reset();
    flush.mockClear();
    clearBreadcrumbs();
  });

  it('sale como un span frontend.user_report con el texto, y devuelve su traza como código', async () => {
    const { submitProblemReport } = await import('./report');
    const res = await submitProblemReport({ message: '  No agrega la segunda línea  ', includeActivity: false });
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('frontend.user_report');
    expect(span.attributes['app.report.message']).toBe('No agrega la segunda línea');
    expect(span.attributes['app.report.url_path']).toBe('/invoices/new');
    expect(span.attributes['app.report.includes_activity']).toBe(false);
    expect(res).toEqual({ id: span.spanContext().traceId, sent: true });
    expect(res.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('se envía ya, sin esperar al lote', async () => {
    const { submitProblemReport } = await import('./report');
    await submitProblemReport({ message: 'x', includeActivity: false });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('los últimos pasos viajan SOLO si la persona lo marca', async () => {
    const { submitProblemReport } = await import('./report');
    addBreadcrumb({ kind: 'http', text: 'POST /invoices/:id/lines', status: 400 });
    await submitProblemReport({ message: 'sin pasos', includeActivity: false });
    await submitProblemReport({ message: 'con pasos', includeActivity: true });
    const [sin, con] = exporter.getFinishedSpans();
    expect(sin.attributes['app.report.activity']).toBeUndefined();
    expect(String(con.attributes['app.report.activity'])).toContain('POST /invoices/:id/lines → 400');
    expect(con.attributes['app.report.includes_activity']).toBe(true);
  });

  it('el texto se acota a 2000 caracteres', async () => {
    const { submitProblemReport, MAX_MESSAGE } = await import('./report');
    await submitProblemReport({ message: 'a'.repeat(5000), includeActivity: false });
    expect(String(exporter.getFinishedSpans()[0].attributes['app.report.message'])).toHaveLength(MAX_MESSAGE);
  });

  it('las llamadas a la API entran en el registro de pasos (con ruta de plantilla, nunca con cuerpo)', async () => {
    const { traceRequest, traceResponse } = await import('./index');
    const config = {
      method: 'post',
      url: '/invoices/6f9619ff-8b86-4d11-b42d-00c04fc964ff/lines',
      headers: new AxiosHeaders(),
      data: JSON.stringify({ password: 'secreto' }),
    } as InternalAxiosRequestConfig;
    traceRequest(config);
    traceResponse({ config, status: 200 } as AxiosResponse);
    const texto = formatBreadcrumbs();
    expect(texto).toContain('POST /invoices/:id/lines → 200');
    expect(texto).not.toContain('secreto');
  });
});

describe('con la telemetría apagada', () => {
  it('no envía nada, deja el reporte en consola y aun así devuelve un código local', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_OTEL_ENABLED', 'false');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { submitProblemReport } = await import('./report');
    const res = await submitProblemReport({ message: 'x', includeActivity: true });
    expect(res.sent).toBe(false);
    expect(res.id).toMatch(/^[0-9a-f]{12}$/);
    expect(info).toHaveBeenCalled();
  });
});

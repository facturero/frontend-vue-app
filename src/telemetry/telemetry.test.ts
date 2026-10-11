import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { beforeAll, describe, expect, it } from 'vitest';
import { maskBody, maskShape, normalizePath, MAX_BODY_CHARS } from './sanitize';
import { traceFailure, traceRequest, traceResponse } from './index';

const ID = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';

function config(over: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig {
  return { method: 'post', url: `/invoices/${ID}/lines?x=1`, headers: new AxiosHeaders(), ...over } as InternalAxiosRequestConfig;
}

describe('maskBody: lo que sale del navegador va enmascarado', () => {
  it('los secretos no salen nunca', () => {
    const out = JSON.parse(
      maskBody({ email: 'a@b.com', password: 'hunter2', token: 'abc', refreshToken: 'def', p12Password: 'x', clave: 'y', apiKey: 'k' })!,
    );
    for (const k of ['password', 'token', 'refreshToken', 'p12Password', 'clave', 'apiKey']) expect(out[k], k).toBe('[REDACTED]');
  });

  it('los datos personales conservan la forma pero no el valor', () => {
    const out = JSON.parse(
      maskBody({ identification: '0912345678', email: 'juan@gmail.com', phone: '0991234567', businessName: 'Juan Pérez S.A.' })!,
    );
    expect(out.identification).toBe('9999999999');
    expect(out.email).toBe('xxxx@xxxxx.xxx');
    expect(out.phone).toBe('9999999999');
    expect(out.businessName).toBe('Xxxx Xxxxx X.X.');
    expect(JSON.stringify(out)).not.toMatch(/0912345678|juan|gmail/i);
  });

  it('lo necesario para reproducir el caso se queda tal cual: ids, cantidades e importes', () => {
    const out = JSON.parse(maskBody({ productId: ID, quantity: 3, unitPrice: '12.50', discountCents: 0 })!);
    expect(out).toEqual({ productId: ID, quantity: 3, unitPrice: '12.50', discountCents: 0 });
  });

  it('enmascara también dentro de listas y objetos anidados', () => {
    const out = JSON.parse(maskBody({ lines: [{ description: 'x', customer: { identification: '1712345678', password: 'p' } }] })!);
    expect(out.lines[0].customer).toEqual({ identification: '9999999999', password: '[REDACTED]' });
  });

  it('acepta el cuerpo como texto JSON (así lo deja axios en la configuración)', () => {
    expect(JSON.parse(maskBody('{"password":"p","qty":2}')!)).toEqual({ password: '[REDACTED]', qty: 2 });
  });

  it('un archivo o formulario no se serializa', () => {
    const form = new FormData();
    form.append('f', new Blob(['secreto']), 'a.p12');
    expect(JSON.parse(maskBody({ upload: form })!)).toEqual({ upload: '[binary]' });
  });

  it('se acota: strings largos, listas largas y el total', () => {
    const big = JSON.parse(maskBody({ note: 'a'.repeat(1000), items: Array.from({ length: 50 }, (_, i) => i) })!);
    expect(big.note.length).toBeLessThan(260);
    expect(big.items).toHaveLength(21);
    const huge = maskBody({ items: Array.from({ length: 20 }, () => ({ note: 'z'.repeat(190), other: 'z'.repeat(190) })) })!;
    expect(huge.length).toBeLessThanOrEqual(MAX_BODY_CHARS + 20);
  });

  it('no inventa nada cuando no hay cuerpo, y un texto que no es JSON solo se recorta', () => {
    expect(maskBody(undefined)).toBeUndefined();
    expect(maskBody('')).toBeUndefined();
    expect(maskBody('<html>502</html>')).toBe('<html>502</html>');
  });

  it('maskShape: dígitos, minúsculas y mayúsculas; el resto igual', () => {
    expect(maskShape('Ab-12 c.')).toBe('Xx-99 x.');
  });
});

describe('normalizePath', () => {
  it.each([
    [`/invoices/${ID}/lines?x=1`, '/invoices/:id/lines'],
    [`https://api.example.com/products/42`, '/products/:id'],
    ['/organizations/me/plugins/pos.core/activate', '/organizations/me/plugins/pos.core/activate'],
    ['', '/'],
  ])('%s → %s', (entrada, esperado) => expect(normalizePath(entrada)).toBe(esperado));
});

describe('sin SDK registrado (telemetría apagada o sin cargar)', () => {
  it('trazar una llamada no hace nada ni rompe: no añade cabeceras ni lanza', () => {
    const c = config();
    expect(() => {
      traceRequest(c);
      traceResponse({ config: c, status: 200 } as AxiosResponse);
    }).not.toThrow();
    expect(c.headers.has('traceparent')).toBe(false);
  });
});

describe('con SDK: una llamada a la API', () => {
  const exporter = new InMemorySpanExporter();
  // En beforeAll y no al declarar: si no, el SDK ya estaría registrado cuando corre la prueba «sin SDK».
  beforeAll(() => new WebTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }).register());

  function fail(c: InternalAxiosRequestConfig, status: number, data: unknown): AxiosError {
    return new AxiosError('Request failed', 'ERR_BAD_REQUEST', c, {}, { status, data, statusText: '', headers: {}, config: c } as AxiosResponse);
  }

  it('la llamada va con traceparent, para que el backend cuelgue de la traza del navegador', () => {
    exporter.reset();
    const c = config();
    traceRequest(c);
    expect(String(c.headers.get('traceparent'))).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    traceResponse({ config: c, status: 200 } as AxiosResponse);
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('HTTP POST /invoices/:id/lines');
    expect(span.attributes['http.response.status_code']).toBe(200);
    expect(span.attributes['app.http.request_body']).toBeUndefined();
    expect(String(c.headers.get('traceparent'))).toContain(span.spanContext().traceId);
  });

  it('si falla lleva su cuerpo y el de la respuesta, enmascarados, y queda en error', () => {
    exporter.reset();
    const c = config({ data: JSON.stringify({ productId: ID, quantity: 1, unitPrice: '2,50', identification: '0912345678' }) });
    traceRequest(c);
    traceFailure(fail(c, 400, { error: { code: 'BAD_REQUEST', message: 'Precio inválido' }, token: 'x' }));
    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(2);
    expect(span.attributes['http.response.status_code']).toBe(400);
    expect(String(span.attributes['app.http.request_body'])).toContain('"unitPrice":"2,50"');
    expect(String(span.attributes['app.http.request_body'])).not.toContain('0912345678');
    expect(String(span.attributes['app.http.response_body'])).toContain('Precio inválido');
    expect(String(span.attributes['app.http.response_body'])).not.toContain('"x"');
    expect(span.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('un 401 no adjunta cuerpos: lo resuelve el refresco de sesión y no explica nada', () => {
    exporter.reset();
    const c = config({ data: JSON.stringify({ a: 1 }) });
    traceRequest(c);
    traceFailure(fail(c, 401, { message: 'expired' }));
    const [span] = exporter.getFinishedSpans();
    expect(span.attributes['app.http.request_body']).toBeUndefined();
    expect(span.attributes['app.http.response_body']).toBeUndefined();
  });

  it('un fallo de red (sin respuesta) también cierra el span', () => {
    exporter.reset();
    const c = config();
    traceRequest(c);
    traceFailure(new AxiosError('Network Error', 'ERR_NETWORK', c));
    const [span] = exporter.getFinishedSpans();
    expect(span.attributes['error.type']).toBe('ERR_NETWORK');
  });
});

import { describe, expect, it, vi } from 'vitest';

// El cliente http lee localStorage en su interceptor; en Node no existe.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const { http } = await import('@/utils/http');
const { fiscalApi } = await import('./fiscal');

describe('fiscalApi.uploadCertificate', () => {
  it('manda el archivo como multipart/form-data y no como JSON', async () => {
    let enviado: { data: unknown; contentType: unknown } | undefined;
    // Un adaptador propio deja correr las transformaciones de axios y captura lo que saldría por la red.
    http.defaults.adapter = async (config) => {
      enviado = { data: config.data, contentType: config.headers.get('Content-Type') };
      return { data: {}, status: 201, statusText: 'Created', headers: {}, config };
    };

    const archivo = new File([new Uint8Array([1, 2, 3])], 'firma.p12');
    await fiscalApi.uploadCertificate(archivo, 'clave-de-prueba', 'Mi firma');

    expect(enviado?.data).toBeInstanceOf(FormData);
    const form = enviado?.data as FormData;
    expect((form.get('file') as File).name).toBe('firma.p12');
    expect(form.get('password')).toBe('clave-de-prueba');
    expect(form.get('alias')).toBe('Mi firma');
    // Con `application/json` axios habría serializado el FormData a '{"file":{}}'.
    expect(String(enviado?.contentType)).toContain('multipart/form-data');
  });
});

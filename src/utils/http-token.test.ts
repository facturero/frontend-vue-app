import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El socket del asistente no tiene interceptor de 401: antes de cada mensaje pide un token con vida suficiente
 * (`freshAccessToken`). Sin esto el gateway seguía con el del handshake, caducado a los 15 minutos.
 */
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const post = vi.hoisted(() => vi.fn());
vi.mock('axios', async (orig) => {
  const real = (await orig()) as { default: Record<string, unknown> };
  return { ...real, default: { ...real.default, create: (real.default.create as (...a: unknown[]) => unknown).bind(real.default), post } };
});

import { freshAccessToken, tokenSecondsLeft } from './http';

const jwt = (secondsFromNow: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })).replace(/=+$/, '')}.s`;

beforeEach(() => {
  store.clear();
  post.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('freshAccessToken', () => {
  it('lee la vida que le queda a un token', () => {
    // `exp` va en segundos enteros: según la fracción del segundo actual quedan entre 599 y 600.
    const left = tokenSecondsLeft(jwt(600))!;
    expect(left).toBeGreaterThan(598.9);
    expect(left).toBeLessThanOrEqual(600);
    expect(tokenSecondsLeft('basura')).toBeNull();
  });

  it('si al token le queda vida, lo devuelve sin renovar', async () => {
    const t = jwt(600);
    store.set('accessToken', t);
    expect(await freshAccessToken()).toBe(t);
    expect(post).not.toHaveBeenCalled();
  });

  it('si está por caducar, lo renueva con el refresh token y guarda el nuevo', async () => {
    store.set('accessToken', jwt(20));
    store.set('refreshToken', 'r1');
    const nuevo = jwt(900);
    post.mockResolvedValue({ data: { accessToken: nuevo, refreshToken: 'r2' } });
    expect(await freshAccessToken()).toBe(nuevo);
    expect(post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'r1' }, expect.anything());
    expect(store.get('refreshToken')).toBe('r2');
  });

  it('con force renueva aunque le quede vida (el gateway dijo que no vale)', async () => {
    store.set('accessToken', jwt(600));
    store.set('refreshToken', 'r1');
    post.mockResolvedValue({ data: { accessToken: 'nuevo', refreshToken: 'r2' } });
    expect(await freshAccessToken(60, true)).toBe('nuevo');
  });

  it('sin sesión o si la renovación falla, devuelve null', async () => {
    expect(await freshAccessToken()).toBeNull();
    store.set('accessToken', jwt(10));
    store.set('refreshToken', 'r1');
    post.mockRejectedValue(new Error('401'));
    expect(await freshAccessToken()).toBeNull();
  });
});

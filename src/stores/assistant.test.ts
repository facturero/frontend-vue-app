import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  send: vi.fn(),
  decide: vi.fn(),
  conversations: vi.fn(),
  conversation: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock('@/api/assistant', () => ({ assistantApi: api }));
// Sin socket: el store cae al HTTP, que es lo que se simula aquí.
vi.mock('@/utils/realtime', () => ({ isConnected: () => false, assistantSend: vi.fn(), assistantDecide: vi.fn() }));
vi.mock('@/utils/error', () => ({ extractError: () => 'falló' }));

import { useAssistantStore } from './assistant';

const httpError = (status: number) => Object.assign(new Error('http'), { response: { status } });

/** Sin servidores de IA no se escribe ni se confirma; el historial se sigue leyendo; y se reabre solo cuando vuelven. */
describe('asistente — disponibilidad de los servidores de IA', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    for (const fn of Object.values(api)) fn.mockReset();
    api.conversations.mockResolvedValue([]);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sin servidores no manda el mensaje ni lo pinta', async () => {
    api.status.mockResolvedValue({ available: false, servers: 2, healthy: 0, checkedAt: null });
    const store = useAssistantStore();
    await store.checkStatus();
    await store.send('¿cuánto vendí?');
    expect(store.available).toBe(false);
    expect(api.send).not.toHaveBeenCalled();
    expect(store.messages).toEqual([]);
  });

  it('sin servidores tampoco confirma una propuesta: reanudaría el modelo', async () => {
    api.status.mockResolvedValue({ available: false, servers: 2, healthy: 0, checkedAt: null });
    const store = useAssistantStore();
    await store.checkStatus();
    await store.decide('a1', true);
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('el historial se abre aunque no haya servidores', async () => {
    api.status.mockResolvedValue({ available: false, servers: 2, healthy: 0, checkedAt: null });
    api.conversation.mockResolvedValue({ id: 'c1', messages: [{ role: 'user', text: 'hola', createdAt: '' }], pendingActions: [] });
    const store = useAssistantStore();
    await store.checkStatus();
    await store.openConversation('c1');
    expect(store.messages).toHaveLength(1);
  });

  it('un 503 del gateway cierra el chat; un 404 (servicio sin la ruta todavía) no', async () => {
    const store = useAssistantStore();
    api.status.mockRejectedValueOnce(httpError(404));
    await store.checkStatus();
    expect(store.available).toBe(true);
    api.status.mockRejectedValueOnce(httpError(503));
    await store.checkStatus();
    expect(store.available).toBe(false);
  });

  it('un envío que falla vuelve a preguntar, y el chat se cierra sin esperar al sondeo', async () => {
    api.status.mockResolvedValue({ available: false, servers: 2, healthy: 0, checkedAt: null });
    api.send.mockRejectedValue(httpError(503));
    const store = useAssistantStore();
    await store.send('hola');
    await vi.waitFor(() => expect(store.available).toBe(false));
    expect(store.error).toBe('falló');
  });

  it('mientras está abierto sondea cada 20 s y se reabre cuando una tarjeta vuelve', async () => {
    vi.useFakeTimers();
    api.status.mockResolvedValue({ available: false, servers: 2, healthy: 0, checkedAt: null });
    const store = useAssistantStore();
    store.watchStatus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.available).toBe(false);

    api.status.mockResolvedValue({ available: true, servers: 2, healthy: 1, checkedAt: null });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.available).toBe(true);

    store.watchStatus(false);
    api.status.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.status).not.toHaveBeenCalled();
  });
});

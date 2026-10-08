import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { CartQuote, CartQuoteItem } from '@/types/plugins';

const api = vi.hoisted(() => ({
  cartQuote: vi.fn(),
  cartActivate: vi.fn(),
}));
vi.mock('@/api/plugins', () => ({ pluginApi: api }));
vi.mock('@/stores/plugins', () => ({
  usePluginsStore: () => ({ fetchMy: vi.fn().mockResolvedValue(undefined), fetchCatalog: vi.fn().mockResolvedValue(undefined) }),
}));

import { usePluginCartStore } from './pluginCart';

const item = (code: string, kind: CartQuoteItem['kind'] = 'selected'): CartQuoteItem =>
  ({ plugin: { code, name: code, currency: 'USD' }, price: 1000, kind }) as unknown as CartQuoteItem;
const quote = (items: CartQuoteItem[], extra: Partial<CartQuote> = {}): CartQuote => ({
  items,
  invalid: [],
  missing: [],
  total_monthly: items.length * 1000,
  ...extra,
});

describe('carrito de módulos', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.cartQuote.mockReset();
    api.cartActivate.mockReset();
  });

  it('agregar es idempotente y alternar quita lo que ya estaba', () => {
    const cart = usePluginCartStore();
    cart.add('a');
    cart.add('a');
    expect(cart.codes).toEqual(['a']);
    api.cartQuote.mockResolvedValue(quote([]));
    cart.toggle('a');
    expect(cart.codes).toEqual([]);
  });

  it('cotiza los códigos del carrito en el servidor', async () => {
    const cart = usePluginCartStore();
    api.cartQuote.mockResolvedValue(quote([item('a'), item('b', 'required')]));
    cart.add('a');

    await cart.refresh();

    expect(api.cartQuote).toHaveBeenCalledWith(['a'], undefined);
    expect(cart.quote?.items).toHaveLength(2);
  });

  it('quita del carrito, y avisa, lo que el servidor dice que ya no se puede activar o que ya estaba activo', async () => {
    const cart = usePluginCartStore();
    cart.add('a');
    cart.add('ya');
    cart.add('roto');
    api.cartQuote
      .mockResolvedValueOnce(quote([item('a'), item('ya', 'already_active')], { invalid: [{ code: 'roto', reason: 'not_available' }] }))
      .mockResolvedValueOnce(quote([item('a')]));

    await cart.refresh();

    expect(cart.codes).toEqual(['a']);
    expect(cart.dropped.sort()).toEqual(['roto', 'ya']);
    expect(cart.quote?.items.map((i) => i.plugin.code)).toEqual(['a']);
  });

  it('un carrito que se queda vacío no deja cotización', async () => {
    const cart = usePluginCartStore();
    cart.add('roto');
    api.cartQuote.mockResolvedValue(quote([], { invalid: [{ code: 'roto', reason: 'not_found' }] }));

    await cart.refresh();

    expect(cart.codes).toEqual([]);
    expect(cart.quote).toBeNull();
  });

  it('el código de descuento solo viaja al activar si la cotización lo aceptó', async () => {
    const cart = usePluginCartStore();
    cart.add('a');
    api.cartQuote.mockResolvedValue(
      quote([item('a')], { discount: { code: 'DIEZ', name: '10 %', kind: 'percent', discount_cents: 100, duration_months: null } }),
    );
    await cart.refresh('DIEZ');
    api.cartActivate.mockResolvedValue([{ pluginCode: 'a' }]);

    await cart.checkout();

    expect(api.cartActivate).toHaveBeenCalledWith(['a'], 'DIEZ');
  });

  it('activar con éxito vacía el carrito, lo cierra y cuenta lo activado', async () => {
    const cart = usePluginCartStore();
    cart.add('a');
    cart.open = true;
    api.cartActivate.mockResolvedValue([{ pluginCode: 'a' }, { pluginCode: 'b' }]);

    expect(await cart.checkout()).toBe(true);

    expect(cart.codes).toEqual([]);
    expect(cart.open).toBe(false);
    expect(cart.lastActivated).toBe(2);
  });

  it('si el servidor rechaza, el carrito queda como estaba y se muestra el motivo', async () => {
    const cart = usePluginCartStore();
    cart.add('a');
    cart.open = true;
    api.cartActivate.mockRejectedValue({ response: { data: { message: 'No se pudo.' } } });

    expect(await cart.checkout()).toBe(false);

    expect(cart.codes).toEqual(['a']);
    expect(cart.open).toBe(true);
    expect(cart.error).toBeTruthy();
  });
});

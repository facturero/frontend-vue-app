import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { CartQuote, CartQuoteItem } from '@/types/plugins';

const api = vi.hoisted(() => ({
  cartGet: vi.fn(),
  cartAdd: vi.fn(),
  cartRemove: vi.fn(),
  cartClear: vi.fn(),
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

describe('carrito de módulos (guardado en el servidor)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    for (const fn of Object.values(api)) fn.mockReset();
    api.cartAdd.mockResolvedValue([]);
    api.cartRemove.mockResolvedValue([]);
    api.cartClear.mockResolvedValue(undefined);
    api.cartQuote.mockResolvedValue(quote([]));
  });

  it('al abrir la pantalla recupera el carrito guardado, aunque se haya armado en otro equipo', async () => {
    api.cartGet.mockResolvedValue([{ code: 'a', addedAt: '', addedByUserId: null }, { code: 'b', addedAt: '', addedByUserId: null }]);
    const cart = usePluginCartStore();

    await cart.load();

    expect(cart.codes).toEqual(['a', 'b']);
    expect(cart.loaded).toBe(true);
  });

  it('agregar lo guarda en el servidor, y es idempotente', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    await cart.add('a');

    expect(cart.codes).toEqual(['a']);
    expect(api.cartAdd).toHaveBeenCalledTimes(1);
    expect(api.cartAdd).toHaveBeenCalledWith('a');
  });

  it('si el servidor rechaza agregar, se revierte y se muestra el motivo', async () => {
    const cart = usePluginCartStore();
    api.cartAdd.mockRejectedValue({ response: { data: { message: 'Ya está activo.' } } });

    await cart.add('a');

    expect(cart.codes).toEqual([]);
    expect(cart.error).toBeTruthy();
  });

  it('quitar y alternar también pasan por el servidor', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    await cart.toggle('a');

    expect(cart.codes).toEqual([]);
    expect(api.cartRemove).toHaveBeenCalledWith('a');
  });

  it('vaciar borra también el carrito guardado', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    await cart.clear();

    expect(cart.codes).toEqual([]);
    expect(api.cartClear).toHaveBeenCalledTimes(1);
  });

  it('cerrar sesión limpia la copia local pero NO el carrito del servidor', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');

    cart.reset();

    expect(cart.codes).toEqual([]);
    expect(cart.loaded).toBe(false);
    expect(api.cartClear).not.toHaveBeenCalled();
  });

  it('cotiza los códigos del carrito en el servidor', async () => {
    const cart = usePluginCartStore();
    api.cartQuote.mockResolvedValue(quote([item('a'), item('b', 'required')]));
    await cart.add('a');

    await cart.refresh();

    expect(api.cartQuote).toHaveBeenLastCalledWith(['a'], undefined);
    expect(cart.quote?.items).toHaveLength(2);
  });

  it('quita del carrito (y del servidor), y avisa, lo que ya no se puede activar o ya estaba activo', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    await cart.add('ya');
    await cart.add('roto');
    api.cartQuote
      .mockResolvedValueOnce(quote([item('a'), item('ya', 'already_active')], { invalid: [{ code: 'roto', reason: 'not_available' }] }))
      .mockResolvedValueOnce(quote([item('a')]));

    await cart.refresh();

    expect(cart.codes).toEqual(['a']);
    expect(cart.dropped.sort()).toEqual(['roto', 'ya']);
    expect(api.cartRemove).toHaveBeenCalledWith('roto');
    expect(api.cartRemove).toHaveBeenCalledWith('ya');
  });

  it('el código de descuento solo viaja al activar si la cotización lo aceptó', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    api.cartQuote.mockResolvedValue(
      quote([item('a')], { discount: { code: 'DIEZ', name: '10 %', kind: 'percent', discount_cents: 100, duration_months: null } }),
    );
    await cart.refresh('DIEZ');
    api.cartActivate.mockResolvedValue([{ pluginCode: 'a' }]);

    await cart.checkout();

    expect(api.cartActivate).toHaveBeenCalledWith(['a'], 'DIEZ');
  });

  it('activar con éxito vacía la copia local, cierra el carrito y cuenta lo activado', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    cart.open = true;
    api.cartActivate.mockResolvedValue([{ pluginCode: 'a' }, { pluginCode: 'b' }]);

    expect(await cart.checkout()).toBe(true);

    expect(cart.codes).toEqual([]);
    expect(cart.open).toBe(false);
    expect(cart.lastActivated).toBe(2);
    expect(api.cartClear).not.toHaveBeenCalled(); // el servidor ya sacó lo activado del carrito
  });

  it('si el servidor rechaza activar, el carrito queda como estaba y se muestra el motivo', async () => {
    const cart = usePluginCartStore();
    await cart.add('a');
    cart.open = true;
    api.cartActivate.mockRejectedValue({ response: { data: { message: 'No se pudo.' } } });

    expect(await cart.checkout()).toBe(false);

    expect(cart.codes).toEqual(['a']);
    expect(cart.open).toBe(true);
    expect(cart.error).toBeTruthy();
  });
});

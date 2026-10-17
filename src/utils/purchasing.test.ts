import { describe, expect, it } from 'vitest';
import { grossCents, lineAmounts, orderActions, parseQuantityMicros, sumAmounts } from './purchasing';

describe('cantidades', () => {
  it('se leen con hasta 6 decimales y aceptan coma', () => {
    expect(parseQuantityMicros('2.5')).toBe(2_500_000n);
    expect(parseQuantityMicros('2,5')).toBe(2_500_000n);
    expect(parseQuantityMicros('0.000001')).toBe(1n);
    expect(parseQuantityMicros(' 10 ')).toBe(10_000_000n);
  });

  it.each(['', '0', '-1', '1.2345678', 'abc', '1e3', '1.'])('rechaza %j', (bad) => {
    expect(parseQuantityMicros(bad)).toBeNull();
  });
});

describe('importes de una línea (igual que el servidor)', () => {
  it('cantidad × costo, redondeo a la mitad hacia arriba', () => {
    expect(grossCents(10_000_000n, 250)).toBe(2500);
    expect(grossCents(2_500_000n, 399)).toBe(998);
    expect(grossCents(333_333n, 100)).toBe(33);
  });

  it('subtotal, IVA y total, con descuento', () => {
    expect(lineAmounts({ quantity: '10', unitCostCents: 250, discountCents: 0, taxPercent: '15.00' })).toEqual({ subtotalCents: 2500, taxCents: 375, totalCents: 2875 });
    expect(lineAmounts({ quantity: '10', unitCostCents: 250, discountCents: 500, taxPercent: '15.00' })).toEqual({ subtotalCents: 2000, taxCents: 300, totalCents: 2300 });
    expect(lineAmounts({ quantity: '1', unitCostCents: 333, discountCents: 0, taxPercent: '15' })).toMatchObject({ taxCents: 50 });
    expect(lineAmounts({ quantity: '10.5', unitCostCents: 250, discountCents: 0, taxPercent: '15.00' })).toEqual({ subtotalCents: 2625, taxCents: 394, totalCents: 3019 });
  });

  it('una línea incompleta o con descuento de más no calcula', () => {
    expect(lineAmounts({ quantity: '', unitCostCents: 250, discountCents: 0, taxPercent: '15.00' })).toBeNull();
    expect(lineAmounts({ quantity: '1', unitCostCents: null, discountCents: 0, taxPercent: '15.00' })).toBeNull();
    expect(lineAmounts({ quantity: '1', unitCostCents: 100, discountCents: 101, taxPercent: '0.00' })).toBeNull();
  });

  it('el total de la orden suma líneas y salta las incompletas', () => {
    const a = lineAmounts({ quantity: '10', unitCostCents: 250, discountCents: 0, taxPercent: '15.00' });
    const b = lineAmounts({ quantity: '1', unitCostCents: 100, discountCents: 0, taxPercent: '0.00' });
    expect(sumAmounts([a, b, null])).toEqual({ subtotalCents: 2600, taxCents: 375, totalCents: 2975 });
  });
});

describe('acciones según estado y permisos', () => {
  const all = () => true;
  const only = (...perms: string[]) => (p: string) => perms.includes(p);
  const order = (status: string, createdBy = 'maker') => ({ status, createdBy }) as never;

  it('un borrador se edita, se envía y se cancela', () => {
    expect(orderActions(order('draft'), all, 'maker')).toMatchObject({ edit: true, submit: true, cancel: true, approve: false });
  });

  it('quien preparó la orden no ve aprobar ni rechazar; otra persona sí', () => {
    expect(orderActions(order('pending_approval'), all, 'maker')).toMatchObject({ approve: false, reject: false });
    expect(orderActions(order('pending_approval'), all, 'boss')).toMatchObject({ approve: true, reject: true });
    expect(orderActions(order('pending_approval'), only('purchase:create'), 'boss')).toMatchObject({ approve: false });
  });

  it('cancelar lo aprobado exige purchase:cancel', () => {
    expect(orderActions(order('approved'), only('purchase:create'), 'x').cancel).toBe(false);
    expect(orderActions(order('approved'), only('purchase:cancel'), 'x').cancel).toBe(true);
  });

  it('una rechazada se reabre; una cancelada no tiene acciones', () => {
    expect(orderActions(order('rejected'), all, 'maker')).toMatchObject({ reopen: true, cancel: true });
    expect(orderActions(order('cancelled'), all, 'maker')).toEqual({ edit: false, submit: false, approve: false, reject: false, reopen: false, cancel: false });
  });
});

import { describe, expect, it } from 'vitest';
import { BILL_STATUS_COLOR, billActions, grossCents, lineAmounts, orderActions, parseQuantityMicros, receivingActions, sumAmounts, toBillQuantity, withholdingPrefillFromBill } from './purchasing';

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

describe('recepción y cierre', () => {
  const all = () => true;
  const only = (...perms: string[]) => (p: string) => perms.includes(p);
  it('se recibe y se cierra solo una orden aprobada o recibida en parte', () => {
    expect(receivingActions({ status: 'approved' }, all)).toEqual({ receive: true, close: true });
    expect(receivingActions({ status: 'partially_received' }, all)).toEqual({ receive: true, close: true });
    for (const status of ['draft', 'pending_approval', 'received', 'closed', 'cancelled', 'rejected'] as const) {
      expect(receivingActions({ status }, all)).toEqual({ receive: false, close: false });
    }
  });
  it('cada acción pide su permiso', () => {
    expect(receivingActions({ status: 'approved' }, only('receipt:create'))).toEqual({ receive: true, close: false });
    expect(receivingActions({ status: 'approved' }, only('purchase:close'))).toEqual({ receive: false, close: true });
  });
});

describe('cantidad que queda por facturar', () => {
  it('recibido menos facturado, con decimales exactos', () => {
    expect(toBillQuantity('40', '0')).toBe('40');
    expect(toBillQuantity('40', '15.5')).toBe('24.5');
    expect(toBillQuantity('0.3', '0.1')).toBe('0.2');
  });
  it('nunca sale negativa', () => {
    expect(toBillQuantity('10', '10')).toBe('0');
    expect(toBillQuantity('10', '12')).toBe('0');
  });
});

describe('acciones sobre una factura de compra', () => {
  const all = () => true;
  const bill = (status: 'draft' | 'posted' | 'blocked' | 'voided', createdBy = 'maker') => ({ status, createdBy });
  it('el borrador y la bloqueada se editan; solo el borrador se contabiliza', () => {
    expect(billActions(bill('draft'), all, 'maker')).toMatchObject({ edit: true, post: true, override: false });
    expect(billActions(bill('blocked'), all, 'maker')).toMatchObject({ edit: true, post: false });
  });
  it('quien registró la factura no la aprueba con excepción; otra persona sí', () => {
    expect(billActions(bill('blocked'), all, 'maker').override).toBe(false);
    expect(billActions(bill('blocked'), all, 'boss').override).toBe(true);
  });
  it('sin el permiso no hay excepción ni anulación', () => {
    const only = (p: string) => p === 'purchase_bill:create';
    expect(billActions(bill('blocked'), only, 'boss')).toMatchObject({ override: false, void: false });
  });
  it('se anula lo contabilizado o bloqueado; lo anulado no admite nada', () => {
    expect(billActions(bill('posted'), all, 'x')).toMatchObject({ void: true, withhold: true, edit: false });
    expect(billActions(bill('voided'), all, 'x')).toEqual({ edit: false, post: false, override: false, void: false, withhold: false });
  });
  it('una factura que ya tiene su retención emitida no ofrece emitir otra', () => {
    expect(billActions({ status: 'posted', createdBy: 'x', withholdingStatus: 'none' }, all, 'x').withhold).toBe(true);
    expect(billActions({ status: 'posted', createdBy: 'x', withholdingStatus: 'issued' }, all, 'x').withhold).toBe(false);
  });
  it('una factura anulada no se pinta de verde', () => {
    expect(BILL_STATUS_COLOR.voided).not.toBe(BILL_STATUS_COLOR.posted);
  });
});

describe('datos para abrir el formulario de retención desde una factura de compra', () => {
  const line = (over: Record<string, unknown> = {}) => ({ subtotalCents: 10000, taxCents: 1500, taxRatePct: '15.00', taxPercentageCode: '4', ...over });
  const bill = (over: Record<string, unknown> = {}) => ({
    supplier: { identificationType: 'RUC', identification: '1790012345001', legalName: 'Proveedor Andino' },
    docType: '01' as const,
    establishment: '001',
    emissionPoint: '002',
    sequential: '000000123',
    issueDate: '2026-10-20',
    authorizationNumber: null,
    subtotalCents: 10000,
    lines: [line()],
    ...over,
  });
  const prefill = (over: Record<string, unknown> = {}) => withholdingPrefillFromBill(bill(over) as never);

  it('lleva el proveedor y el documento sustento con el formato que pide fiscal (000-000-000000000)', () => {
    expect(prefill()).toMatchObject({
      subject: { identificationType: 'RUC', identification: '1790012345001', businessName: 'Proveedor Andino' },
      support: { documentCode: '01', number: '001-002-000000123', issueDate: '2026-10-20', subtotalCents: 10000 },
    });
  });
  it('agrupa las líneas por tarifa de IVA y suma base e impuesto de cada una', () => {
    const p = prefill({ lines: [line(), line({ subtotalCents: 2500, taxCents: 375 }), line({ subtotalCents: 4000, taxCents: 0, taxRatePct: '0.00', taxPercentageCode: '0' })], subtotalCents: 16500 });
    expect(p.taxes).toEqual([
      { percentageCode: '4', ratePct: '15', baseCents: 12500, amountCents: 1875 },
      { percentageCode: '0', ratePct: '0', baseCents: 4000, amountCents: 0 },
    ]);
  });
  it('una línea sin código del SRI conserva la tarifa para que el formulario la deduzca', () => {
    expect(prefill({ lines: [line({ taxPercentageCode: null })] }).taxes[0]).toMatchObject({ percentageCode: null, ratePct: '15' });
  });
  it('un proveedor del exterior no cabe en el formulario de retenciones: el tipo queda sin fijar', () => {
    expect(prefill({ supplier: { identificationType: 'EXTERIOR', identification: 'X1', legalName: 'Foreign Co' } }).subject.identificationType).toBeNull();
  });
  it('la autorización solo viaja si es una clave válida (10 a 49 dígitos)', () => {
    expect(prefill({ authorizationNumber: '2110202607179001234500110010010000000071234567813' }).support.authorizationNumber).toBe('2110202607179001234500110010010000000071234567813');
    expect(prefill({ authorizationNumber: 'ABC-123' }).support.authorizationNumber).toBeNull();
    expect(prefill({ authorizationNumber: null }).support.authorizationNumber).toBeNull();
  });
});

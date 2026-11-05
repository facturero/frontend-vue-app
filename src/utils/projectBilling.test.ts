import { describe, expect, it } from 'vitest';
import type { BillingGroup } from '@/types/projects';
import { lineDescription, parseMoney, toInvoiceLines } from './projectBilling';

const ctx = {
  productLabel: 'Servicios profesionales',
  projectName: 'Web nueva',
  personName: (id: string) => (id === 'u1' ? 'Ana Pérez' : '?'),
  hoursLabel: (q: number) => `${String(q).replace('.', ',')} h`,
};
const g = (over: Partial<BillingGroup>): BillingGroup => ({ kind: 'hours', key: 't1', label: 'Diseño', minutes: 90, quantity: 1.5, unitPriceCents: 2500, amountCents: 3750, ...over });

describe('líneas de la factura del proyecto', () => {
  it('describe cada línea como la verá el cliente', () => {
    expect(lineDescription(g({}), ctx)).toBe('Servicios profesionales — Diseño (1,5 h)');
    expect(lineDescription(g({ key: 'u1', label: null }), ctx)).toBe('Servicios profesionales — Ana Pérez (1,5 h)');
    expect(lineDescription(g({ key: '', label: null }), ctx)).toBe('Servicios profesionales — Web nueva (1,5 h)');
    expect(lineDescription(g({ kind: 'milestone', label: 'Entrega del diseño', quantity: 1 }), ctx)).toBe('Entrega del diseño');
    expect(lineDescription(g({ label: 'x'.repeat(400) }), ctx)).toHaveLength(255);
  });

  it('cantidad y precio tal cual los calculó la reserva', () => {
    expect(toInvoiceLines([g({ quantity: 0.52, unitPriceCents: 2550 })], 'p1', ctx)[0]).toEqual({
      productId: 'p1',
      description: 'Servicios profesionales — Diseño (0,52 h)',
      quantity: 0.52,
      unitPrice: '25.50',
    });
  });

  it('lee importes como los escribe la gente', () => {
    expect(parseMoney('25')).toBe(2500);
    expect(parseMoney('25,50')).toBe(2550);
    expect(parseMoney('$ 1.500,00')).toBe(150000);
    expect(parseMoney('1500.5')).toBe(150050);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('mucho')).toBeNull();
    expect(parseMoney('1,234')).toBeNull();
  });
});

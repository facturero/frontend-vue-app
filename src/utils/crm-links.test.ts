import { describe, expect, it } from 'vitest';
import { parseCrmUrl } from './crm-links';

const O = 'https://crm.noahsolution.com';
const ID = '0b6c1f9e-3c1a-4c55-9d7e-2f1a2b3c4d5e';

describe('parseCrmUrl', () => {
  it('reconoce los registros del CRM del mismo origen', () => {
    expect(parseCrmUrl(`${O}/customers/${ID}`, O)).toEqual({ entityType: 'customer', entityId: ID });
    expect(parseCrmUrl(`${O}/invoices/${ID.toUpperCase()}`, O)).toEqual({ entityType: 'invoice', entityId: ID });
    expect(parseCrmUrl(`  ${O}/projects/${ID}/  `, O)).toEqual({ entityType: 'project', entityId: ID });
    expect(parseCrmUrl(`${O}/products/${ID}`, O)).toEqual({ entityType: 'product', entityId: ID });
  });

  it('una tarea abierta (?task=) en Mis tareas o en un proyecto es la tarea, no el proyecto', () => {
    expect(parseCrmUrl(`${O}/my-tasks?task=${ID}`, O)).toEqual({ entityType: 'task', entityId: ID });
    expect(parseCrmUrl(`${O}/projects/${ID}?task=${ID}`, O)).toEqual({ entityType: 'task', entityId: ID });
  });

  it('no convierte enlaces de otro sitio, pantallas que no son un registro ni texto suelto', () => {
    expect(parseCrmUrl(`https://otro.com/customers/${ID}`, O)).toBeNull();
    expect(parseCrmUrl(`${O}/customers/${ID}/edit`, O)).toBeNull();
    expect(parseCrmUrl(`${O}/customers/new`, O)).toBeNull();
    expect(parseCrmUrl(`mira ${O}/customers/${ID}`, O)).toBeNull();
    expect(parseCrmUrl('hola', O)).toBeNull();
  });
});

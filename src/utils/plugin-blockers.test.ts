import { describe, expect, it } from 'vitest';
import type { OrganizationPlugin } from '@/types/plugins';
import { resolveBlockingPlugins } from './plugin-blockers';

const mi = (pluginCode: string, pluginName: string, status: 'active' | 'disabled' = 'active'): OrganizationPlugin =>
  ({ pluginCode, pluginName, status, pluginId: pluginCode, organizationId: 'o' }) as unknown as OrganizationPlugin;

describe('resolveBlockingPlugins', () => {
  const activos = [mi('finance.electronic_invoicing', 'Facturación electrónica'), mi('pos.core', 'Punto de Venta (POS)')];

  it('convierte el código en el nombre del módulo y deja el módulo a mano', () => {
    const [b] = resolveBlockingPlugins(['finance.electronic_invoicing'], activos);
    expect(b.name).toBe('Facturación electrónica');
    expect(b.plugin?.pluginCode).toBe('finance.electronic_invoicing');
  });

  it('conserva el orden y resuelve varios', () => {
    const r = resolveBlockingPlugins(['pos.core', 'finance.electronic_invoicing'], activos);
    expect(r.map((b) => b.name)).toEqual(['Punto de Venta (POS)', 'Facturación electrónica']);
  });

  it('un código que no está entre los módulos de la organización se muestra tal cual y sin enlace', () => {
    const [b] = resolveBlockingPlugins(['hr.payroll'], activos);
    expect(b).toEqual({ code: 'hr.payroll', name: 'hr.payroll', plugin: null, scheduledAt: null });
  });

  it('un módulo con su baja ya programada informa la fecha: no se vuelve a desactivar', () => {
    const programado = { ...mi('pos.core', 'Punto de Venta (POS)'), deactivateAt: '2026-11-08T12:00:00Z' } as OrganizationPlugin;
    const [b] = resolveBlockingPlugins(['pos.core'], [programado]);
    expect(b.scheduledAt).toBe('2026-11-08T12:00:00Z');
  });

  it('un módulo que ya está desactivado conserva su nombre pero no se puede abrir para desactivar', () => {
    const [b] = resolveBlockingPlugins(['pos.core'], [mi('pos.core', 'Punto de Venta (POS)', 'disabled')]);
    expect(b.name).toBe('Punto de Venta (POS)');
    expect(b.plugin).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { CatalogPlugin, OrganizationPlugin } from '@/types/plugins';
import { dependentCodesOf } from './plugin-dependents';

const mi = (pluginCode: string, extra: Partial<OrganizationPlugin> = {}): OrganizationPlugin =>
  ({ pluginCode, pluginId: `id-${pluginCode}`, pluginName: pluginCode, status: 'active', requiredByPluginId: null, ...extra }) as OrganizationPlugin;
const cat = (code: string, depends: string[]): CatalogPlugin =>
  ({ code, depends_on: depends.map((d) => ({ code: d, name: d, autoActivate: true })) }) as unknown as CatalogPlugin;

const catalogo = [cat('a', ['b']), cat('b', ['c']), cat('x', ['c']), cat('c', [])];

describe('dependentCodesOf', () => {
  it('lista TODOS los módulos activos que lo necesitan, no solo el que lo activó', () => {
    const c = mi('c', { activationSource: 'dependency', requiredByPluginId: 'id-b' });
    expect(dependentCodesOf(c, [mi('a'), mi('b'), c, mi('x')], catalogo)).toEqual(['b', 'x']);
  });

  it('ignora a los dependientes que ya están desactivados', () => {
    const c = mi('c');
    expect(dependentCodesOf(c, [mi('b'), mi('x', { status: 'disabled' }), c], catalogo)).toEqual(['b']);
  });

  it('lo incluido en la plataforma no cuenta como dependiente aunque en el catálogo figure como que lo necesita', () => {
    const c = mi('c');
    expect(dependentCodesOf(c, [c, mi('b', { activationSource: 'included' }), mi('x')], catalogo)).toEqual(['x']);
  });

  it('un módulo que nadie necesita no tiene dependientes', () => {
    expect(dependentCodesOf(mi('a'), [mi('a'), mi('b')], catalogo)).toEqual([]);
  });

  it('el respaldo tampoco nombra a un módulo que ya pasó a ser incluido', () => {
    const c = mi('c', { activationSource: 'dependency', requiredByPluginId: 'id-b' });
    expect(dependentCodesOf(c, [mi('b', { activationSource: 'included' }), c], [])).toEqual([]);
  });

  it('si el catálogo aún no cargó, usa el módulo que lo activó', () => {
    const c = mi('c', { activationSource: 'dependency', requiredByPluginId: 'id-b' });
    expect(dependentCodesOf(c, [mi('b'), c], [])).toEqual(['b']);
  });
});

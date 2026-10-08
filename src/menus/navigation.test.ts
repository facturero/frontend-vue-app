import { describe, expect, it } from 'vitest';
import { getNavigationItems, isNavItemActive, type NavItem } from './navigation';

const item = (to: string): NavItem => getNavigationItems().find((i) => i.to === to) as NavItem;

describe('el ítem del menú sigue marcado en las pantallas internas', () => {
  it('Roles: la lista, «Nuevo rol» y «Editar rol»', () => {
    const roles = item('/roles');
    expect(isNavItemActive(roles, '/roles')).toBe(true);
    expect(isNavItemActive(roles, '/roles/new')).toBe(true);
    expect(isNavItemActive(roles, '/roles/7f3e/edit')).toBe(true);
  });

  it('cada sección conserva su marca en nuevo / detalle / editar', () => {
    expect(isNavItemActive(item('/customers'), '/customers/new')).toBe(true);
    expect(isNavItemActive(item('/customers'), '/customers/abc/edit')).toBe(true);
    expect(isNavItemActive(item('/products'), '/products/abc')).toBe(true);
    expect(isNavItemActive(item('/invoices'), '/invoices/new')).toBe(true);
    expect(isNavItemActive(item('/employees'), '/employees/invite')).toBe(true);
    expect(isNavItemActive(item('/employees'), '/employees/abc')).toBe(true);
  });

  it('Inventario cubre también el kardex y las bodegas', () => {
    expect(isNavItemActive(item('/stock'), '/stock/products/abc')).toBe(true);
    expect(isNavItemActive(item('/stock'), '/warehouses')).toBe(true);
  });

  it('Ajustes cubre el perfil y toda la organización (temas del POS incluidos)', () => {
    const ajustes = item('/settings');
    expect(isNavItemActive(ajustes, '/settings')).toBe(true);
    expect(isNavItemActive(ajustes, '/profile')).toBe(true);
    expect(isNavItemActive(ajustes, '/organization/pos-themes/new')).toBe(true);
    expect(isNavItemActive(ajustes, '/organization/establishments')).toBe(true);
  });

  it('un ítem no se marca por una ruta que solo empieza igual (/products ≠ /productsx)', () => {
    expect(isNavItemActive(item('/products'), '/productsx')).toBe(false);
  });

  it('el inicio solo se marca en «/», no en todo lo que cuelga de él', () => {
    const inicio = item('/');
    expect(isNavItemActive(inicio, '/')).toBe(true);
    expect(isNavItemActive(inicio, '/roles')).toBe(false);
  });

  it('solo uno de los ítems de menú queda marcado a la vez', () => {
    for (const path of ['/roles/new', '/customers/abc/edit', '/organization/pos-themes', '/warehouses', '/audit-logs', '/plugins', '/']) {
      const marcados = getNavigationItems().filter((i) => isNavItemActive(i, path));
      expect(marcados, path).toHaveLength(1);
    }
  });
});

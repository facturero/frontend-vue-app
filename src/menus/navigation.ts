export interface NavItem {
  /** Clave i18n del rótulo (ej. 'nav.customers'), no el texto ya traducido. */
  titleKey: string;
  icon: string;
  to?: string;
  permission?: string;
  /**
   * Código del plugin que habilita este módulo. Sin él, el ítem solo se muestra
   * si la organización lo tiene activo. Los ítems del núcleo no lo declaran.
   */
  plugin?: string;
  soon?: boolean;
  /**
   * Rutas que pertenecen a este ítem además de `to` (por prefijo): mientras se esté en cualquiera de ellas el ítem sigue
   * marcado. Sin esto, solo `to` exacto lo marcaba, y al entrar a «Nuevo rol» se perdía el resaltado de «Roles».
   */
  activeFor?: string[];
}

const items: NavItem[] = [
  { titleKey: 'nav.home', icon: 'mdi-view-dashboard-outline', to: '/' },
  { titleKey: 'nav.employees', icon: 'mdi-account-multiple-outline', to: '/employees', permission: 'user:read' },
  { titleKey: 'nav.roles', icon: 'mdi-shield-account-outline', to: '/roles', permission: 'user:read' },
  { titleKey: 'nav.customers', icon: 'mdi-account-group-outline', to: '/customers', permission: 'customer:read', plugin: 'crm.contacts' },
  { titleKey: 'nav.invoices', icon: 'mdi-file-document-outline', to: '/invoices', permission: 'invoice:read', plugin: 'finance.electronic_invoicing' },
  { titleKey: 'nav.products', icon: 'mdi-package-variant-closed', to: '/products', permission: 'product:read', plugin: 'infra.catalog_products' },
  { titleKey: 'nav.stock', icon: 'mdi-warehouse', to: '/stock', activeFor: ['/stock', '/warehouses'], permission: 'inventory:read', plugin: 'inventory.kardex' },
  // Arquetipo F: el menú ya no tiene 4 ítems de configuración sueltos; uno
  // solo (Ajustes) abre la vista de pestañas. Perfil, Organización,
  // Establecimientos y Certificado se reparten como pestañas internas.
  { titleKey: 'nav.settings', icon: 'mdi-cog-outline', to: '/settings', activeFor: ['/settings', '/profile', '/organization'] },
  { titleKey: 'nav.plugins', icon: 'mdi-puzzle-outline', to: '/plugins', permission: 'plugins:read' },
  { titleKey: 'nav.audit', icon: 'mdi-clipboard-text-clock-outline', to: '/audit-logs', permission: 'audit:read' },
];

/**
 * ¿La ruta actual pertenece a este ítem del menú? Es la ruta del ítem o cualquiera que cuelgue de ella por prefijo
 * (`/roles` → `/roles/new`, `/roles/7/edit`); el inicio (`/`) solo coincide exacto, porque todo cuelga de él.
 */
export function isNavItemActive(item: NavItem, path: string): boolean {
  const bases = item.activeFor ?? (item.to ? [item.to] : []);
  return bases.some((base) => (base === '/' ? path === '/' : path === base || path.startsWith(`${base}/`)));
}

export function getNavigationItems(): NavItem[] {
  return items;
}

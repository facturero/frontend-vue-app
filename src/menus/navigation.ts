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
}

const items: NavItem[] = [
  { titleKey: 'nav.home', icon: 'mdi-view-dashboard-outline', to: '/' },
  { titleKey: 'nav.employees', icon: 'mdi-account-multiple-outline', to: '/employees', permission: 'user:read' },
  { titleKey: 'nav.roles', icon: 'mdi-shield-account-outline', to: '/roles', permission: 'user:read' },
  { titleKey: 'nav.customers', icon: 'mdi-account-group-outline', to: '/customers', permission: 'customer:read', plugin: 'crm.contacts' },
  { titleKey: 'nav.invoices', icon: 'mdi-file-document-outline', to: '/invoices', permission: 'invoice:read', plugin: 'finance.electronic_invoicing' },
  { titleKey: 'nav.products', icon: 'mdi-package-variant-closed', to: '/products', permission: 'product:read' },
  // Arquetipo F: el menú ya no tiene 4 ítems de configuración sueltos; uno
  // solo (Ajustes) abre la vista de pestañas. Perfil, Organización,
  // Establecimientos y Certificado se reparten como pestañas internas.
  { titleKey: 'nav.settings', icon: 'mdi-cog-outline', to: '/settings' },
  { titleKey: 'nav.plugins', icon: 'mdi-puzzle-outline', to: '/plugins', permission: 'plugins:read' },
];

export function getNavigationItems(): NavItem[] {
  return items;
}

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
  { titleKey: 'nav.organization', icon: 'mdi-domain', to: '/organization/settings', permission: 'organization:admin' },
  { titleKey: 'nav.establishments', icon: 'mdi-store-outline', to: '/organization/establishments', permission: 'establishment:read', plugin: 'org.establishments' },
  { titleKey: 'nav.certificates', icon: 'mdi-file-certificate-outline', to: '/organization/certificates', permission: 'fiscal:manage', plugin: 'finance.electronic_certificate' },
  { titleKey: 'nav.profile', icon: 'mdi-account-circle-outline', to: '/profile', permission: 'user:read' },
  { titleKey: 'nav.customers', icon: 'mdi-account-group-outline', to: '/customers', permission: 'customer:read', plugin: 'crm.contacts' },
  { titleKey: 'nav.invoices', icon: 'mdi-file-document-outline', to: '/invoices', permission: 'invoice:read', plugin: 'finance.electronic_invoicing' },
  { titleKey: 'nav.products', icon: 'mdi-package-variant-closed', to: '/products', permission: 'product:read' },
  { titleKey: 'nav.plugins', icon: 'mdi-puzzle-outline', to: '/plugins', permission: 'plugins:read' },
];

export function getNavigationItems(): NavItem[] {
  return items;
}

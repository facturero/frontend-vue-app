export interface NavItem {
  title: string;
  icon: string;
  to?: string;
  soon?: boolean;
}

const items: NavItem[] = [
  { title: 'Inicio', icon: 'mdi-view-dashboard-outline', to: '/' },
  { title: 'Clientes', icon: 'mdi-account-group-outline', to: '/customers', soon: true },
  { title: 'Facturas', icon: 'mdi-file-document-outline', to: '/invoices', soon: true },
  { title: 'Productos', icon: 'mdi-package-variant-closed', to: '/products', soon: true },
];

export function getNavigationItems(): NavItem[] {
  return items;
}

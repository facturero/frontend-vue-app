export interface NavItem {
  title: string;
  icon: string;
  to?: string;
  permission?: string;
  soon?: boolean;
}

const items: NavItem[] = [
  { title: 'Inicio', icon: 'mdi-view-dashboard-outline', to: '/' },
  { title: 'Empleados', icon: 'mdi-account-multiple-outline', to: '/employees', permission: 'user:read' },
  { title: 'Roles', icon: 'mdi-shield-account-outline', to: '/roles', permission: 'user:read' },
  { title: 'Organización', icon: 'mdi-domain', to: '/organization/settings', permission: 'organization:admin' },
  { title: 'Mi perfil', icon: 'mdi-account-circle-outline', to: '/profile', permission: 'user:read' },
  { title: 'Clientes', icon: 'mdi-account-group-outline', to: '/customers', soon: true },
  { title: 'Facturas', icon: 'mdi-file-document-outline', to: '/invoices', soon: true },
  { title: 'Productos', icon: 'mdi-package-variant-closed', to: '/products', soon: true },
];

export function getNavigationItems(): NavItem[] {
  return items;
}

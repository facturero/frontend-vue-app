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
  { titleKey: 'nav.roles', icon: 'mdi-badge-account-horizontal-outline', to: '/roles', permission: 'user:read' },
  { titleKey: 'nav.customers', icon: 'mdi-account-group-outline', to: '/customers', permission: 'customer:read', plugin: 'crm.contacts' },
  // Caja web: vender y facturar desde el navegador. Va con el módulo del POS; el permiso es el de crear facturas (billing exige también emitir).
  { titleKey: 'nav.pos', icon: 'mdi-point-of-sale', to: '/pos', permission: 'invoice:create', plugin: 'pos.core' },
  { titleKey: 'nav.invoices', icon: 'mdi-file-document-outline', to: '/invoices', permission: 'invoice:read', plugin: 'finance.electronic_invoicing' },
  { titleKey: 'nav.taxDocuments', icon: 'mdi-file-sign', to: '/tax-documents/withholdings', activeFor: ['/tax-documents'], permission: 'fiscal:read', plugin: 'finance.electronic_invoicing' },
  { titleKey: 'nav.products', icon: 'mdi-package-variant-closed', to: '/products', permission: 'product:read', plugin: 'infra.catalog_products' },
  // Proyectos y tareas (al estilo Asana): «Mis tareas» primero, como en Asana, y la lista de proyectos.
  { titleKey: 'nav.myTasks', icon: 'mdi-check-circle-outline', to: '/my-tasks', permission: 'project:read', plugin: 'projects.tasks_kanban' },
  { titleKey: 'nav.projects', icon: 'mdi-folder-multiple-outline', to: '/projects', permission: 'project:read', plugin: 'projects.tasks_kanban' },
  { titleKey: 'nav.timeTracking', icon: 'mdi-timer-outline', to: '/time-tracking', permission: 'project:read', plugin: 'projects.time_tracking' },
  { titleKey: 'nav.workload', icon: 'mdi-chart-bar-stacked', to: '/workload', permission: 'project:read', plugin: 'projects.resource_allocation' },
  // No es una pantalla: abre «Administrar etiquetas» sobre Proyectos (`?tags=1`, ver ProjectsView). Va en el menú para tenerlo a mano
  // (lo pidió el dueño); nunca sale marcado, porque la ruta es la de Proyectos.
  { titleKey: 'nav.projectTags', icon: 'mdi-tag-multiple-outline', to: '/projects?tags=1', permission: 'project_tag:manage', plugin: 'projects.tasks_kanban' },
  { titleKey: 'nav.restaurant', icon: 'mdi-silverware-fork-knife', to: '/restaurant/tables', activeFor: ['/restaurant'], permission: 'restaurant:read', plugin: 'restaurant.floorplan' },
  { titleKey: 'nav.purchasing', icon: 'mdi-cart-arrow-down', to: '/purchasing/orders', activeFor: ['/purchasing'], permission: 'purchase:read', plugin: 'purchasing.purchase_orders' },
  { titleKey: 'nav.treasury', icon: 'mdi-cash-multiple', to: '/treasury/receivables', activeFor: ['/treasury'], permission: 'receivable:read', plugin: 'finance.accounts_receivable_payable' },
  { titleKey: 'nav.reporting', icon: 'mdi-file-document-check-outline', to: '/reporting/annexes', activeFor: ['/reporting'], permission: 'tax_annex:read', plugin: 'compliance.sri_annexes' },
  { titleKey: 'nav.accounting', icon: 'mdi-calculator-variant-outline', to: '/accounting/accounts', activeFor: ['/accounting'], permission: 'account:read', plugin: 'finance.general_ledger' },
  { titleKey: 'nav.stock', icon: 'mdi-warehouse', to: '/stock', activeFor: ['/stock', '/warehouses'], permission: 'inventory:read', plugin: 'inventory.kardex' },
  // Arquetipo F: el menú ya no tiene 4 ítems de configuración sueltos; uno
  // solo (Ajustes) abre la vista de pestañas. Perfil, Organización,
  // Establecimientos y Certificado se reparten como pestañas internas.
  { titleKey: 'nav.settings', icon: 'mdi-cog-outline', to: '/settings', activeFor: ['/settings', '/profile', '/organization'] },
  { titleKey: 'nav.plugins', icon: 'mdi-puzzle-outline', to: '/plugins', permission: 'plugins:read' },
  { titleKey: 'nav.audit', icon: 'mdi-clipboard-text-clock-outline', to: '/audit-logs', permission: 'audit:read' },
];

/** Un área del menú: agrupa las pantallas de un mismo tema bajo un solo icono. */
export interface NavGroup {
  /** Identificador estable (se guarda qué grupos dejó abiertos cada persona). */
  id: string;
  titleKey: string;
  icon: string;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const byTo = (to: string): NavItem => {
  const found = items.find((i) => i.to === to);
  if (!found) throw new Error(`navigation: no hay ítem con to=${to}`);
  return found;
};

/**
 * El menú por áreas, como en Odoo o Zoho. Con 22 pantallas sueltas, el menú colapsado era una columna de iconos que nadie
 * distinguía; agrupadas son 7 (uno por área), y al pasar el ratón se ven los nombres. Administración va al final y aparte: se usa
 * poco y se mezclaba con lo del día a día. Cada pantalla está en un solo grupo (lo comprueba navigation.test.ts).
 */
const tree: NavEntry[] = [
  byTo('/'),
  { id: 'sales', titleKey: 'nav.groups.sales', icon: 'mdi-storefront-outline', items: [byTo('/customers'), byTo('/pos'), byTo('/invoices'), byTo('/tax-documents/withholdings')] },
  { id: 'inventory', titleKey: 'nav.groups.inventory', icon: 'mdi-package-variant', items: [byTo('/products'), byTo('/purchasing/orders'), byTo('/stock')] },
  { id: 'finance', titleKey: 'nav.groups.finance', icon: 'mdi-bank-outline', items: [byTo('/treasury/receivables'), byTo('/accounting/accounts'), byTo('/reporting/annexes')] },
  { id: 'projects', titleKey: 'nav.groups.projects', icon: 'mdi-briefcase-outline', items: [byTo('/my-tasks'), byTo('/projects'), byTo('/time-tracking'), byTo('/workload'), byTo('/projects?tags=1')] },
  byTo('/restaurant/tables'),
  { id: 'admin', titleKey: 'nav.groups.admin', icon: 'mdi-shield-account-outline', items: [byTo('/employees'), byTo('/roles'), byTo('/plugins'), byTo('/audit-logs'), byTo('/settings')] },
];

/** El menú agrupado, sin filtrar: el cajón descarta lo que el usuario no puede abrir y aplana los grupos que quedan con uno. */
export function getNavigationTree(): NavEntry[] {
  return tree;
}

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

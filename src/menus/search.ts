import { getNavigationItems } from '@/menus/navigation';

export type SearchGroup = 'pages' | 'actions';

export interface SearchEntry {
  /** Identificador estable; también nombra sus palabras clave en `search.keywords.<id>`. */
  id: string;
  group: SearchGroup;
  /** Clave i18n del rótulo, igual que en el menú lateral. */
  titleKey: string;
  icon: string;
  to: string;
  permission?: string;
  plugin?: string;
}

/**
 * Lo que el buscador de la barra superior encuentra además del menú lateral:
 * pantallas sin ítem propio (bodegas, pestañas de Ajustes) y acciones directas.
 * Permiso y plugin replican los del router y los de `AccountSettingsView`, para
 * no ofrecer un destino del que el guard devolvería al usuario.
 */
const extraEntries: SearchEntry[] = [
  { id: 'warehouses', group: 'pages', titleKey: 'inventory.warehouses', icon: 'mdi-warehouse', to: '/warehouses', plugin: 'inventory.warehouses' },
  { id: 'profile', group: 'pages', titleKey: 'common.myProfile', icon: 'mdi-account-circle-outline', to: '/settings?tab=profile' },
  { id: 'organization', group: 'pages', titleKey: 'organization.settingsTitle', icon: 'mdi-domain', to: '/settings?tab=organization', permission: 'organization:admin' },
  { id: 'establishments', group: 'pages', titleKey: 'establishments.title', icon: 'mdi-store-outline', to: '/settings?tab=establishments', permission: 'establishment:read', plugin: 'org.establishments' },
  { id: 'certificates', group: 'pages', titleKey: 'certificates.title', icon: 'mdi-file-certificate-outline', to: '/settings?tab=certificates', permission: 'fiscal:manage', plugin: 'finance.electronic_certificate' },
  { id: 'notifications', group: 'pages', titleKey: 'notificationPrefs.title', icon: 'mdi-bell-outline', to: '/settings?tab=notifications' },

  { id: 'newInvoice', group: 'actions', titleKey: 'invoices.new', icon: 'mdi-file-document-plus-outline', to: '/invoices/new', permission: 'invoice:create', plugin: 'finance.electronic_invoicing' },
  { id: 'newCustomer', group: 'actions', titleKey: 'customers.new', icon: 'mdi-account-plus-outline', to: '/customers/new', permission: 'customer:create', plugin: 'crm.contacts' },
  { id: 'newProduct', group: 'actions', titleKey: 'products.new', icon: 'mdi-package-variant-plus', to: '/products/new', plugin: 'infra.catalog_products' },
  { id: 'inviteEmployee', group: 'actions', titleKey: 'employees.inviteTitle', icon: 'mdi-account-arrow-right-outline', to: '/employees/invite', permission: 'user:invite' },
  { id: 'newRole', group: 'actions', titleKey: 'roles.new', icon: 'mdi-shield-plus-outline', to: '/roles/new', permission: 'user:assign_role' },
];

/** Todo lo buscable, sin filtrar: el componente descarta lo que el usuario no puede abrir. */
export function getSearchEntries(): SearchEntry[] {
  const pages: SearchEntry[] = getNavigationItems()
    .filter((item) => item.to && !item.soon)
    .map((item) => ({
      // 'nav.customers' → 'customers'
      id: item.titleKey.replace(/^nav\./, ''),
      group: 'pages',
      titleKey: item.titleKey,
      icon: item.icon,
      to: item.to!,
      permission: item.permission,
      plugin: item.plugin,
    }));
  return [...pages, ...extraEntries];
}

/** Minúsculas y sin tildes: "factura" encuentra "Facturación" y "credito" encuentra "crédito". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Puntuación de un resultado para la consulta. Todas las palabras de la consulta
 * tienen que aparecer en algún sitio (0 = descartado); pesa más encontrarlas en
 * el título que en las palabras clave o la descripción.
 */
export function scoreMatch(query: string, title: string, secondary: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const t = normalize(title);
  const s = normalize(secondary);
  let score = 0;
  for (const word of words) {
    // Inicio de cualquier palabra del título: "credito" puntúa alto en "Nota de crédito".
    if (` ${t}`.includes(` ${word}`)) score += 3;
    else if (t.includes(word)) score += 2;
    else if (s.includes(word)) score += 1;
    else return 0;
  }
  return score;
}

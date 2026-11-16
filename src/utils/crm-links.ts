import { customerApi } from '@/api/customers';
import { invoiceApi } from '@/api/invoices';
import { productApi } from '@/api/products';
import { projectsApi } from '@/api/projects';

/**
 * Tarjetas del CRM dentro de un mensaje del chat (nodo `crmLink`): un cliente, una factura, una tarea, un proyecto o un producto.
 *
 * El mensaje guarda solo qué es, su id y la etiqueta que se veía al insertarla (chat-service no pregunta a otros servicios). Al pintar,
 * la tarjeta se completa aquí con la API de siempre y la sesión de quien mira: si esa persona no puede ver el registro (sin permiso, sin
 * el módulo, proyecto privado), ve la etiqueta y «sin acceso». Así compartir un enlace en un canal nunca abre datos a quien no los ve.
 */
export type CrmEntity = 'customer' | 'invoice' | 'task' | 'project' | 'product';
export const CRM_ENTITIES: CrmEntity[] = ['customer', 'invoice', 'task', 'project', 'product'];

export interface CrmLinkAttrs {
  entityType: CrmEntity;
  entityId: string;
  label: string;
}
export interface CrmOption {
  entityId: string;
  title: string;
  subtitle?: string;
}
export interface CrmCardData {
  title: string;
  subtitle?: string;
  done?: boolean;
}

interface Source {
  plugin: string;
  permission: string | null;
  icon: string;
  route: (id: string) => string;
  search: (q: string) => Promise<CrmOption[]>;
  resolve: (id: string) => Promise<CrmCardData>;
}

export const CRM_SOURCES: Record<CrmEntity, Source> = {
  customer: {
    plugin: 'crm.contacts',
    permission: 'customer:read',
    icon: 'mdi-account-tie-outline',
    route: (id) => `/customers/${id}`,
    search: async (q) =>
      (await customerApi.list({ search: q || undefined, status: 'active' }))
        .slice(0, 8)
        .map((c) => ({ entityId: c.id, title: c.tradeName || c.businessName, subtitle: c.identification ?? undefined })),
    resolve: async (id) => {
      const c = await customerApi.getById(id);
      return { title: c.tradeName || c.businessName, subtitle: c.identification ?? undefined };
    },
  },
  invoice: {
    plugin: 'finance.electronic_invoicing',
    permission: 'invoice:read',
    icon: 'mdi-receipt-text-outline',
    route: (id) => `/invoices/${id}`,
    // El listado de facturas no busca en el servidor: se filtra aquí por número o cliente (igual que «Vinculado a» de Proyectos).
    search: async (q) => {
      const needle = q.toLowerCase();
      return (await invoiceApi.list())
        .filter((i) => !needle || (i.number ?? '').toLowerCase().includes(needle) || i.customerName.toLowerCase().includes(needle))
        .slice(0, 8)
        .map((i) => ({ entityId: i.id, title: i.number ?? '—', subtitle: `${i.customerName} · ${i.total} ${i.currencyCode}` }));
    },
    resolve: async (id) => {
      const i = await invoiceApi.getById(id);
      return { title: i.number ?? '—', subtitle: [i.customerSnapshot?.businessName, `${i.total} ${i.currencyCode}`].filter(Boolean).join(' · ') };
    },
  },
  task: {
    plugin: 'projects.tasks_kanban',
    permission: 'project:read',
    icon: 'mdi-checkbox-marked-circle-outline',
    route: (id) => `/my-tasks?task=${id}`,
    search: async (q) =>
      q ? (await projectsApi.search(q)).tasks.slice(0, 8).map((t) => ({ entityId: t.id, title: t.title, subtitle: t.projects.map((p) => p.name).join(', ') || undefined })) : [],
    resolve: async (id) => {
      const t = await projectsApi.getTask(id);
      return { title: t.title, subtitle: t.projects.map((p) => p.name).join(', ') || undefined, done: !!t.completedAt };
    },
  },
  project: {
    plugin: 'projects.tasks_kanban',
    permission: 'project:read',
    icon: 'mdi-folder-outline',
    route: (id) => `/projects/${id}`,
    search: async (q) => {
      const needle = q.toLowerCase();
      return (await projectsApi.list()).filter((p) => !needle || p.name.toLowerCase().includes(needle)).slice(0, 8).map((p) => ({ entityId: p.id, title: p.name }));
    },
    resolve: async (id) => ({ title: (await projectsApi.get(id)).name }),
  },
  product: {
    plugin: 'infra.catalog_products',
    permission: null,
    icon: 'mdi-package-variant-closed',
    route: (id) => `/products/${id}`,
    search: async (q) => (await productApi.list({ search: q || undefined, pageSize: 8 })).items.map((p) => ({ entityId: p.id, title: p.name, subtitle: p.sku ?? undefined })),
    resolve: async (id) => {
      const p = await productApi.getById(id);
      return { title: p.name, subtitle: p.sku ?? undefined };
    },
  },
};

/** Tipos que esta persona puede enlazar: módulo activo y permiso de lectura (el mismo par que el menú lateral). */
export function availableCrmEntities(isActive: (plugin: string) => boolean, can: (permission: string) => boolean): CrmEntity[] {
  return CRM_ENTITIES.filter((e) => isActive(CRM_SOURCES[e].plugin) && (!CRM_SOURCES[e].permission || can(CRM_SOURCES[e].permission!)));
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATTERNS: Array<[CrmEntity, RegExp]> = [
  ['customer', new RegExp(`^/customers/(${UUID})/?$`, 'i')],
  ['invoice', new RegExp(`^/invoices/(${UUID})/?$`, 'i')],
  ['project', new RegExp(`^/projects/(${UUID})/?$`, 'i')],
  ['product', new RegExp(`^/products/(${UUID})/?$`, 'i')],
];

/**
 * ¿Es lo pegado un enlace a un registro de ESTE CRM? (`/customers/:id`, `/invoices/:id`, `/projects/:id`, `/products/:id` y una tarea
 * abierta, `?task=:id`, en Mis tareas o en un proyecto). Solo del mismo origen: un enlace a otro sitio sigue siendo un enlace.
 */
export function parseCrmUrl(text: string, origin: string): { entityType: CrmEntity; entityId: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const task = url.searchParams.get('task');
  if (task && new RegExp(`^${UUID}$`, 'i').test(task) && (url.pathname === '/my-tasks' || /^\/projects\//.test(url.pathname))) {
    return { entityType: 'task', entityId: task.toLowerCase() };
  }
  for (const [entityType, re] of PATTERNS) {
    const m = url.pathname.match(re);
    if (m) return { entityType, entityId: m[1].toLowerCase() };
  }
  return null;
}

// Una tarjeta repetida en varios mensajes (o la misma tras recargar la lista) pide el registro una sola vez por sesión de página.
const cache = new Map<string, Promise<CrmCardData | null>>();

/** Datos de la tarjeta con los permisos de quien mira; `null` = no puede verlo (o ya no existe). */
export function resolveCrmCard(entityType: CrmEntity, entityId: string): Promise<CrmCardData | null> {
  const key = `${entityType}:${entityId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = CRM_SOURCES[entityType].resolve(entityId).catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

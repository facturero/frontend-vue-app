import type { Component } from 'vue';
import { customerApi } from '@/api/customers';
import { employeeApi } from '@/api/employees';
import { roleApi } from '@/api/roles';
import { auditApi } from '@/api/audit';
import { invoiceApi } from '@/api/invoices';
import { fiscalApi } from '@/api/fiscal';
import { treasuryApi } from '@/api/treasury';
import { accountingApi } from '@/api/accounting';
import { productApi } from '@/api/products';
import { inventoryApi } from '@/api/inventory';
import { purchasingApi } from '@/api/purchasing';
import { organizationApi } from '@/api/organization';
import { projectsApi } from '@/api/projects';
import { restaurantApi } from '@/api/restaurant';
import { reservationsApi } from '@/api/reservations';
import { formatMoney, formatRelative } from '@/utils/format';
import { formatMinutes } from '@/utils/duration';
import { localIsoDate } from '@/utils/projects';

/**
 * EL catálogo de widgets del tablero de Inicio: un solo listado con, para cada widget, de qué plugin es, qué permiso pide, de dónde
 * saca sus datos y entre qué tamaños se puede agrandar o achicar (en celdas de la rejilla: 12 columnas, filas de `ROW_HEIGHT` px).
 *
 * Reglas:
 *   - Un widget solo se ofrece y se pinta si su plugin está activo en la organización y la persona tiene el permiso (el mismo par que
 *     el menú lateral). Sin eso, el servicio responde 403 y la tarjeta quedaría rota.
 *   - Todo plugin construido tiene al menos un widget aquí, o una exención con su razón en `scripts/check-widgets.mjs` (que lo vigila
 *     desde `check-all`, leyendo los `plugin: '...'` de este archivo: no los generes dinámicamente).
 *   - `registry.test.ts` comprueba que `minW ≤ w ≤ maxW ≤ 12` y `minH ≤ h ≤ maxH`, y que cada título tiene su texto en es/en/fr.
 *
 * Tres tipos: `kpi` (una cifra), `list` (una lista corta) y `component` (algo propio: dona, mis tareas, horas de la semana).
 */
export const GRID_COLUMNS = 12;
export const ROW_HEIGHT = 72;

export interface WidgetSize {
  w: number;
  h: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

/** Lo que recibe un widget para pedir sus datos. `establishmentId`: el elegido en el propio widget (restaurante). */
export interface WidgetContext {
  userId: string;
  establishmentId: string | null;
  t: (key: string, values?: Record<string, unknown>) => string;
}

export interface KpiResult {
  value: string;
  caption?: string;
  /** Color del tema para la cifra cuando algo pide atención (vencido, por expirar). */
  tone?: 'error' | 'warning' | 'success';
}

export interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  to?: string;
  /** 0–100: barra de avance (proyectos). */
  progress?: number;
}

interface BaseWidget {
  code: string;
  /** Código del plugin del catálogo. Los incluidos (usuarios, roles, establecimientos…) también lo llevan: siempre están activos. */
  plugin: string;
  permission: string | null;
  titleKey: string;
  icon: string;
  /** Color del tema del icono (familia tonal: `lightprimary` de fondo, `primary` de icono). */
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  /** «Ver todo»: la pantalla del módulo. */
  to?: string;
  size: WidgetSize;
  /** Sale en el tablero de quien aún no ha armado el suyo. */
  inDefault?: boolean;
  /** Pide elegir un establecimiento (restaurante): el widget lo guarda en su `config`. */
  needs?: 'establishment';
}

export type WidgetDef =
  | (BaseWidget & { kind: 'kpi'; load: (ctx: WidgetContext) => Promise<KpiResult> })
  | (BaseWidget & { kind: 'list'; load: (ctx: WidgetContext) => Promise<ListItem[]>; emptyKey: string })
  | (BaseWidget & { kind: 'component'; component: () => Promise<Component> });

const KPI: WidgetSize = { w: 3, h: 2, minW: 2, maxW: 6, minH: 2, maxH: 3 };
const LIST: WidgetSize = { w: 4, h: 4, minW: 3, maxW: 8, minH: 3, maxH: 8 };

const today = () => localIsoDate(new Date());
const monthStart = () => `${today().slice(0, 8)}01`;
/** Lunes de esta semana (la semana de las horas y de la carga de trabajo). */
function monday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localIsoDate(d);
}
/** Los importes de facturación vienen como texto decimal («12.50»). */
const cents = (amount: string | number) => Math.round(Number(amount) * 100);
const count = (n: number) => String(n);

export const WIDGETS: WidgetDef[] = [
  // ── Ventas y clientes ─────────────────────────────────────────────────────
  {
    code: 'customers.active', kind: 'kpi', plugin: 'crm.contacts', permission: 'customer:read', titleKey: 'widgets.customersActive',
    icon: 'mdi-account-group-outline', color: 'primary', to: '/customers', size: KPI, inDefault: true,
    load: async () => ({ value: count((await customerApi.list()).filter((c) => c.status === 'active').length) }),
  },
  {
    code: 'invoices.issued', kind: 'kpi', plugin: 'finance.electronic_invoicing', permission: 'invoice:read', titleKey: 'widgets.invoicesIssued',
    icon: 'mdi-file-document-outline', color: 'warning', to: '/invoices', size: KPI, inDefault: true,
    load: async () => ({ value: count((await invoiceApi.list({ status: 'issued' })).length) }),
  },
  {
    code: 'invoices.month_sales', kind: 'kpi', plugin: 'finance.electronic_invoicing', permission: 'invoice:read', titleKey: 'widgets.monthSales',
    icon: 'mdi-cash-multiple', color: 'success', to: '/invoices', size: KPI,
    load: async (ctx) => {
      const list = await invoiceApi.list({ status: 'issued', from: monthStart(), to: today() });
      return { value: formatMoney(list.reduce((n, i) => n + cents(i.total), 0)), caption: ctx.t('widgets.invoicesCount', { n: list.length }) };
    },
  },
  {
    code: 'invoices.recent', kind: 'list', plugin: 'finance.electronic_invoicing', permission: 'invoice:read', titleKey: 'widgets.recentInvoices',
    icon: 'mdi-receipt-text-outline', color: 'warning', to: '/invoices', size: LIST, emptyKey: 'widgets.emptyInvoices',
    load: async (ctx) =>
      (await invoiceApi.list())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
        .map((i) => ({
          id: i.id,
          title: i.number ?? ctx.t('widgets.draftInvoice'),
          subtitle: i.customerName,
          trailing: formatMoney(cents(i.total)),
          to: `/invoices/${i.id}`,
        })),
  },
  {
    code: 'pos.today', kind: 'kpi', plugin: 'pos.core', permission: 'invoice:read', titleKey: 'widgets.posToday',
    icon: 'mdi-point-of-sale', color: 'primary', to: '/pos', size: KPI,
    load: async (ctx) => {
      const list = await invoiceApi.list({ status: 'issued', from: today(), to: today() });
      return { value: formatMoney(list.reduce((n, i) => n + cents(i.total), 0)), caption: ctx.t('widgets.invoicesCount', { n: list.length }) };
    },
  },

  // ── Proyectos y horas ─────────────────────────────────────────────────────
  {
    code: 'projects.my_tasks', kind: 'component', plugin: 'projects.tasks_kanban', permission: 'project:read', titleKey: 'widgets.myTasks',
    icon: 'mdi-check-circle-outline', color: 'primary', to: '/my-tasks', size: { w: 6, h: 5, minW: 3, maxW: 12, minH: 3, maxH: 10 }, inDefault: true,
    component: () => import('./MyTasksWidget.vue'),
  },
  {
    code: 'projects.active', kind: 'list', plugin: 'projects.tasks_kanban', permission: 'project:read', titleKey: 'widgets.activeProjects',
    icon: 'mdi-folder-multiple-outline', color: 'info', to: '/projects', size: LIST, emptyKey: 'widgets.emptyProjects',
    load: async (ctx) =>
      (await projectsApi.list('active')).slice(0, 10).map((p) => {
        const s = p.summary;
        return {
          id: p.id,
          title: p.name,
          subtitle: s ? ctx.t('widgets.projectProgress', { done: s.completed, total: s.total }) : undefined,
          trailing: s?.overdue ? ctx.t('widgets.overdueCount', { n: s.overdue }) : undefined,
          progress: s && s.total ? Math.round((s.completed / s.total) * 100) : 0,
          to: `/projects/${p.id}`,
        };
      }),
  },
  {
    code: 'projects.my_week_hours', kind: 'component', plugin: 'projects.time_tracking', permission: 'project:read', titleKey: 'widgets.weekHours',
    icon: 'mdi-timer-outline', color: 'secondary', to: '/time-tracking', size: { w: 3, h: 3, minW: 3, maxW: 6, minH: 2, maxH: 4 },
    component: () => import('./WeekHoursWidget.vue'),
  },
  {
    code: 'projects.workload_week', kind: 'kpi', plugin: 'projects.resource_allocation', permission: 'project:read', titleKey: 'widgets.workloadWeek',
    icon: 'mdi-chart-bar-stacked', color: 'warning', to: '/workload', size: KPI,
    load: async (ctx) => {
      const w = await projectsApi.workload(monday(), 1);
      const over = w.people.filter((p) => (p.weeks[0]?.minutes ?? 0) > (w.capacities[p.userId] ?? w.defaultWeeklyMinutes)).length;
      return { value: count(over), caption: ctx.t('widgets.peopleOverCapacity', { n: w.people.length }), tone: over ? 'warning' : undefined };
    },
  },
  {
    code: 'projects.unbilled', kind: 'kpi', plugin: 'projects.project_billing', permission: 'project:bill', titleKey: 'widgets.unbilled',
    icon: 'mdi-cash-clock', color: 'success', to: '/projects', size: KPI,
    load: async (ctx) => {
      // Un resumen por proyecto (no hay total de la organización): como mucho los 10 primeros, para no disparar decenas de llamadas.
      const projects = (await projectsApi.list('active')).slice(0, 10);
      const sums = await Promise.all(projects.map((p) => projectsApi.billing(p.id).then((b) => [b.unbilledAmountCents, b.unbilledMinutes], () => [0, 0])));
      const amount = sums.reduce((n, [a]) => n + (a ?? 0), 0);
      const minutes = sums.reduce((n, [, m]) => n + (m ?? 0), 0);
      return { value: formatMoney(amount), caption: ctx.t('widgets.unbilledHours', { amount: formatMinutes(minutes) }) };
    },
  },

  // ── Inventario y compras ──────────────────────────────────────────────────
  {
    code: 'products.active', kind: 'kpi', plugin: 'infra.catalog_products', permission: 'product:read', titleKey: 'widgets.productsActive',
    icon: 'mdi-package-variant-closed', color: 'success', to: '/products', size: KPI, inDefault: true,
    load: async () => ({ value: count((await productApi.list({ status: 'active', pageSize: 1 })).total) }),
  },
  {
    code: 'inventory.out_of_stock', kind: 'kpi', plugin: 'inventory.kardex', permission: 'inventory:read', titleKey: 'widgets.outOfStock',
    icon: 'mdi-package-variant-remove', color: 'error', to: '/stock', size: KPI,
    load: async () => {
      const n = (await inventoryApi.listStock({ stockState: 'without_stock', pageSize: 1 })).total;
      return { value: count(n), tone: n ? 'error' : 'success' };
    },
  },
  {
    code: 'inventory.warehouses', kind: 'kpi', plugin: 'inventory.warehouses', permission: null, titleKey: 'widgets.warehouses',
    icon: 'mdi-warehouse', color: 'info', to: '/warehouses', size: KPI,
    load: async () => ({ value: count((await inventoryApi.listWarehouses()).filter((w) => w.status === 'active').length) }),
  },
  {
    code: 'purchasing.suppliers', kind: 'kpi', plugin: 'inventory.suppliers', permission: 'supplier:read', titleKey: 'widgets.suppliers',
    icon: 'mdi-truck-outline', color: 'secondary', to: '/purchasing/suppliers', size: KPI,
    load: async () => ({ value: count((await purchasingApi.listSuppliers({ status: 'active', pageSize: 1 })).total) }),
  },
  {
    code: 'purchasing.pending_orders', kind: 'list', plugin: 'purchasing.purchase_orders', permission: 'purchase:read', titleKey: 'widgets.pendingOrders',
    icon: 'mdi-cart-arrow-down', color: 'warning', to: '/purchasing/orders', size: LIST, emptyKey: 'widgets.emptyOrders',
    load: async (ctx) => {
      const [toApprove, toReceive] = await Promise.all([
        purchasingApi.listOrders({ status: 'pending_approval', pageSize: 8 }),
        purchasingApi.listOrders({ status: 'approved', pageSize: 8 }),
      ]);
      return [...toApprove.items, ...toReceive.items].slice(0, 8).map((o) => ({
        id: o.id,
        title: o.number ?? o.supplier.legalName,
        subtitle: `${o.supplier.legalName} · ${ctx.t(o.status === 'pending_approval' ? 'widgets.toApprove' : 'widgets.toReceive')}`,
        trailing: formatMoney(o.totalCents, o.currencyCode),
        to: `/purchasing/orders/${o.id}`,
      }));
    },
  },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  {
    code: 'finance.receivables_aging', kind: 'component', plugin: 'finance.accounts_receivable_payable', permission: 'receivable:read',
    titleKey: 'widgets.receivablesAging', icon: 'mdi-hand-coin-outline', color: 'success', to: '/treasury/receivables',
    size: { w: 4, h: 4, minW: 3, maxW: 6, minH: 4, maxH: 6 },
    component: () => import('./ReceivablesAgingWidget.vue'),
  },
  {
    code: 'finance.payables', kind: 'kpi', plugin: 'finance.accounts_receivable_payable', permission: 'payable:read', titleKey: 'widgets.payables',
    icon: 'mdi-cash-minus', color: 'error', to: '/treasury/payables', size: KPI,
    load: async (ctx) => {
      const t = (await treasuryApi.getPayablesAging()).totals;
      const overdue = t.days1To30Cents + t.days31To60Cents + t.days61To90Cents + t.daysOver90Cents;
      return { value: formatMoney(t.totalCents), caption: ctx.t('widgets.overdueAmount', { amount: formatMoney(overdue) }), tone: overdue ? 'warning' : undefined };
    },
  },
  {
    code: 'finance.pending_postings', kind: 'kpi', plugin: 'finance.general_ledger', permission: 'journal:read', titleKey: 'widgets.pendingPostings',
    icon: 'mdi-book-clock-outline', color: 'info', to: '/accounting/accounts', size: KPI,
    load: async () => {
      const n = (await accountingApi.listPending({ status: 'pending', page: 1, pageSize: 1 })).total;
      return { value: count(n), tone: n ? 'warning' : 'success' };
    },
  },
  {
    code: 'finance.certificate', kind: 'kpi', plugin: 'finance.electronic_certificate', permission: 'fiscal:manage', titleKey: 'widgets.certificate',
    icon: 'mdi-certificate-outline', color: 'primary', to: '/organization/settings', size: KPI,
    load: async (ctx) => {
      const active = (await fiscalApi.getCertificates()).filter((c) => c.status === 'active').sort((a, b) => b.valid_until.localeCompare(a.valid_until))[0];
      if (!active) return { value: ctx.t('widgets.noCertificate'), tone: 'error' };
      const days = Math.ceil((new Date(active.valid_until).getTime() - Date.now()) / 86_400_000);
      return {
        value: ctx.t('widgets.daysLeft', { n: Math.max(days, 0) }, ),
        caption: active.alias,
        tone: days <= 0 ? 'error' : days <= 30 ? 'warning' : 'success',
      };
    },
  },

  // ── Organización y administración ─────────────────────────────────────────
  {
    code: 'admin.employees', kind: 'kpi', plugin: 'admin.users_roles', permission: 'user:read', titleKey: 'widgets.employeesActive',
    icon: 'mdi-account-tie-outline', color: 'info', to: '/employees', size: KPI, inDefault: true,
    load: async () => ({ value: count((await employeeApi.list()).filter((e) => e.status === 'active').length) }),
  },
  {
    code: 'admin.roles', kind: 'kpi', plugin: 'admin.permissions', permission: 'user:read', titleKey: 'widgets.roles',
    icon: 'mdi-badge-account-horizontal-outline', color: 'secondary', to: '/roles', size: KPI,
    load: async () => ({ value: count((await roleApi.list()).length) }),
  },
  {
    code: 'admin.audit_recent', kind: 'list', plugin: 'admin.audit_log', permission: 'audit:read', titleKey: 'widgets.recentActivity',
    icon: 'mdi-history', color: 'primary', to: '/audit-logs', size: LIST, emptyKey: 'widgets.emptyActivity',
    load: async (ctx) =>
      (await auditApi.list({ limit: 10 })).items.map((e) => ({
        id: e.id,
        title: ctx.t(`audit.event.${e.event.replace(/\./g, '_')}`),
        subtitle: e.userEmail ?? ctx.t('widgets.system'),
        trailing: formatRelative(e.occurredAt),
      })),
  },
  {
    code: 'org.establishments', kind: 'kpi', plugin: 'org.establishments', permission: 'establishment:read', titleKey: 'widgets.establishments',
    icon: 'mdi-store-outline', color: 'primary', to: '/organization/settings', size: KPI,
    load: async () => ({ value: count((await organizationApi.getEstablishments()).filter((e) => e.status === 'active').length) }),
  },

  // ── Restaurante ───────────────────────────────────────────────────────────
  {
    code: 'restaurant.tables', kind: 'kpi', plugin: 'restaurant.floorplan', permission: 'restaurant:read', titleKey: 'widgets.tables',
    icon: 'mdi-table-furniture', color: 'warning', to: '/restaurant/tables', size: KPI, needs: 'establishment',
    load: async (ctx) => {
      const tables = ctx.establishmentId ? (await restaurantApi.listTables(ctx.establishmentId)).filter((t) => t.status === 'active') : [];
      return { value: count(tables.length), caption: ctx.t('widgets.seats', { n: tables.reduce((n, t) => n + t.capacityMax, 0) }) };
    },
  },
  {
    code: 'restaurant.reservations_today', kind: 'list', plugin: 'restaurant.reservations', permission: 'reservation:read',
    titleKey: 'widgets.reservationsToday', icon: 'mdi-calendar-account-outline', color: 'success', to: '/restaurant/reservations', size: LIST,
    emptyKey: 'widgets.emptyReservations', needs: 'establishment',
    load: async (ctx) =>
      !ctx.establishmentId
        ? []
        : (await reservationsApi.list(ctx.establishmentId, { date: today(), status: ['pending', 'confirmed', 'seated'] }))
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((r) => ({ id: r.id, title: `${r.time.slice(0, 5)} · ${r.guestName}`, subtitle: ctx.t('widgets.partySize', { n: r.partySize }), trailing: r.code })),
  },
];

export function widgetByCode(code: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.code === code);
}

/** Acota un tamaño guardado a los límites del widget (si el listado cambió, lo guardado se ajusta solo). */
export function clampSize(def: WidgetDef, w: number, h: number): { w: number; h: number } {
  return {
    w: Math.min(def.size.maxW, Math.max(def.size.minW, w)),
    h: Math.min(def.size.maxH, Math.max(def.size.minH, h)),
  };
}

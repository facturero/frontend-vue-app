import { createRouter, createWebHistory } from 'vue-router';
import { getAccessToken } from '@/utils/http';
import { connectRealtime, disconnectRealtime } from '@/utils/realtime';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import AuthView from '@/views/AuthView.vue';
import AcceptInviteView from '@/views/AcceptInviteView.vue';
import ResetPasswordView from '@/views/ResetPasswordView.vue';
import HomeView from '@/views/HomeView.vue';
import CompleteProfileView from '@/views/ProfileView.vue';
import EmployeesListView from '@/views/employees/EmployeesListView.vue';
import EmployeeDetailView from '@/views/employees/EmployeeDetailView.vue';
import RolesListView from '@/views/roles/RolesListView.vue';
import RoleCreateView from '@/views/roles/RoleCreateView.vue';
import RoleEditView from '@/views/roles/RoleEditView.vue';
import OrganizationSettingsView from '@/views/organization/OrganizationSettingsView.vue';
import EstablishmentsView from '@/views/organization/EstablishmentsView.vue';
import CertificatesView from '@/views/organization/CertificatesView.vue';
import PosThemesView from '@/views/organization/PosThemesView.vue';
import PosThemeEditorView from '@/views/organization/PosThemeEditorView.vue';
import ProductsListView from '@/views/products/ProductsListView.vue';
import StockListView from '@/views/inventory/StockListView.vue';
import StockMovementsView from '@/views/inventory/StockMovementsView.vue';
import WarehousesView from '@/views/inventory/WarehousesView.vue';
import ProductFormView from '@/views/products/ProductFormView.vue';
import ProductDetailView from '@/views/products/ProductDetailView.vue';
import CustomersListView from '@/views/customers/CustomersListView.vue';
import CustomerFormView from '@/views/customers/CustomerFormView.vue';
import CustomerDetailView from '@/views/customers/CustomerDetailView.vue';
import InvoiceListView from '@/views/invoices/InvoiceListView.vue';
import InvoiceDetailView from '@/views/invoices/InvoiceDetailView.vue';
import InvoiceFormView from '@/views/invoices/InvoiceFormView.vue';
import PluginsView from '@/views/plugins/PluginsView.vue';
import AuditLogView from '@/views/audit/AuditLogView.vue';
import RestaurantTablesView from '@/views/restaurant/TablesView.vue';
import RestaurantFloorPlanView from '@/views/restaurant/FloorPlanView.vue';
import RestaurantScheduleView from '@/views/restaurant/ScheduleView.vue';
import AccountingAccountsView from '@/views/accounting/AccountsView.vue';
import AccountingJournalView from '@/views/accounting/JournalEntriesView.vue';
import AccountingEntryView from '@/views/accounting/JournalEntryView.vue';
import AccountingPeriodsView from '@/views/accounting/PeriodsView.vue';
import AccountingAutomaticView from '@/views/accounting/AutomaticPostingView.vue';
import AccountingReportsView from '@/views/accounting/ReportsView.vue';
import AccountingStatementsView from '@/views/accounting/StatementsView.vue';
import PurchasingSuppliersView from '@/views/purchasing/SuppliersView.vue';
import TreasuryReceivablesView from '@/views/treasury/ReceivablesView.vue';
import TreasuryAgingView from '@/views/treasury/AgingView.vue';
import TreasuryOpeningBalancesView from '@/views/treasury/OpeningBalancesView.vue';
import TreasuryCustomerStatementView from '@/views/treasury/CustomerStatementView.vue';
import TreasuryReceiptsView from '@/views/treasury/ReceiptsView.vue';
import TreasuryReceiptFormView from '@/views/treasury/ReceiptFormView.vue';
import TreasuryReceiptDetailView from '@/views/treasury/ReceiptDetailView.vue';
import TreasuryRemindersView from '@/views/treasury/RemindersView.vue';
import TreasuryPayablesView from '@/views/treasury/PayablesView.vue';
import TreasurySupplierStatementView from '@/views/treasury/SupplierStatementView.vue';
import TreasuryPaymentsView from '@/views/treasury/PaymentsView.vue';
import TreasuryPaymentFormView from '@/views/treasury/PaymentFormView.vue';
import TreasuryPaymentDetailView from '@/views/treasury/PaymentDetailView.vue';
import TreasuryPayableOpeningView from '@/views/treasury/PayableOpeningBalancesView.vue';
import PurchasingOrdersView from '@/views/purchasing/PurchaseOrdersView.vue';
import PurchasingOrderFormView from '@/views/purchasing/PurchaseOrderFormView.vue';
import PurchasingOrderView from '@/views/purchasing/PurchaseOrderView.vue';
import PurchasingReceivingView from '@/views/purchasing/ReceivingView.vue';
import PurchasingReceiptsView from '@/views/purchasing/ReceiptsListView.vue';
import PurchasingBillsView from '@/views/purchasing/BillsListView.vue';
import PurchasingBillFormView from '@/views/purchasing/BillFormView.vue';
import PurchasingBillView from '@/views/purchasing/BillView.vue';
import TaxWithholdingsView from '@/views/taxDocuments/WithholdingsView.vue';
import TaxWithholdingFormView from '@/views/taxDocuments/WithholdingFormView.vue';
import TaxDeliveryGuidesView from '@/views/taxDocuments/DeliveryGuidesView.vue';
import TaxDeliveryGuideFormView from '@/views/taxDocuments/DeliveryGuideFormView.vue';
import AccountSettingsView from '@/views/settings/AccountSettingsView.vue';
import BusinessProfileView from '@/views/onboarding/BusinessProfileView.vue';
import BusinessProfileRecommendationsView from '@/views/onboarding/BusinessProfileRecommendationsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: AuthView },
    { path: '/accept-invite', name: 'accept-invite', component: AcceptInviteView },
    { path: '/restablecer-contrasena', name: 'reset-password', component: ResetPasswordView },

    {
      path: '/profile',
      name: 'profile',
      component: CompleteProfileView,
      meta: { requiresAuth: true },
    },

    {
      // Ajustes consolidados (arquetipo F): las 4 rutas sueltas viven como
      // pestañas. ?tab=profile|organization|establishments|certificates
      // aterriza directo en una pestaña; las rutas sueltas se mantienen como
      // deep-links (onboarding /profile y /organization/settings).
      path: '/settings',
      name: 'settings',
      component: AccountSettingsView,
      meta: { requiresAuth: true },
    },

    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },

    // Caja web (la misma pantalla que la caja de escritorio, dentro del CRM). Carga perezosa: es una pantalla aparte que la mayoría del CRM no usa. `kiosk`: ocupa toda la ventana, con su propia
    // cabecera, sin el armazón del CRM (menú, barra superior, asistente).
    {
      path: '/pos',
      name: 'pos',
      component: () => import('@/views/pos/PosView.vue'),
      meta: { requiresAuth: true, requiredPermission: 'invoice:create', requiredPlugin: 'pos.core', kiosk: true },
    },

    {
      path: '/employees',
      name: 'employees',
      component: EmployeesListView,
      meta: { requiresAuth: true, requiredPermission: 'user:read' },
    },
    {
      path: '/employees/invite',
      name: 'employees-invite',
      component: EmployeesListView,
      meta: { requiresAuth: true, requiredPermission: 'user:invite' },
    },
    {
      path: '/employees/:id',
      name: 'employees-detail',
      component: EmployeeDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'user:read' },
    },

    {
      path: '/roles',
      name: 'roles',
      component: RolesListView,
      meta: { requiresAuth: true, requiredPermission: 'user:read' },
    },
    {
      path: '/roles/new',
      name: 'roles-create',
      component: RoleCreateView,
      meta: { requiresAuth: true, requiredPermission: 'user:assign_role' },
    },
    {
      path: '/roles/:id/edit',
      name: 'roles-edit',
      component: RoleEditView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'user:assign_role' },
    },

    {
      path: '/organization/settings',
      name: 'organization-settings',
      component: OrganizationSettingsView,
      meta: { requiresAuth: true, requiredPermission: 'organization:admin' },
    },

    {
      path: '/organization/establishments',
      name: 'organization-establishments',
      component: EstablishmentsView,
      meta: { requiresAuth: true, requiredPermission: 'establishment:read', requiredPlugin: 'org.establishments' },
    },

    {
      path: '/organization/certificates',
      name: 'organization-certificates',
      component: CertificatesView,
      meta: { requiresAuth: true, requiredPermission: 'fiscal:manage', requiredPlugin: 'finance.electronic_certificate' },
    },

    {
      // Temas del POS. La lista es deep-link de la pestaña de Ajustes
      // (/settings?tab=pos-themes) y además ruta propia para poder llegar
      // directo. El editor necesita ruta aparte porque lleva un id: dentro de la
      // vista de pestañas no habría forma de distinguir un tema de otro.
      path: '/organization/pos-themes',
      name: 'organization-pos-themes',
      component: PosThemesView,
      meta: { requiresAuth: true, requiredPermission: 'organization:admin' },
    },
    {
      path: '/organization/pos-themes/new',
      name: 'organization-pos-theme-new',
      component: PosThemeEditorView,
      meta: { requiresAuth: true, requiredPermission: 'organization:admin' },
    },
    {
      path: '/organization/pos-themes/:themeId',
      name: 'organization-pos-theme-edit',
      component: PosThemeEditorView,
      meta: { requiresAuth: true, requiredPermission: 'organization:admin' },
    },

    {
      // Alta, paso 3: elección del perfil de negocio. Omitible y reabierto desde
      // módulos (source=settings). Exige plugins:manage porque sin él la pantalla
      // no puede guardar; si el perfil del fundador no lo tiene, se salta entera.
      path: '/onboarding/perfil',
      name: 'business-profile',
      component: BusinessProfileView,
      meta: { requiresAuth: true, requiredPermission: 'plugins:manage', bareShell: true },
    },
    {
      // Alta, paso 4: módulos recomendados por el perfil elegido.
      path: '/onboarding/recomendados',
      name: 'business-profile-plugins',
      component: BusinessProfileRecommendationsView,
      meta: { requiresAuth: true, requiredPermission: 'plugins:manage', bareShell: true },
    },

    {
      path: '/stock',
      name: 'inventory-stock',
      component: StockListView,
      meta: { requiresAuth: true, requiredPlugin: 'inventory.kardex' },
    },
    {
      path: '/stock/products/:productId',
      name: 'inventory-kardex',
      component: StockMovementsView,
      props: true,
      meta: { requiresAuth: true, requiredPlugin: 'inventory.kardex' },
    },
    {
      // Bodegas cuelga de su propio plugin: se puede llevar kardex con una sola
      // bodega y el concepto oculto. Coincide con el corte del gateway.
      path: '/warehouses',
      name: 'inventory-warehouses',
      component: WarehousesView,
      meta: { requiresAuth: true, requiredPlugin: 'inventory.warehouses' },
    },
    {
      path: '/products',
      name: 'products',
      component: ProductsListView,
      meta: { requiresAuth: true, requiredPlugin: 'infra.catalog_products' },
    },
    {
      path: '/products/new',
      name: 'products-create',
      component: ProductFormView,
      meta: { requiresAuth: true, requiredPlugin: 'infra.catalog_products' },
    },
    {
      path: '/products/:id',
      name: 'products-detail',
      component: ProductDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPlugin: 'infra.catalog_products' },
    },
    {
      path: '/products/:id/edit',
      name: 'products-edit',
      component: ProductFormView,
      props: true,
      meta: { requiresAuth: true, requiredPlugin: 'infra.catalog_products' },
    },

    {
      path: '/customers',
      name: 'customers',
      component: CustomersListView,
      meta: { requiresAuth: true, requiredPermission: 'customer:read', requiredPlugin: 'crm.contacts' },
    },
    {
      path: '/customers/new',
      name: 'customers-create',
      component: CustomerFormView,
      meta: { requiresAuth: true, requiredPermission: 'customer:create', requiredPlugin: 'crm.contacts' },
    },
    {
      path: '/customers/:id',
      name: 'customers-detail',
      component: CustomerDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'customer:read', requiredPlugin: 'crm.contacts' },
    },
    {
      path: '/customers/:id/edit',
      name: 'customers-edit',
      component: CustomerFormView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'customer:update', requiredPlugin: 'crm.contacts' },
    },

    {
      path: '/invoices',
      name: 'invoices',
      component: InvoiceListView,
      meta: { requiresAuth: true, requiredPermission: 'invoice:read', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/invoices/new',
      name: 'invoices-create',
      component: InvoiceFormView,
      meta: { requiresAuth: true, requiredPermission: 'invoice:create', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/invoices/:id/edit',
      name: 'invoices-edit',
      component: InvoiceFormView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'invoice:update', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/invoices/:id',
      name: 'invoices-detail',
      component: InvoiceDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'invoice:read', requiredPlugin: 'finance.electronic_invoicing' },
    },

        {
      // Plugin de restaurantes (entregable 1: mapa del local). Tres pantallas
      // hermanas; el menú apunta a la primera y las pestañas mueven entre ellas.
      path: '/restaurant',
      redirect: { name: 'restaurant-tables' },
    },
    {
      path: '/restaurant/tables',
      name: 'restaurant-tables',
      component: RestaurantTablesView,
      meta: { requiresAuth: true, requiredPermission: 'restaurant:read', requiredPlugin: 'restaurant.floorplan' },
    },
    {
      path: '/restaurant/plan',
      name: 'restaurant-plan',
      component: RestaurantFloorPlanView,
      meta: { requiresAuth: true, requiredPermission: 'restaurant:read', requiredPlugin: 'restaurant.floorplan' },
    },
    {
      path: '/restaurant/schedule',
      name: 'restaurant-schedule',
      component: RestaurantScheduleView,
      meta: { requiresAuth: true, requiredPermission: 'restaurant:read', requiredPlugin: 'restaurant.floorplan' },
    },

    {
      // Compras (módulos `inventory.suppliers` y `purchasing.purchase_orders`): órdenes, sus recepciones, las facturas de compra
      // y los proveedores. El menú apunta a las órdenes; las pestañas llevan al resto. Cada pantalla pide su propio permiso
      // (separación de funciones).
      path: '/purchasing',
      redirect: { name: 'purchasing-orders' },
    },
    {
      path: '/purchasing/orders',
      name: 'purchasing-orders',
      component: PurchasingOrdersView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      // Antes de `/purchasing/orders/:id`: «new» no es un id.
      path: '/purchasing/orders/new',
      name: 'purchasing-order-new',
      component: PurchasingOrderFormView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:create', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/orders/:id/edit',
      name: 'purchasing-order-edit',
      component: PurchasingOrderFormView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:create', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      // Recepción de mercadería de una orden: subruta de la orden, con su propio nombre para que la pestaña «Órdenes» se marque.
      path: '/purchasing/orders/:id/receiving',
      name: 'purchasing-order-receiving',
      component: PurchasingReceivingView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/orders/:id',
      name: 'purchasing-order',
      component: PurchasingOrderView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/receipts',
      name: 'purchasing-receipts',
      component: PurchasingReceiptsView,
      meta: { requiresAuth: true, requiredPermission: 'purchase:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/bills',
      name: 'purchasing-bills',
      component: PurchasingBillsView,
      meta: { requiresAuth: true, requiredPermission: 'purchase_bill:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      // Antes de `/purchasing/bills/:id`: «new» no es un id.
      path: '/purchasing/bills/new',
      name: 'purchasing-bill-new',
      component: PurchasingBillFormView,
      meta: { requiresAuth: true, requiredPermission: 'purchase_bill:create', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/bills/:id/edit',
      name: 'purchasing-bill-edit',
      component: PurchasingBillFormView,
      meta: { requiresAuth: true, requiredPermission: 'purchase_bill:create', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/bills/:id',
      name: 'purchasing-bill',
      component: PurchasingBillView,
      meta: { requiresAuth: true, requiredPermission: 'purchase_bill:read', requiredPlugin: 'purchasing.purchase_orders' },
    },
    {
      path: '/purchasing/suppliers',
      name: 'purchasing-suppliers',
      component: PurchasingSuppliersView,
      meta: { requiresAuth: true, requiredPermission: 'supplier:read', requiredPlugin: 'inventory.suppliers' },
    },

    // Tesorería (Fase 3): cartera de cuentas por cobrar. Todas detrás del módulo y de su permiso; lo que escribe pide el suyo.
    {
      path: '/treasury/receivables',
      name: 'treasury-receivables',
      component: TreasuryReceivablesView,
      meta: { requiresAuth: true, requiredPermission: 'receivable:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/aging',
      name: 'treasury-aging',
      component: TreasuryAgingView,
      meta: { requiresAuth: true, requiredPermission: 'receivable:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/opening-balances',
      name: 'treasury-opening-balances',
      component: TreasuryOpeningBalancesView,
      meta: { requiresAuth: true, requiredPermission: 'opening_balance:load', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/customers/:id/statement',
      name: 'treasury-customer-statement',
      component: TreasuryCustomerStatementView,
      meta: { requiresAuth: true, requiredPermission: 'receivable:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/receipts',
      name: 'treasury-receipts',
      component: TreasuryReceiptsView,
      meta: { requiresAuth: true, requiredPermission: 'receipt:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/receipts/new',
      name: 'treasury-receipt-new',
      component: TreasuryReceiptFormView,
      meta: { requiresAuth: true, requiredPermission: 'receipt:create', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/receipts/:id',
      name: 'treasury-receipt',
      component: TreasuryReceiptDetailView,
      meta: { requiresAuth: true, requiredPermission: 'receipt:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/receipts/:id/edit',
      name: 'treasury-receipt-edit',
      component: TreasuryReceiptFormView,
      meta: { requiresAuth: true, requiredPermission: 'receipt:create', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/reminders',
      name: 'treasury-reminders',
      component: TreasuryRemindersView,
      meta: { requiresAuth: true, requiredPermission: 'reminder:manage', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payables',
      name: 'treasury-payables',
      component: TreasuryPayablesView,
      meta: { requiresAuth: true, requiredPermission: 'payable:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/suppliers/:id/statement',
      name: 'treasury-supplier-statement',
      component: TreasurySupplierStatementView,
      meta: { requiresAuth: true, requiredPermission: 'payable:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payments',
      name: 'treasury-payments',
      component: TreasuryPaymentsView,
      meta: { requiresAuth: true, requiredPermission: 'payment:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payments/new',
      name: 'treasury-payment-new',
      component: TreasuryPaymentFormView,
      meta: { requiresAuth: true, requiredPermission: 'payment:create', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payments/:id',
      name: 'treasury-payment',
      component: TreasuryPaymentDetailView,
      meta: { requiresAuth: true, requiredPermission: 'payment:read', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payments/:id/edit',
      name: 'treasury-payment-edit',
      component: TreasuryPaymentFormView,
      meta: { requiresAuth: true, requiredPermission: 'payment:create', requiredPlugin: 'finance.accounts_receivable_payable' },
    },
    {
      path: '/treasury/payable-opening-balances',
      name: 'treasury-payable-opening',
      component: TreasuryPayableOpeningView,
      meta: { requiresAuth: true, requiredPermission: 'opening_balance:load', requiredPlugin: 'finance.accounts_receivable_payable' },
    },

    {
      // Comprobantes que se emiten aparte de la factura: retenciones y guías de remisión. Salen de la misma facturación electrónica
      // (mismo plugin y mismo certificado); ver el alta requiere `fiscal:read` y emitir, el permiso de cada comprobante.
      path: '/tax-documents',
      redirect: { name: 'tax-withholdings' },
    },
    {
      path: '/tax-documents/withholdings',
      name: 'tax-withholdings',
      component: TaxWithholdingsView,
      meta: { requiresAuth: true, requiredPermission: 'fiscal:read', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/tax-documents/withholdings/new',
      name: 'tax-withholding-new',
      component: TaxWithholdingFormView,
      meta: { requiresAuth: true, requiredPermission: 'withholding:issue', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/tax-documents/guides',
      name: 'tax-delivery-guides',
      component: TaxDeliveryGuidesView,
      meta: { requiresAuth: true, requiredPermission: 'fiscal:read', requiredPlugin: 'finance.electronic_invoicing' },
    },
    {
      path: '/tax-documents/guides/new',
      name: 'tax-delivery-guide-new',
      component: TaxDeliveryGuideFormView,
      meta: { requiresAuth: true, requiredPermission: 'delivery_guide:issue', requiredPlugin: 'finance.electronic_invoicing' },
    },

    {
      // Contabilidad general (módulo `finance.general_ledger`): plan de cuentas, libro diario, periodos y balance. El menú apunta
      // al plan y las pestañas mueven entre las demás. Cada pantalla pide su propio permiso (separación de funciones).
      path: '/accounting',
      redirect: { name: 'accounting-accounts' },
    },
    {
      path: '/accounting/accounts',
      name: 'accounting-accounts',
      component: AccountingAccountsView,
      meta: { requiresAuth: true, requiredPermission: 'account:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/journal',
      name: 'accounting-journal',
      component: AccountingJournalView,
      meta: { requiresAuth: true, requiredPermission: 'journal:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      // Antes de `/accounting/journal/:id`: «new» no es un id.
      path: '/accounting/journal/new',
      name: 'accounting-entry-new',
      component: AccountingEntryView,
      meta: { requiresAuth: true, requiredPermission: 'journal:create', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/journal/:id',
      name: 'accounting-entry',
      component: AccountingEntryView,
      meta: { requiresAuth: true, requiredPermission: 'journal:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/automatic',
      name: 'accounting-automatic',
      component: AccountingAutomaticView,
      meta: { requiresAuth: true, requiredPermission: 'account:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/periods',
      name: 'accounting-periods',
      component: AccountingPeriodsView,
      meta: { requiresAuth: true, requiredPermission: 'account:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/statements',
      name: 'accounting-statements',
      component: AccountingStatementsView,
      meta: { requiresAuth: true, requiredPermission: 'ledger:read', requiredPlugin: 'finance.general_ledger' },
    },
    {
      path: '/accounting/reports',
      name: 'accounting-reports',
      component: AccountingReportsView,
      meta: { requiresAuth: true, requiredPermission: 'ledger:read', requiredPlugin: 'finance.general_ledger' },
    },

    {
      path: '/plugins',
      name: 'plugins',
      component: PluginsView,
      meta: { requiresAuth: true, requiredPermission: 'plugins:read' },
    },

    {
      // Bitácora de auditoría. Es del núcleo (no depende de ningún plugin);
      // el guard del router filtra por permiso y el gateway lo vuelve a exigir.
      path: '/audit-logs',
      name: 'audit-logs',
      component: AuditLogView,
      meta: { requiresAuth: true, requiredPermission: 'audit:read' },
    },

    {
      path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const authenticated = !!getAccessToken();
  if (to.meta.requiresAuth && !authenticated) {
    disconnectRealtime();
    return { name: 'login' };
  }
  if (to.name === 'login' && authenticated) return { name: 'home' };

  if (authenticated && to.meta.requiresAuth) {
    const auth = useAuthStore();
    if (!auth.user) {
      try {
        await auth.fetchMe();
      } catch {
        disconnectRealtime();
        return { name: 'login' };
      }
    }
    if (auth.needsOrgSetup && to.name !== 'profile' && to.name !== 'organization-settings') {
      return { name: 'organization-settings' };
    }

    const requiredPermission = to.meta.requiredPermission as string | undefined;
    if (requiredPermission && !auth.can(requiredPermission)) {
      return { name: 'home' };
    }

    // Los plugins son por organización: sin una todavía (usuario en pleno
    // setup, ej. tras un primer login con Google) esta llamada siempre da
    // 401 y dispara el logout automático del interceptor. Se salta en las
    // rutas de configuración de organización, igual que el chequeo de arriba.
    if (to.name !== 'profile' && to.name !== 'organization-settings') {
      // Los plugins activos se cargan una vez por sesión: los necesita tanto el
      // guard de abajo como el menú lateral, que se arma en cada navegación.
      const plugins = usePluginsStore();
      await plugins.ensureMyLoaded();

      // Módulos vendibles: además del permiso, la organización debe tener el
      // plugin activo. El gateway lo vuelve a comprobar (403 PLUGIN_NOT_ACTIVE);
      // esto solo evita mostrar una vista que no podría cargar datos.
      const requiredPlugin = to.meta.requiredPlugin as string | undefined;
      if (requiredPlugin && !plugins.isActive(requiredPlugin)) {
        return { name: 'plugins' };
      }
    }
  }

  // Conexión global de tiempo real: activa en cuanto hay sesión válida.
  if (authenticated) {
    connectRealtime();
  } else {
    disconnectRealtime();
  }

  return true;
});

export default router;

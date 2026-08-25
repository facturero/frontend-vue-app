import { createRouter, createWebHistory } from 'vue-router';
import { getAccessToken } from '@/utils/http';
import { connectRealtime, disconnectRealtime } from '@/utils/realtime';
import { useAuthStore } from '@/stores/auth';
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
import ProductsListView from '@/views/products/ProductsListView.vue';
import ProductFormView from '@/views/products/ProductFormView.vue';
import ProductDetailView from '@/views/products/ProductDetailView.vue';
import CustomersListView from '@/views/customers/CustomersListView.vue';
import CustomerFormView from '@/views/customers/CustomerFormView.vue';
import CustomerDetailView from '@/views/customers/CustomerDetailView.vue';
import InvoiceListView from '@/views/invoices/InvoiceListView.vue';
import InvoiceDetailView from '@/views/invoices/InvoiceDetailView.vue';
import InvoiceFormView from '@/views/invoices/InvoiceFormView.vue';
import PluginsView from '@/views/plugins/PluginsView.vue';

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

    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },

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
      meta: { requiresAuth: true, requiredPermission: 'establishment:read' },
    },

    {
      path: '/organization/certificates',
      name: 'organization-certificates',
      component: CertificatesView,
      meta: { requiresAuth: true, requiredPermission: 'fiscal:manage' },
    },

    {
      path: '/products',
      name: 'products',
      component: ProductsListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/products/new',
      name: 'products-create',
      component: ProductFormView,
      meta: { requiresAuth: true },
    },
    {
      path: '/products/:id',
      name: 'products-detail',
      component: ProductDetailView,
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/products/:id/edit',
      name: 'products-edit',
      component: ProductFormView,
      props: true,
      meta: { requiresAuth: true },
    },

    {
      path: '/customers',
      name: 'customers',
      component: CustomersListView,
      meta: { requiresAuth: true, requiredPermission: 'customer:read' },
    },
    {
      path: '/customers/new',
      name: 'customers-create',
      component: CustomerFormView,
      meta: { requiresAuth: true, requiredPermission: 'customer:create' },
    },
    {
      path: '/customers/:id',
      name: 'customers-detail',
      component: CustomerDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'customer:read' },
    },
    {
      path: '/customers/:id/edit',
      name: 'customers-edit',
      component: CustomerFormView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'customer:update' },
    },

    {
      path: '/invoices',
      name: 'invoices',
      component: InvoiceListView,
      meta: { requiresAuth: true, requiredPermission: 'invoice:read' },
    },
    {
      path: '/invoices/new',
      name: 'invoices-create',
      component: InvoiceFormView,
      meta: { requiresAuth: true, requiredPermission: 'invoice:create' },
    },
    {
      path: '/invoices/:id/edit',
      name: 'invoices-edit',
      component: InvoiceFormView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'invoice:update' },
    },
    {
      path: '/invoices/:id',
      name: 'invoices-detail',
      component: InvoiceDetailView,
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'invoice:read' },
    },

        {
      path: '/plugins',
      name: 'plugins',
      component: PluginsView,
      meta: { requiresAuth: true, requiredPermission: 'plugins:read' },
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

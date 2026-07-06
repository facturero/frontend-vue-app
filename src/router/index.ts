import { createRouter, createWebHistory } from 'vue-router';
import { getAccessToken } from '@/utils/http';
import AuthView from '@/views/AuthView.vue';
import HomeView from '@/views/HomeView.vue';
import CompleteProfileView from '@/views/ProfileView.vue';
import EmployeesListView from '@/views/employees/EmployeesListView.vue';
import EmployeeInviteView from '@/views/employees/EmployeeInviteView.vue';
import EmployeeDetailView from '@/views/employees/EmployeeDetailView.vue';
import RolesListView from '@/views/roles/RolesListView.vue';
import RoleCreateView from '@/views/roles/RoleCreateView.vue';
import RoleEditView from '@/views/roles/RoleEditView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: AuthView },

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
      component: EmployeeInviteView,
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

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const authenticated = !!getAccessToken();
  if (to.meta.requiresAuth && !authenticated) return { name: 'login' };
  if (to.name === 'login' && authenticated) return { name: 'home' };
  return true;
});

export default router;

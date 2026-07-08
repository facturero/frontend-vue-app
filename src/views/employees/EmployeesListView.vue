<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEmployeeStore } from '@/stores/employees';
import { useRoleStore } from '@/stores/roles';
import RoleBadge from '@/components/RoleBadge.vue';
import InviteEmployeeDialog from '@/components/InviteEmployeeDialog.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const emp = useEmployeeStore();
const rolesStore = useRoleStore();

const canInvite = computed(() => auth.can('user:invite'));
const canAssignRole = computed(() => auth.can('user:assign_role'));

const showInviteDialog = ref(false);

watch(() => route.name, (name) => {
  showInviteDialog.value = name === 'employees-invite';
}, { immediate: true });

watch(showInviteDialog, (v) => {
  if (!v && route.name === 'employees-invite') {
    router.push({ name: 'employees' });
  }
});

function openInvite(): void {
  emp.error = null;
  router.push({ name: 'employees-invite' });
}

function closeInvite(): void {
  showInviteDialog.value = false;
  router.push({ name: 'employees' });
}

onMounted(async () => {
  await Promise.all([
    emp.fetch(),
    rolesStore.fetch(),
  ]);
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mt-6 mb-4">
      <h2 class="text-h5 font-weight-medium">Empleados</h2>
      <v-btn
        v-if="canInvite"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-account-plus"
        @click="openInvite"
      >
        Invitar
      </v-btn>
    </div>

    <v-alert
      v-if="emp.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="emp.error = null"
    >
      {{ emp.error }}
    </v-alert>

    <v-card v-if="!emp.loading" elevation="2" rounded="lg">
      <v-table>
        <thead>
          <tr>
            <th class="text-left font-weight-medium">Nombre</th>
            <th class="text-left font-weight-medium">Email</th>
            <th class="text-left font-weight-medium">Roles</th>
            <th class="text-left font-weight-medium">Estado</th>
            <th v-if="canAssignRole" class="text-right font-weight-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in emp.list" :key="e.id">
            <td>{{ e.fullName || '—' }}</td>
            <td>{{ e.email }}</td>
            <td>
              <RoleBadge v-for="role in e.roles" :key="role" :name="role" class="mr-1" />
            </td>
            <td>
              <v-chip
                size="x-small"
                :color="e.status === 'active' ? 'success' : 'warning'"
                variant="tonal"
              >
                {{ e.status }}
              </v-chip>
            </td>
            <td v-if="canAssignRole" class="text-right">
              <v-btn
                size="small"
                variant="text"
                icon="mdi-account-cog"
                @click="router.push({ name: 'employees-detail', params: { id: e.id } })"
              />
            </td>
          </tr>
          <tr v-if="emp.list.length === 0">
            <td colspan="5" class="text-center text-medium-emphasis py-6">
              No hay empleados registrados
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <InviteEmployeeDialog v-model="showInviteDialog" />
  </v-container>
</template>

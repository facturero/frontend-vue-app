<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEmployeeStore } from '@/stores/employees';
import { useOrganizationStore } from '@/stores/organization';
import { useRoleStore } from '@/stores/roles';
import RoleBadge from '@/components/RoleBadge.vue';
import InviteEmployeeDialog from '@/components/InviteEmployeeDialog.vue';
import RestorePasswordDialog from '@/components/RestorePasswordDialog.vue';
import type { EmployeeSummary } from '@/types/employees';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const emp = useEmployeeStore();
const rolesStore = useRoleStore();
const organizationStore = useOrganizationStore();

const establishmentFilter = ref<string | null>(null);
const establishmentNames = computed(() => {
  const map = new Map<string, string>();
  for (const e of organizationStore.establishments) {
    map.set(e.id, `${e.code} — ${e.name}`);
  }
  return map;
});

const canInvite = computed(() => auth.can('user:invite'));
const canAssignRole = computed(() => auth.can('user:assign_role'));
const canViewPasswords = computed(() => auth.can('password:view'));
const canChangePassword = computed(() => auth.can('password:change'));
const showActions = computed(() => canAssignRole.value || canChangePassword.value);
const colCount = computed(() => (canViewPasswords.value ? 7 : 6) + (showActions.value ? 1 : 0));

const showInviteDialog = ref(false);
const restoreDialog = ref(false);
const restoreTarget = ref<EmployeeSummary | null>(null);

function openRestore(employee: EmployeeSummary): void {
  restoreTarget.value = employee;
  restoreDialog.value = true;
}

function onPasswordSaved(): void {
  emp.fetch();
}

async function doSearch(): Promise<void> {
  await emp.fetch(establishmentFilter.value || undefined);
}

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
    organizationStore.fetchEstablishments(),
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

    <v-card elevation="2" rounded="lg" class="mb-4">
      <v-card-text>
        <v-row dense align="end">
          <v-col cols="12" sm="4">
            <v-select
              v-model="establishmentFilter"
              :items="[
                { title: 'Todos los establecimientos', value: null },
                ...organizationStore.establishments.map((e) => ({
                  title: `${e.code} — ${e.name}`,
                  value: e.id,
                })),
              ]"
              label="Establecimiento"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              @update:model-value="doSearch"
              data-testid="employees-establishment-filter"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="!emp.loading" elevation="2" rounded="lg">
      <v-table>
        <thead>
          <tr>
            <th class="text-left font-weight-medium">Nombre</th>
            <th class="text-left font-weight-medium">Usuario</th>
            <th v-if="canViewPasswords" class="text-left font-weight-medium">Contraseña</th>
            <th class="text-left font-weight-medium">Email</th>
            <th class="text-left font-weight-medium">Roles</th>
            <th class="text-left font-weight-medium">Establecimientos</th>
            <th class="text-left font-weight-medium">Estado</th>
            <th v-if="showActions" class="text-right font-weight-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in emp.list" :key="e.id">
            <td>{{ e.fullName || '—' }}</td>
            <td>{{ e.username || '—' }}</td>
            <td v-if="canViewPasswords">
              <span :class="e.hasPassword ? '' : 'text-medium-emphasis'">
                {{ e.hasPassword ? '*****' : 'No establecida' }}
              </span>
            </td>
            <td>{{ e.email }}</td>
            <td>
              <RoleBadge v-for="role in e.roles" :key="role" :name="role" class="mr-1" />
            </td>
            <td>
              <template v-if="e.establishmentIds.length > 0">
                <v-chip
                  v-for="estId in e.establishmentIds"
                  :key="estId"
                  size="x-small"
                  variant="tonal"
                  color="secondary"
                  class="mr-1"
                  data-testid="employee-establishment-chip"
                >
                  {{ establishmentNames.get(estId) || '—' }}
                </v-chip>
              </template>
              <span v-else class="text-medium-emphasis">—</span>
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
            <td v-if="showActions" class="text-right">
              <v-btn
                v-if="canChangePassword && e.id !== auth.user?.id && !e.isOwner"
                size="small"
                variant="text"
                icon="mdi-key-change"
                title="Restaurar contraseña"
                @click="openRestore(e)"
              />
              <v-btn
                size="small"
                variant="text"
                icon="mdi-account-cog"
                title="Ver detalle"
                @click="router.push({ name: 'employees-detail', params: { id: e.id } })"
              />
            </td>
          </tr>
          <tr v-if="emp.list.length === 0">
            <td :colspan="colCount" class="text-center text-medium-emphasis py-6">
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
    <RestorePasswordDialog
      v-model="restoreDialog"
      :employee="restoreTarget"
      @saved="onPasswordSaved"
    />
  </v-container>
</template>

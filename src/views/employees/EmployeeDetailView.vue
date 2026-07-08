<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmployeeStore } from '@/stores/employees';
import { useRoleStore } from '@/stores/roles';
import { useAuthStore } from '@/stores/auth';
import RoleBadge from '@/components/RoleBadge.vue';
import RoleSelect from '@/components/RoleSelect.vue';

const props = defineProps<{ id: string }>();
const emp = useEmployeeStore();
const rolesStore = useRoleStore();
const auth = useAuthStore();
const router = useRouter();

const selectedRoleIds = ref<string[]>([]);
const assigning = ref(false);
const disabling = ref(false);

const employee = computed(() => emp.list.find((e) => e.id === props.id));
const isActive = computed(() => employee.value?.status === 'active');
const canAssign = computed(() => auth.can('user:assign_role'));
const isSelf = computed(() => auth.user?.id === props.id);
const cannotModify = computed(() => isSelf.value || employee.value?.isOwner === true);
const canDisable = computed(() => auth.can('user:update') && employee.value != null && !isSelf.value && !employee.value?.isOwner);

onMounted(async () => {
  if (emp.list.length === 0) {
    await emp.fetch();
  }
  await rolesStore.fetch();
  if (employee.value && employee.value.roles.length > 0) {
    selectedRoleIds.value = rolesStore.list
      .filter((r) => employee.value!.roles.includes(r.name))
      .map((r) => r.id);
  }
});

async function onStatusChange(): Promise<void> {
  await disableEmployee();
}

async function disableEmployee(): Promise<void> {
  disabling.value = true;
  emp.error = null;
  try {
    await emp.disable(props.id);
    await emp.fetch();
  } catch {
    /* manejado por el store */
  } finally {
    disabling.value = false;
  }
}

async function assignRole(): Promise<void> {
  if (selectedRoleIds.value.length === 0) return;
  assigning.value = true;
  emp.error = null;
  try {
    await emp.assignRole(props.id, selectedRoleIds.value);
    await emp.fetch();
  } catch {
    /* manejado por el store */
  } finally {
    assigning.value = false;
  }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center mt-6 mb-4">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        class="mr-2"
        @click="router.push({ name: 'employees' })"
      />
      <h2 class="text-h5 font-weight-medium">Detalle del empleado</h2>
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

    <template v-if="employee">
      <v-card elevation="2" rounded="lg" class="mb-4">
        <v-card-text>
          <v-list lines="two" density="comfortable">
            <v-list-item title="Email" :subtitle="employee.email" prepend-icon="mdi-email-outline" />
            <v-list-item title="Nombre" :subtitle="employee.fullName || '—'" prepend-icon="mdi-account-outline" />
            <v-list-item title="Estado" prepend-icon="mdi-check-circle-outline">
              <template #subtitle>
                <v-chip-group
                  v-if="canDisable"
                  mandatory
                  :model-value="isActive ? 0 : 1"
                  @update:model-value="onStatusChange"
                  column
                >
                  <v-chip
                    :value="0"
                    color="success"
                    variant="tonal"
                    size="x-small"
                    :disabled="disabling"
                  >
                    activo
                  </v-chip>
                  <v-chip
                    :value="1"
                    color="warning"
                    variant="tonal"
                    size="x-small"
                    :disabled="disabling"
                  >
                    desactivado
                  </v-chip>
                </v-chip-group>
                <v-chip
                  v-else
                  size="x-small"
                  :color="employee.status === 'active' ? 'success' : 'warning'"
                  variant="tonal"
                >
                  {{ employee.status }}
                </v-chip>
              </template>
            </v-list-item>
            <v-list-item title="Roles" prepend-icon="mdi-shield-account-outline">
              <template #subtitle>
                <RoleBadge v-for="role in employee.roles" :key="role" :name="role" class="mr-1" />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <v-card v-if="canAssign" elevation="2" rounded="lg">
        <v-card-title>Asignar roles</v-card-title>
        <v-card-text>
          <v-alert
            v-if="isSelf"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-4"
            text="No puedes modificar tus propios roles."
          />
          <v-alert
            v-else-if="employee?.isOwner"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-4"
            text="No puedes modificar los roles del dueño de la organización."
          />
          <RoleSelect
            v-model="selectedRoleIds"
            multiple
            :disabled="cannotModify"
            class="mb-4"
          />
          <v-btn
            color="primary"
            variant="tonal"
            :loading="assigning"
            :disabled="selectedRoleIds.length === 0 || cannotModify"
            @click="assignRole"
          >
            Actualizar roles
          </v-btn>
        </v-card-text>
      </v-card>
    </template>

    <div v-else-if="!emp.loading" class="text-center text-medium-emphasis py-8">
      Empleado no encontrado
    </div>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </v-container>
</template>

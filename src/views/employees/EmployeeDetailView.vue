<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmployeeStore } from '@/stores/employees';
import { useRoleStore } from '@/stores/roles';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import RoleBadge from '@/components/RoleBadge.vue';
import RoleSelect from '@/components/RoleSelect.vue';
import RestorePasswordDialog from '@/components/RestorePasswordDialog.vue';

const props = defineProps<{ id: string }>();
const emp = useEmployeeStore();
const rolesStore = useRoleStore();
const auth = useAuthStore();
const organizationStore = useOrganizationStore();
const router = useRouter();

const selectedRoleIds = ref<string[]>([]);
const selectedEstablishmentIds = ref<string[]>([]);
const assigning = ref(false);
const savingEstablishments = ref(false);
const disabling = ref(false);
const changeDialog = ref(false);

const employee = computed(() => emp.list.find((e) => e.id === props.id));
const isActive = computed(() => employee.value?.status === 'active');
const canAssign = computed(() => auth.can('user:assign_role'));
const canAssignEstablishments = computed(() => auth.can('user:update'));
const establishmentOptions = computed(() =>
  organizationStore.establishments.map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
);
const isSelf = computed(() => auth.user?.id === props.id);
const cannotModify = computed(() => isSelf.value || employee.value?.isOwner === true);
const canDisable = computed(() => auth.can('user:update') && employee.value != null && !isSelf.value && !employee.value?.isOwner);
const canViewPasswords = computed(() => auth.can('password:view'));
const canChangePassword = computed(
  () => auth.can('password:change') && employee.value != null && !isSelf.value && !employee.value?.isOwner,
);

onMounted(async () => {
  if (emp.list.length === 0) {
    await emp.fetch();
  }
  await rolesStore.fetch();
  if (organizationStore.establishments.length === 0) {
    await organizationStore.fetchEstablishments();
  }
  if (employee.value) {
    selectedEstablishmentIds.value = [...employee.value.establishmentIds];
  }
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

async function updateEstablishments(): Promise<void> {
  savingEstablishments.value = true;
  emp.error = null;
  try {
    await emp.updateEstablishments(props.id, selectedEstablishmentIds.value);
    await emp.fetch();
  } catch {
    /* manejado por el store */
  } finally {
    savingEstablishments.value = false;
  }
}

function openChangeDialog(): void {
  changeDialog.value = true;
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
      <h2 class="text-h5 font-weight-medium">{{ $t('employees.detailTitle') }}</h2>
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
            <v-list-item :title="$t('common.email')" :subtitle="employee.email" prepend-icon="mdi-email-outline" />
            <v-list-item :title="$t('employees.username')" :subtitle="employee.username || '—'"
              prepend-icon="mdi-account-key-outline" />
            <v-list-item
              :title="$t('employees.password')"
              :subtitle="canViewPasswords
                ? (employee.hasPassword ? '*****' : $t('employees.passwordNotSet'))
                : '—'"
              :prepend-icon="canViewPasswords
                ? (employee.hasPassword ? 'mdi-lock-outline' : 'mdi-lock-open-variant-outline')
                : 'mdi-lock-off-outline'"
            >
              <template v-if="canChangePassword" #append>
                <v-btn
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-key-change"
                  @click="openChangeDialog"
                >
                  {{ $t('employees.restorePassword') }}
                </v-btn>
              </template>
            </v-list-item>
            <v-list-item :title="$t('common.name')" :subtitle="employee.fullName || '—'"
              prepend-icon="mdi-account-outline" />
            <v-list-item :title="$t('common.status')" prepend-icon="mdi-check-circle-outline">
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
                    {{ $t('employees.statusActive') }}
                  </v-chip>
                  <v-chip
                    :value="1"
                    color="warning"
                    variant="tonal"
                    size="x-small"
                    :disabled="disabling"
                  >
                    {{ $t('employees.statusDisabled') }}
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
            <v-list-item :title="$t('employees.roles')" prepend-icon="mdi-shield-account-outline">
              <template #subtitle>
                <RoleBadge v-for="role in employee.roles" :key="role" :name="role" class="mr-1" />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <v-card v-if="canAssign" elevation="2" rounded="lg">
        <v-card-title>{{ $t('employees.assignRoles') }}</v-card-title>
        <v-card-text>
          <v-alert
            v-if="isSelf"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-4"
            :text="$t('employees.cannotEditOwnRoles')"
          />
          <v-alert
            v-else-if="employee?.isOwner"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-4"
            :text="$t('employees.cannotEditOwnerRoles')"
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
            {{ $t('employees.updateRoles') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card v-if="canAssignEstablishments" elevation="2" rounded="lg" class="mt-4">
        <v-card-title>{{ $t('employees.assignedEstablishments') }}</v-card-title>
        <v-card-text>
          <v-alert
            v-if="cannotModify"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-4"
            :text="$t('employees.cannotEditEstablishments')"
          />
          <v-select
            v-model="selectedEstablishmentIds"
            :items="establishmentOptions"
            :label="$t('employees.establishments')"
            variant="outlined"
            density="compact"
            multiple
            :disabled="cannotModify"
            class="mb-4"
            data-testid="employee-establishments-select"
          />
          <v-btn
            color="primary"
            variant="tonal"
            :loading="savingEstablishments"
            :disabled="cannotModify"
            data-testid="employee-establishments-save"
            @click="updateEstablishments"
          >
            {{ $t('employees.updateEstablishments') }}
          </v-btn>
        </v-card-text>
      </v-card>
    </template>

    <div v-else-if="!emp.loading" class="text-center text-medium-emphasis py-8">
      {{ $t('employees.notFound') }}
    </div>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <RestorePasswordDialog
      v-model="changeDialog"
      :employee="employee"
      @saved="emp.fetch"
    />
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useRoleStore } from '@/stores/roles';
import RoleBadge from '@/components/RoleBadge.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { extractError } from '@/utils/error';
import type { RoleSummary } from '@/types/roles';

const auth = useAuthStore();
const store = useRoleStore();
const router = useRouter();

const canManage = auth.can('user:assign_role');

// Solo se pueden eliminar los roles propios (no los de sistema). Si alguien todavía tiene el rol, el servidor lo
// rechaza (409) y el mensaje se muestra tal cual.
const roleToDelete = ref<RoleSummary | null>(null);
const deleting = ref(false);

async function confirmDelete(): Promise<void> {
  if (!roleToDelete.value) return;
  deleting.value = true;
  try {
    await store.remove(roleToDelete.value.id);
  } catch (e) {
    store.error = extractError(e);
  } finally {
    deleting.value = false;
    roleToDelete.value = null;
  }
}

onMounted(() => {
  store.fetch();
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('roles.title')">
      <template #actions>
        <v-btn
          v-if="canManage"
          color="primary"
          prepend-icon="mdi-plus"
          @click="router.push({ name: 'roles-create' })"
        >
          {{ $t('roles.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert
      v-if="store.error"
      type="error"
      closable
      class="mb-4"
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <template v-if="!store.loading">
      <v-row>
        <v-col v-for="r in store.list" :key="r.id" cols="12" md="6" lg="4">
          <v-card
            :disabled="r.isSystem"
            @click="!r.isSystem && canManage && router.push({ name: 'roles-edit', params: { id: r.id } })"
            :class="{ 'cursor-pointer': canManage }"
          >
            <v-card-item>
              <v-card-title class="d-flex align-center">
                {{ r.name }}
                <v-chip v-if="r.isSystem" size="x-small" color="lightsecondary" variant="flat" class="ml-2">
                  {{ $t('roles.system') }}
                </v-chip>
              </v-card-title>
              <v-card-subtitle v-if="r.description" class="mt-1">
                {{ r.description }}
              </v-card-subtitle>
              <template v-if="canManage && !r.isSystem" #append>
                <v-btn
                  icon="mdi-delete-outline"
                  variant="text"
                  size="small"
                  color="error"
                  :aria-label="$t('roles.deleteRole')"
                  @click.stop="roleToDelete = r"
                />
              </template>
            </v-card-item>

            <v-card-text>
              <div class="text-caption text-medium-emphasis mb-2">
                {{ $t('roles.permissionsCount', { count: r.permissions.length }) }}
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="p in r.permissions.slice(0, 6)"
                  :key="p"
                  size="x-small"
                  variant="outlined"
                  color="primary"
                >
                  {{ p }}
                </v-chip>
                <v-chip v-if="r.permissions.length > 6" size="x-small" variant="text" color="primary">
                  +{{ r.permissions.length - 6 }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col v-if="store.list.length === 0" cols="12">
          <v-card>
            <v-card-text class="text-center text-medium-emphasis py-6">
              {{ $t('roles.empty') }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-dialog :model-value="roleToDelete !== null" max-width="420" @update:model-value="roleToDelete = null">
      <v-card :title="$t('roles.deleteConfirmTitle')">
        <v-card-text>{{ $t('roles.deleteConfirmText', { name: roleToDelete?.name ?? '' }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="deleting" @click="roleToDelete = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDelete">{{ $t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

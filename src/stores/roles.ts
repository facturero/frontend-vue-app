import { defineStore } from 'pinia';
import { ref } from 'vue';
import { roleApi } from '@/api/roles';
import { extractError } from '@/utils/error';
import type { PermissionItem, RoleSummary } from '@/types/roles';

export const useRoleStore = defineStore('roles', () => {
  const list = ref<RoleSummary[]>([]);
  const permissions = ref<PermissionItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await roleApi.list();
      console.log('Fetched roles:', list.value);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchPermissions(): Promise<void> {
    try {
      permissions.value = await roleApi.listPermissions();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    }
  }

  async function create(name: string, description: string | undefined, permissionCodes: string[]): Promise<string> {
    error.value = null;
    const result = await roleApi.create({ name, description, permissions: permissionCodes });
    return result.roleId;
  }

  async function updatePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
    error.value = null;
    await roleApi.updatePermissions(roleId, { permissions: permissionCodes });
  }

  return { list, permissions, loading, error, fetch, fetchPermissions, create, updatePermissions };
});

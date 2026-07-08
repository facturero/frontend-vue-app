import { defineStore } from 'pinia';
import { ref } from 'vue';
import { employeeApi } from '@/api/employees';
import { extractError } from '@/utils/error';
import type { EmployeeSummary } from '@/types/employees';

export const useEmployeeStore = defineStore('employees', () => {
  const list = ref<EmployeeSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await employeeApi.list();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function invite(email: string, roleIds: string[]): Promise<string> {
    const { userId } = await employeeApi.invite({ email, roleIds });
    return userId;
  }

  async function assignRole(userId: string, roleIds: string[]): Promise<void> {
    error.value = null;
    await employeeApi.assignRole(userId, roleIds);
  }

  async function disable(userId: string): Promise<void> {
    error.value = null;
    await employeeApi.disable(userId);
  }

  return { list, loading, error, fetch, invite, assignRole, disable };
});

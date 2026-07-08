import { defineStore } from 'pinia';
import { ref } from 'vue';
import { organizationApi } from '@/api/organization';
import { extractError } from '@/utils/error';
import type { OrganizationDTO, UpdateOrganizationInput } from '@/types/organization';

export const useOrganizationStore = defineStore('organization', () => {
  const org = ref<OrganizationDTO | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const saving = ref(false);

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      org.value = await organizationApi.getMyOrganization();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function update(input: UpdateOrganizationInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      org.value = await organizationApi.update(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return { org, loading, error, saving, fetch, update };
});

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { customerApi } from '@/api/customers';
import { extractError } from '@/utils/error';
import type {
  Customer,
  CustomerDetail,
  CreateCustomerInput,
  UpdateCustomerInput,
  IdentificationType,
  Tag,
} from '@/types/customers';

export const useCustomerStore = defineStore('customers', () => {
  const list = ref<Customer[]>([]);
  const current = ref<CustomerDetail | null>(null);
  const identificationTypes = ref<IdentificationType[]>([]);
  const tags = ref<Tag[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetch(params?: { search?: string; status?: string; tagId?: string }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await customerApi.list(params);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchById(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      current.value = await customerApi.getById(id);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateCustomerInput): Promise<Customer> {
    saving.value = true;
    error.value = null;
    try {
      return await customerApi.create(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: UpdateCustomerInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const updated = await customerApi.update(id, input);
      if (current.value && current.value.id === id) {
        current.value = { ...current.value, ...updated };
      }
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function disable(id: string): Promise<void> {
    error.value = null;
    await customerApi.disable(id);
    list.value = list.value.map((c) =>
      c.id === id ? { ...c, status: 'inactive' as const } : c,
    );
    if (current.value && current.value.id === id) {
      current.value = { ...current.value, status: 'inactive' };
    }
  }

  async function fetchCatalog(): Promise<void> {
    try {
      const [ids, tgs] = await Promise.all([
        customerApi.listIdentificationTypes(),
        customerApi.listTags(),
      ]);
      identificationTypes.value = ids;
      tags.value = tgs;
    } catch (e) {
      error.value = extractError(e);
    }
  }

  return {
    list, current, identificationTypes, tags,
    loading, saving, error,
    fetch, fetchById, create, update, disable, fetchCatalog,
  };
});

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { productApi } from '@/api/products';
import { extractError } from '@/utils/error';
import type {
  ProductSummary,
  ProductDetail,
  CreateProductInput,
  UpdateProductInput,
  Category,
  Unit,
  TaxRate,
} from '@/types/products';

export const useProductStore = defineStore('products', () => {
  const list = ref<ProductSummary[]>([]);
  const current = ref<ProductDetail | null>(null);
  const categories = ref<Category[]>([]);
  const units = ref<Unit[]>([]);
  const taxRates = ref<TaxRate[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetch(params?: { search?: string; status?: string; type?: string; categoryId?: string }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await productApi.list(params);
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
      current.value = await productApi.getById(id);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateProductInput): Promise<ProductDetail> {
    saving.value = true;
    error.value = null;
    try {
      const product = await productApi.create(input);
      return product;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, input: UpdateProductInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await productApi.update(id, input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function updateTaxes(id: string, taxRateIds: string[]): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await productApi.updateTaxes(id, { taxRateIds });
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function disable(id: string): Promise<void> {
    error.value = null;
    await productApi.disable(id);
    list.value = list.value.map((p) =>
      p.id === id ? { ...p, status: 'inactive' as const } : p,
    );
  }

  async function fetchCatalog(): Promise<void> {
    try {
      const [cat, unt, tax] = await Promise.all([
        productApi.listCategories(),
        productApi.listUnits(),
        productApi.listTaxRates(),
      ]);
      categories.value = cat;
      units.value = unt;
      taxRates.value = tax;
    } catch (e) {
      error.value = extractError(e);
    }
  }

  return {
    list, current, categories, units, taxRates,
    loading, saving, error,
    fetch, fetchById, create, update, updateTaxes, disable, fetchCatalog,
  };
});

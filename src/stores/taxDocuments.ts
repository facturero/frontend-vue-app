import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fiscalApi } from '@/api/fiscal';
import { extractError } from '@/utils/error';
import type {
  DeliveryGuideInput,
  FiscalCodeCatalog,
  FiscalDocumentType,
  FiscalInvoiceDTO,
  WithholdingInput,
  WithholdingPrefill,
} from '@/types/fiscal';

/** Retenciones (07) y guías de remisión (06) que fiscal emite directamente. */
export const useTaxDocumentsStore = defineStore('taxDocuments', () => {
  const items = ref<FiscalInvoiceDTO[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const catalog = ref<FiscalCodeCatalog | null>(null);
  /** Lo deja la factura de compra antes de abrir el formulario de retención; el formulario lo consume y lo borra. */
  const withholdingPrefill = ref<WithholdingPrefill | null>(null);

  async function fetchList(documentType: FiscalDocumentType, requestedPage = 1, status?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await fiscalApi.listFiscalDocuments({ documentType, source: 'fiscal', status, page: requestedPage, pageSize: pageSize.value });
      items.value = result.items;
      total.value = result.total;
      page.value = result.page;
    } catch (e) {
      error.value = extractError(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadCatalog(): Promise<void> {
    if (catalog.value) return;
    try {
      catalog.value = await fiscalApi.getCodeCatalog();
    } catch (e) {
      error.value = extractError(e);
    }
  }

  async function createWithholding(input: WithholdingInput): Promise<FiscalInvoiceDTO> {
    saving.value = true;
    error.value = null;
    try {
      return await fiscalApi.createWithholding(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function createDeliveryGuide(input: DeliveryGuideInput): Promise<FiscalInvoiceDTO> {
    saving.value = true;
    error.value = null;
    try {
      return await fiscalApi.createDeliveryGuide(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return { items, total, page, pageSize, loading, saving, error, catalog, withholdingPrefill, fetchList, loadCatalog, createWithholding, createDeliveryGuide };
});

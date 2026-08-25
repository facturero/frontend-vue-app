import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoiceApi } from '@/api/invoices';
import { extractError } from '@/utils/error';
import type {
  InvoiceSummary,
  InvoiceDetail,
  CreateInvoiceInput,
  AddLineInput,
  IssueInvoiceInput,
  VoidInvoiceInput,
} from '@/types/invoices';

export const useInvoiceStore = defineStore('invoices', () => {
  const list = ref<InvoiceSummary[]>([]);
  const current = ref<InvoiceDetail | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetch(params?: { status?: string; customerId?: string; from?: string; to?: string }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      list.value = await invoiceApi.list(params);
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
      current.value = await invoiceApi.getById(id);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateInvoiceInput): Promise<InvoiceDetail> {
    saving.value = true;
    error.value = null;
    try {
      const invoice = await invoiceApi.create(input);
      return invoice;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function addLine(invoiceId: string, input: AddLineInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await invoiceApi.addLine(invoiceId, input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function removeLine(invoiceId: string, lineId: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await invoiceApi.removeLine(invoiceId, lineId);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function issue(invoiceId: string, input: IssueInvoiceInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await invoiceApi.issue(invoiceId, input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function voidInvoice(invoiceId: string, input: VoidInvoiceInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      current.value = await invoiceApi.void(invoiceId, input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return {
    list, current, loading, saving, error,
    fetch, fetchById, create, addLine, removeLine, issue, voidInvoice,
  };
});

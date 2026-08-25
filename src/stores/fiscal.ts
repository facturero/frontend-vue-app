import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fiscalApi } from '@/api/fiscal';
import { extractError } from '@/utils/error';
import type { CertificateDTO, FiscalInvoiceDTO } from '@/types/fiscal';

export const useFiscalStore = defineStore('fiscal', () => {
  const certificates = ref<CertificateDTO[]>([]);
  const currentFiscalInvoice = ref<FiscalInvoiceDTO | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const hasActiveCertificate = computed(() =>
    certificates.value.some((c) => c.status === 'active' && new Date(c.valid_until) >= new Date()),
  );

  async function fetchCertificates(): Promise<void> {
    loading.value = true;
    try {
      certificates.value = await fiscalApi.getCertificates();
    } catch (e) {
      error.value = extractError(e);
    } finally {
      loading.value = false;
    }
  }

  async function uploadCertificate(file: File, password: string, alias?: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const cert = await fiscalApi.uploadCertificate(file, password, alias);
      certificates.value.push(cert);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function revokeCertificate(id: string): Promise<void> {
    try {
      await fiscalApi.revokeCertificate(id);
      const cert = certificates.value.find((c) => c.id === id);
      if (cert) cert.status = 'revoked';
    } catch (e) {
      error.value = extractError(e);
      throw e;
    }
  }

  async function fetchFiscalInvoice(billingInvoiceId: string): Promise<void> {
    currentFiscalInvoice.value = await fiscalApi.getFiscalInvoice(billingInvoiceId);
  }

  async function retryFiscalInvoice(billingInvoiceId: string): Promise<void> {
    await fiscalApi.retryFiscalInvoice(billingInvoiceId);
    await fetchFiscalInvoice(billingInvoiceId);
  }

  return {
    certificates, currentFiscalInvoice, loading, saving, error, hasActiveCertificate,
    fetchCertificates, uploadCertificate, revokeCertificate, fetchFiscalInvoice, retryFiscalInvoice,
  };
});

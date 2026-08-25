import { defineStore } from 'pinia';
import { ref } from 'vue';
import { organizationApi } from '@/api/organization';
import { extractError } from '@/utils/error';
import type {
  OrganizationDTO, UpdateOrganizationInput, UpsertOrganizationInput,
  EstablishmentDTO, CreateEstablishmentInput,
  EmissionPointDTO, CreateEmissionPointInput,
} from '@/types/organization';

export const useOrganizationStore = defineStore('organization', () => {
  const org = ref<OrganizationDTO | null>(null);
  const establishments = ref<EstablishmentDTO[]>([]);
  const emissionPoints = ref<EmissionPointDTO[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const saving = ref(false);

  // Estado del diálogo de "código de emparejamiento" (POS)
  const pairingCode = ref<string | null>(null);
  const pairingSecondsRemaining = ref(0);
  let pairingCountdownHandle: ReturnType<typeof setInterval> | null = null;

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

  async function fetchEstablishments(): Promise<void> {
    try {
      establishments.value = await organizationApi.getEstablishments();
    } catch (e) {
      error.value = extractError(e);
    }
  }

  async function fetchEmissionPoints(establishmentId: string): Promise<void> {
    try {
      emissionPoints.value = await organizationApi.getEmissionPoints(establishmentId);
    } catch (e) {
      error.value = extractError(e);
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

  async function upsert(input: UpsertOrganizationInput): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      org.value = await organizationApi.upsert(input);
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function createEstablishment(input: CreateEstablishmentInput): Promise<EstablishmentDTO> {
    saving.value = true;
    error.value = null;
    try {
      const est = await organizationApi.createEstablishment(input);
      establishments.value.push(est);
      return est;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function createEmissionPoint(establishmentId: string, input: CreateEmissionPointInput): Promise<EmissionPointDTO> {
    saving.value = true;
    error.value = null;
    try {
      const ep = await organizationApi.createEmissionPoint(establishmentId, input);
      emissionPoints.value.push(ep);
      return ep;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  // El TOTP rota cada ~30s. En vez de hacer polling cada pocos segundos (que
  // hace que el contador "salte"), el cliente cuenta hacia abajo localmente
  // cada 1s y solo re-consulta el API cuando el código está por rotar — así el
  // contador se ve fluido con 1 request por ventana de 30s en lugar de n.
  async function startPairingCodePolling(establishmentId: string, pointId: string): Promise<void> {
    stopPairingCodePolling();
    pairingCode.value = null;
    pairingSecondsRemaining.value = 0;

    async function tick(): Promise<void> {
      if (pairingCountdownHandle) return;
      try {
        const res = await organizationApi.getPairingCode(establishmentId, pointId);
        pairingCode.value = res.code;
        pairingSecondsRemaining.value = res.secondsRemaining;
      } catch (e) {
        error.value = extractError(e);
      }
      pairingCountdownHandle = setInterval(() => {
        if (pairingSecondsRemaining.value <= 1) {
          pairingSecondsRemaining.value = 0;
          clearInterval(pairingCountdownHandle!);
          pairingCountdownHandle = null;
          void tick();
        } else {
          pairingSecondsRemaining.value -= 1;
        }
      }, 1000);
    }

    await tick();
  }

  function stopPairingCodePolling(): void {
    if (pairingCountdownHandle) clearInterval(pairingCountdownHandle);
    pairingCountdownHandle = null;
    pairingCode.value = null;
    pairingSecondsRemaining.value = 0;
  }

  async function unlinkEmissionPoint(establishmentId: string, pointId: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const updated = await organizationApi.unlinkEmissionPoint(establishmentId, pointId);
      const idx = emissionPoints.value.findIndex((ep) => ep.id === pointId);
      if (idx !== -1) emissionPoints.value[idx] = updated;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return {
    org, establishments, emissionPoints, loading, error, saving,
    pairingCode, pairingSecondsRemaining,
    fetch, fetchEstablishments, fetchEmissionPoints, update, upsert,
    createEstablishment, createEmissionPoint,
    startPairingCodePolling, stopPairingCodePolling, unlinkEmissionPoint,
  };
});

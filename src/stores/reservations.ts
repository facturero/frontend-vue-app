import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { reservationsApi } from '@/api/reservations';
import { extractError } from '@/utils/error';
import type {
  DayAvailability,
  Reservation,
  ReservationSettings,
  ReservationSettingsInput,
  ReservationStatus,
  StaffReservationInput,
} from '@/types/restaurant';

/** Hoy en la fecha local del navegador (`YYYY-MM-DD`). El servidor interpreta `date` como el día del RESTAURANTE. */
export function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Suma días a una fecha `YYYY-MM-DD` sin pasar por la zona horaria del navegador. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** Estados en los que la reserva sigue ocupando mesa. */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'seated'];

/**
 * Reservas del restaurante vistas por el personal: la lista de un día, la disponibilidad para anotar una nueva y los ajustes
 * de la página pública. El mapa (mesas, plano, horarios) vive en `restaurant.ts`.
 */
export const useReservationsStore = defineStore('reservations', () => {
  const settings = ref<ReservationSettings | null>(null);
  const date = ref(todayLocal());
  const reservations = ref<Reservation[]>([]);
  const availability = ref<DayAvailability | null>(null);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const active = computed(() => reservations.value.filter((r) => ACTIVE_RESERVATION_STATUSES.includes(r.status)));
  /** Personas esperadas ese día (solo reservas que siguen en pie). */
  const expectedGuests = computed(() => active.value.reduce((sum, r) => sum + r.partySize, 0));

  async function run<T>(fn: () => Promise<T>, isWrite = false): Promise<T> {
    if (isWrite) saving.value = true;
    else loading.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      if (isWrite) saving.value = false;
      else loading.value = false;
    }
  }

  async function fetchSettings(establishmentId: string): Promise<void> {
    settings.value = await run(() => reservationsApi.getSettings(establishmentId));
  }

  async function saveSettings(establishmentId: string, patch: ReservationSettingsInput): Promise<void> {
    settings.value = await run(() => reservationsApi.saveSettings(establishmentId, patch), true);
  }

  async function fetchDay(establishmentId: string, day = date.value): Promise<void> {
    date.value = day;
    reservations.value = await run(() => reservationsApi.list(establishmentId, { date: day }));
  }

  async function fetchAvailability(establishmentId: string, day: string, partySize: number): Promise<void> {
    availability.value = await run(() => reservationsApi.availability(establishmentId, day, partySize));
  }

  async function create(establishmentId: string, body: StaffReservationInput): Promise<Reservation> {
    const created = await run(() => reservationsApi.create(establishmentId, body), true);
    // Se recarga el día mostrado: la nueva reserva puede ser de otra fecha y entonces no debe aparecer.
    await fetchDay(establishmentId, date.value);
    return created;
  }

  function replace(updated: Reservation): void {
    reservations.value = reservations.value.map((r) => (r.id === updated.id ? updated : r));
  }

  async function changeStatus(id: string, status: ReservationStatus): Promise<Reservation> {
    const updated = await run(() => reservationsApi.changeStatus(id, status), true);
    replace(updated);
    return updated;
  }

  async function cancel(id: string, reason?: string | null): Promise<Reservation> {
    const updated = await run(() => reservationsApi.cancel(id, reason), true);
    replace(updated);
    return updated;
  }

  return {
    settings,
    date,
    reservations,
    availability,
    loading,
    saving,
    error,
    active,
    expectedGuests,
    fetchSettings,
    saveSettings,
    fetchDay,
    fetchAvailability,
    create,
    changeStatus,
    cancel,
  };
});

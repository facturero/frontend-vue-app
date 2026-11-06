import { http } from '@/utils/http';
import type {
  DayAvailability,
  Reservation,
  ReservationSettings,
  ReservationSettingsInput,
  ReservationStatus,
  StaffReservationInput,
} from '@/types/restaurant';

/**
 * Reservas del restaurante (lado del personal). Misma base que el resto del plugin: `/restaurant/…` por el gateway, que aquí
 * exige el módulo `restaurant.reservations` y los permisos `reservation:*`. La página pública del cliente es otro sitio
 * (`reservas-web`) y habla con `/public/…`; no pasa por esta API.
 */
export const reservationsApi = {
  getSettings: (establishmentId: string) =>
    http.get<ReservationSettings>(`/restaurant/establishments/${establishmentId}/reservation-settings`).then((r) => r.data),

  /** Parcial: solo cambia lo que se envía. 409 `SLUG_TAKEN` si el enlace ya lo usa otro restaurante. */
  saveSettings: (establishmentId: string, body: ReservationSettingsInput) =>
    http.put<ReservationSettings>(`/restaurant/establishments/${establishmentId}/reservation-settings`, body).then((r) => r.data),

  /** Reservas del día local `date` (y de los `days - 1` siguientes). */
  list: (establishmentId: string, params: { date: string; days?: number; status?: ReservationStatus[] }) =>
    http
      .get<Reservation[]>(`/restaurant/establishments/${establishmentId}/reservations`, {
        params: { date: params.date, days: params.days, status: params.status?.join(',') || undefined },
      })
      .then((r) => r.data),

  /** Horas del día para un grupo, sin el tope de días ni la antelación mínima de la página pública. */
  availability: (establishmentId: string, date: string, partySize: number) =>
    http
      .get<DayAvailability>(`/restaurant/establishments/${establishmentId}/availability`, { params: { date, partySize } })
      .then((r) => r.data),

  create: (establishmentId: string, body: StaffReservationInput) =>
    http.post<Reservation>(`/restaurant/establishments/${establishmentId}/reservations`, body).then((r) => r.data),

  changeStatus: (id: string, status: ReservationStatus) =>
    http.patch<Reservation>(`/restaurant/reservations/${id}/status`, { status }).then((r) => r.data),

  cancel: (id: string, reason?: string | null) =>
    http.post<Reservation>(`/restaurant/reservations/${id}/cancel`, { reason: reason || null }).then((r) => r.data),
};

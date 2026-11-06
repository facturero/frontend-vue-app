import type { ReservationStatus } from '@/types/restaurant';

/** Dónde vive el sitio público de reservas. Se puede cambiar por entorno (`VITE_RESERVATIONS_URL`) para probar en local. */
export function reservationsBaseUrl(): string {
  const configured = import.meta.env.VITE_RESERVATIONS_URL;
  return (configured || 'https://reservas.noahsolution.com').replace(/\/+$/, '');
}

/** Enlace público de un restaurante, o `null` si todavía no eligió su dirección. */
export function publicReservationUrl(slug: string | null | undefined): string | null {
  return slug ? `${reservationsBaseUrl()}/${slug}` : null;
}

/** Sugiere una dirección a partir del nombre («La Esquina Ñandú» → «la-esquina-nandu»). Solo sugiere: el dueño la confirma. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Color de la píldora de estado: solo tokens del tema (`lightsuccess`…), nunca hexadecimales. */
export function reservationStatusColor(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'lightinfo';
    case 'seated':
      return 'lightsuccess';
    case 'pending':
    case 'no_show':
      return 'lightwarning';
    case 'cancelled':
      return 'lighterror';
    case 'completed':
    default:
      return 'lightsecondary';
  }
}

/** Qué acciones del personal admite una reserva según su estado (misma tabla de transiciones que el servidor). */
export function reservationActions(status: ReservationStatus): { seat: boolean; complete: boolean; noShow: boolean; cancel: boolean } {
  return {
    seat: status === 'confirmed',
    complete: status === 'seated',
    noShow: status === 'confirmed',
    cancel: status === 'pending' || status === 'confirmed',
  };
}

/** Antelación mínima que se ofrece al dueño: minutos y su texto en el idioma activo se resuelve con `restaurant.reservations.notice.<n>`. */
export const NOTICE_PRESETS = [0, 30, 60, 120, 240, 720, 1440, 2880] as const;

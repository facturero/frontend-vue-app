import { describe, expect, it } from 'vitest';
import { NOTICE_PRESETS, publicReservationUrl, reservationActions, reservationStatusColor, slugify } from './reservations';
import { shiftDate } from '@/stores/reservations';
import type { ReservationStatus } from '@/types/restaurant';

describe('slugify', () => {
  it('convierte un nombre en una dirección sin acentos ni símbolos', () => {
    expect(slugify('La Esquina')).toBe('la-esquina');
    expect(slugify('  Café Ñandú & Más!  ')).toBe('cafe-nandu-mas');
    expect(slugify('Sabor — Guayaquil 2')).toBe('sabor-guayaquil-2');
  });

  it('no deja guiones al borde ni pasa de 60 caracteres', () => {
    expect(slugify('---hola---')).toBe('hola');
    const largo = slugify('a'.repeat(100));
    expect(largo.length).toBe(60);
    expect(slugify(`${'palabra '.repeat(12)}fin`).endsWith('-')).toBe(false);
  });

  it('un nombre sin letras ni números da vacío (el dueño tendrá que escribirla)', () => {
    expect(slugify('¡¡¡')).toBe('');
  });
});

describe('publicReservationUrl', () => {
  it('sin dirección no hay enlace', () => {
    expect(publicReservationUrl(null)).toBeNull();
    expect(publicReservationUrl('')).toBeNull();
  });

  it('arma el enlace con el sitio público de reservas', () => {
    expect(publicReservationUrl('la-esquina')).toMatch(/^https?:\/\/[^/]+\/la-esquina$/);
  });
});

describe('acciones por estado', () => {
  const all: ReservationStatus[] = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

  it('solo una confirmada se puede sentar o marcar como no presentada', () => {
    expect(all.filter((s) => reservationActions(s).seat)).toEqual(['confirmed']);
    expect(all.filter((s) => reservationActions(s).noShow)).toEqual(['confirmed']);
  });

  it('solo una sentada se puede terminar', () => {
    expect(all.filter((s) => reservationActions(s).complete)).toEqual(['seated']);
  });

  it('se cancela mientras no se ha sentado ni cerrado', () => {
    expect(all.filter((s) => reservationActions(s).cancel)).toEqual(['pending', 'confirmed']);
  });

  it('cada estado tiene un color del tema (token, no hexadecimal)', () => {
    for (const status of all) expect(reservationStatusColor(status)).toMatch(/^light[a-z]+$/);
  });
});

describe('fechas', () => {
  it('suma y resta días sin depender de la zona del navegador', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('las antelaciones que se ofrecen están ordenadas y empiezan sin antelación', () => {
    expect(NOTICE_PRESETS[0]).toBe(0);
    expect([...NOTICE_PRESETS]).toEqual([...NOTICE_PRESETS].sort((a, b) => a - b));
  });
});

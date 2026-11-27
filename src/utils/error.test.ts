import { describe, expect, it } from 'vitest';
import { extractError } from './error';

const axiosError = (data: unknown) => ({ message: 'Request failed with status code 422', response: { data } });

describe('extractError', () => {
  it('un error de validación dice el motivo, no solo «La petición no es válida.»', () => {
    // Lo vio un cliente al poner un título de tarea de más de 500 caracteres.
    expect(
      extractError(axiosError({ code: 'VALIDATION_ERROR', message: 'La petición no es válida.', details: [{ field: 'title', message: 'El título admite como máximo 500 caracteres.' }] })),
    ).toBe('La petición no es válida. El título admite como máximo 500 caracteres.');
  });

  it('no repite motivos iguales', () => {
    const details = [{ field: 'a', message: 'Obligatorio.' }, { field: 'b', message: 'Obligatorio.' }];
    expect(extractError(axiosError({ message: 'No válido.', details }))).toBe('No válido. Obligatorio.');
  });

  it('sin detalles, el mensaje tal cual; y los casos de antes siguen igual', () => {
    expect(extractError(axiosError({ message: 'No encontrado.' }))).toBe('No encontrado.');
    expect(extractError(axiosError({ message: 'X', details: [] }))).toBe('X');
    expect(extractError(axiosError({ error: { message: 'Anidado.' } }))).toBe('Anidado.');
    expect(extractError(new Error('red'))).toBe('red');
  });
});

import { describe, expect, it } from 'vitest';
import { formatElapsed, formatMinutes, hoursDecimal, parseDuration } from './duration';

describe('duraciones', () => {
  it('formatea minutos como se dicen', () => {
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(480)).toBe('8 h');
    expect(formatMinutes(0)).toBe('0 h');
    expect(hoursDecimal(90, 'es')).toBe('1,5');
    expect(formatElapsed(425_000)).toBe('0:07:05');
  });

  it('un número solo son horas; también h:mm, minutos y «1h 30m»', () => {
    expect(parseDuration('2')).toBe(120);
    expect(parseDuration('1,5')).toBe(90);
    expect(parseDuration('0.25')).toBe(15);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('90m')).toBe(90);
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('2h')).toBe(120);
    expect(parseDuration('1h 30m')).toBe(90);
    expect(parseDuration('1 h 30 min')).toBe(90);
    expect(parseDuration('3 horas')).toBe(180);
  });

  it('lo que no se entiende, o cero, es null', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('mucho')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('-2')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
  });
});

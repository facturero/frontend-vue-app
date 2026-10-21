import { describe, expect, it } from 'vitest';
import { reportLang, validateReminderSettings } from '@/utils/treasury';

describe('validateReminderSettings', () => {
  it('acepta los valores por defecto y los extremos', () => {
    expect(validateReminderSettings({ firstAfterDays: '3', repeatEveryDays: '7' }).input).toEqual({ firstAfterDays: 3, repeatEveryDays: 7 });
    expect(validateReminderSettings({ firstAfterDays: '1', repeatEveryDays: '60' }).input).toEqual({ firstAfterDays: 1, repeatEveryDays: 60 });
    expect(validateReminderSettings({ firstAfterDays: '90', repeatEveryDays: '7' }).input).not.toBeNull();
  });

  it('rechaza repetir más de una vez por semana (misma regla que el servidor)', () => {
    const r = validateReminderSettings({ firstAfterDays: '3', repeatEveryDays: '6' });
    expect(r.input).toBeNull();
    expect(r.errors).toEqual({ repeatEveryDays: 'treasury.reminders.errors.repeatEveryDays' });
  });

  it('rechaza fuera de rango, vacío, decimales y texto, campo por campo', () => {
    const r = validateReminderSettings({ firstAfterDays: '0', repeatEveryDays: '61' });
    expect(Object.keys(r.errors).sort()).toEqual(['firstAfterDays', 'repeatEveryDays']);
    for (const bad of ['', ' ', '2,5', '2.5', 'tres', '-1', '91']) {
      expect(validateReminderSettings({ firstAfterDays: bad, repeatEveryDays: '7' }).errors.firstAfterDays, `«${bad}»`).toBeDefined();
    }
  });

  it('tolera espacios alrededor de un número válido', () => {
    expect(validateReminderSettings({ firstAfterDays: ' 5 ', repeatEveryDays: ' 14 ' }).input).toEqual({ firstAfterDays: 5, repeatEveryDays: 14 });
  });
});

describe('reportLang', () => {
  it('usa el idioma de la interfaz si el servidor lo conoce, y español si no', () => {
    expect(reportLang('en')).toBe('en');
    expect(reportLang('fr-CA')).toBe('fr');
    expect(reportLang('es-EC')).toBe('es');
    expect(reportLang('pt-BR')).toBe('es');
    expect(reportLang('')).toBe('es');
  });
});

import type { Page } from '@playwright/test';

/**
 * Vuetify 3.7 duplica el <label> de cada campo (label real + floating label),
 * así que page.getByLabel() resuelve 2 elementos y rompe. Este helper ubica el
 * contenedor .v-field del campo por su label visible.
 */
export function fieldByLabel(page: Page, label: string) {
  return page.locator('.v-field').filter({ has: page.getByText(label, { exact: true }) });
}

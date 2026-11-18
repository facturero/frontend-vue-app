import { http } from '@/utils/http';
import type { AppThemeConfig, AppThemeDTO, AppThemesState, ThemeRef, ThemeSettings } from '@/types/appTheme';

/** Temas de la aplicación web (organization-service). Ver docs/TEMAS.md. */
export const themesApi = {
  getState: () => http.get<AppThemesState>('/organizations/me/themes').then((r) => r.data),

  create: (body: { name: string; config: AppThemeConfig }) =>
    http.post<AppThemeDTO>('/organizations/me/themes', body).then((r) => r.data),

  update: (id: string, body: { name: string; config: AppThemeConfig }) =>
    http.put<AppThemeDTO>(`/organizations/me/themes/${id}`, body).then((r) => r.data),

  remove: (id: string) => http.delete(`/organizations/me/themes/${id}`).then(() => undefined),

  saveSettings: (body: ThemeSettings) => http.put<ThemeSettings>('/organizations/me/theme-settings', body).then((r) => r.data),

  /** `null` = volver al tema de la empresa. */
  saveMyChoice: (theme: ThemeRef | null) =>
    http.put<{ myChoice: ThemeRef | null }>('/organizations/me/theme-choice', { theme }).then((r) => r.data),
};

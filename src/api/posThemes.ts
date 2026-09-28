import { http } from '@/utils/http';
import type { EmissionPointDTO } from '@/types/organization';
import type {
  AssignPosThemeInput,
  CreatePosThemeInput,
  PosThemeDTO,
  PosThemeSummaryDTO,
  UpdatePosThemeInput,
} from '@/types/posTheme';

export const posThemeApi = {
  /** La lista no trae `config` (son ~10 KB por tema): solo lo necesario para
   * pintar la fila. El editor pide el detalle al abrir. */
  list: () =>
    http.get<PosThemeSummaryDTO[]>('/organizations/me/pos-themes').then((r) => r.data),

  get: (themeId: string) =>
    http.get<PosThemeDTO>(`/organizations/me/pos-themes/${themeId}`).then((r) => r.data),

  create: (body: CreatePosThemeInput) =>
    http.post<PosThemeDTO>('/organizations/me/pos-themes', body).then((r) => r.data),

  /** PUT completo, no PATCH: el servidor valida el config entero contra lista
   * cerrada y el POS no sabe rellenar huecos. */
  update: (themeId: string, body: UpdatePosThemeInput) =>
    http.put<PosThemeDTO>(`/organizations/me/pos-themes/${themeId}`, body).then((r) => r.data),

  remove: (themeId: string) => http.delete<void>(`/organizations/me/pos-themes/${themeId}`).then(() => undefined),

  makeDefault: (themeId: string) =>
    http.post<PosThemeDTO>(`/organizations/me/pos-themes/${themeId}/make-default`).then((r) => r.data),

  /** `themeId: null` quita el override del punto: vuelve al default de la
   * organización. Es un PUT y no un DELETE porque el destino —el default— se
   * decide en el servidor, no en el cliente. */
  assignToPoint: (establishmentId: string, pointId: string, body: AssignPosThemeInput) =>
    http
      .put<EmissionPointDTO>(
        `/establishments/${establishmentId}/billing-points/${pointId}/theme`,
        body,
      )
      .then((r) => r.data),
};

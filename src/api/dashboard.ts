import { http } from '@/utils/http';

/**
 * Un widget colocado en el tablero de Inicio. `i` identifica la instancia (un mismo widget podría estar dos veces con distinta
 * configuración), `widget` es su código en `widgets/registry.ts`, y `x/y/w/h` su lugar en la rejilla de 12 columnas.
 */
export interface DashboardItem {
  i: string;
  widget: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, string | number | boolean>;
}

/**
 * El tablero de cada persona, guardado en auth-service por usuario y organización (lo ve igual en cualquier equipo). El servidor
 * solo valida forma y límites; qué widgets existen lo sabe el frontend.
 */
export const dashboardApi = {
  get: () => http.get<{ layout: DashboardItem[] | null }>('/users/me/dashboard').then((r) => r.data.layout),
  save: (layout: DashboardItem[]) => http.put<{ layout: DashboardItem[] }>('/users/me/dashboard', { layout }).then((r) => r.data.layout),
};

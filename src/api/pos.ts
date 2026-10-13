import { http } from '@/utils/http';
import type { FromPosBody } from '@/types/pos';
import type { InvoiceDetail } from '@/types/invoices';

/** El tema YA resuelto para un punto de emisión (override → predeterminado de la organización → integrado, que llega con `config: null`). */
export interface ResolvedPosTheme {
  source: 'point' | 'default' | 'builtin';
  themeId: string | null;
  name: string | null;
  version: number;
  config: unknown;
}

export const posApi = {
  /** El mismo endpoint que usa la caja de escritorio, así la caja web se ve con el tema de la organización. */
  theme: (establishmentId: string, emissionPointId: string) =>
    http.get<ResolvedPosTheme>(`/establishments/${establishmentId}/billing-points/${emissionPointId}/theme`).then((r) => r.data),

  /**
   * Una venta ya cobrada que billing convierte en factura EMITIDA en una sola transacción. Es idempotente por
   * (terminalId, posSaleId): repetirla con el mismo par devuelve la misma factura, no crea otra.
   */
  fromPos: (body: FromPosBody) => http.post<InvoiceDetail>('/invoices/from-pos', body).then((r) => r.data),
};

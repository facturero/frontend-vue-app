import { http } from '@/utils/http';
import type { FromPosBody } from '@/types/pos';
import type { InvoiceDetail } from '@/types/invoices';

export const posApi = {
  /**
   * Una venta ya cobrada que billing convierte en factura EMITIDA en una sola transacción. Es idempotente por
   * (terminalId, posSaleId): repetirla con el mismo par devuelve la misma factura, no crea otra.
   */
  fromPos: (body: FromPosBody) => http.post<InvoiceDetail>('/invoices/from-pos', body).then((r) => r.data),
};

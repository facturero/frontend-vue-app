// Bitácora de auditoría (audit-log-service). Solo lectura: la única escritura
// entra por RabbitMQ, así que aquí no hay tipos de input más allá de los
// filtros del listado.

export interface AuditLogEntry {
  id: string;
  /** Routing key completa del evento: `billing.invoice.issued`. */
  event: string;
  /** Penúltimo y último segmento de la routing key, ya derivados por el backend. */
  resource: string;
  action: string;
  organizationId: string | null;
  /** Quién EJECUTÓ la acción. null = sistema, o un evento cuyo emisor aún no
   *  propaga el actor. No confundir con `targetId`. */
  userId: string | null;
  userEmail: string | null;
  /** Sobre qué se actuó: la factura, el cliente, el usuario desactivado... */
  targetId: string | null;
  ip: string | null;
  requestId: string | null;
  occurredAt: string;
  /** Resumen en inglés que arma el backend (`invoice issued`). Se usa solo
   *  como respaldo cuando el evento no tiene traducción propia. */
  summary: string;
}

export interface AuditLogDetail extends AuditLogEntry {
  /** Subconjunto del evento, ya redactado por el servidor: los campos con
   *  pinta de secreto llegan como `[redacted]`, y si el original era enorme
   *  viene `_truncated: true`. */
  payload: Record<string, unknown> | null;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditLogListParams {
  /** Routing key exacta, o prefijo si acaba en punto (`billing.`). */
  event?: string;
  userId?: string;
  targetId?: string;
  from?: string;
  to?: string;
  search?: string;
  /** Incluye los eventos sin organización (catálogo global de la plataforma). */
  includePlatform?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

export interface AuditSummaryRow {
  day: string;
  group: string;
  count: number;
}

export interface AuditSummary {
  byEvent: AuditSummaryRow[];
  byUser: AuditSummaryRow[];
}

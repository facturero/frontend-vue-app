export type AnnexType = 'ats' | 'f103' | 'f104';
export type FindingSeverity = 'error' | 'warning';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  code: string;
  message: string;
  documentId: string | null;
}

/** Cifras principales de una versión; cambian según el anexo. Los importes terminan en `Cents`. */
export type RunSummaryFigures = Record<string, number>;

export interface RunSummary {
  id: string;
  annex: AnnexType;
  period: string;
  version: number;
  contentHash: string;
  generatedBy: string;
  generatedAt: string;
  summary: RunSummaryFigures;
}

// ── Contenido de cada anexo (estructura propia del servicio; los importes en centavos) ──

export interface ConceptTotal {
  baseCents: number;
  valorRetenidoCents: number;
  porcentajes: number[];
  retenciones: number;
  casillero: null;
}

export interface F103Content {
  periodo: string;
  totalesPorConcepto: Record<string, ConceptTotal>;
  retencionesIvaEIsdNoIncluidasCents: number;
}

export interface TarifaTotal {
  ratePercent: number;
  baseCents: number;
  ivaCents: number;
}

export interface F104Content {
  periodo: string;
  ventas: { porTarifa: Record<string, TarifaTotal>; ivaGeneradoNetoCents: number };
  compras: { porTarifa: Record<string, TarifaTotal>; ivaCents: number };
  camposManuales: { factorProporcionalidadBps: number; creditoAnteriorCents: number; ivaRetenidoSufridoCents: number; ajustesCents: number };
  camposManualesPendientes: string[];
  liquidacion: {
    ivaGeneradoCents: number;
    creditoAplicableCents: number;
    creditoAnteriorCents: number;
    ivaRetenidoSufridoCents: number;
    ajustesCents: number;
    saldoCents: number;
    resultado: 'a_pagar' | 'a_favor' | 'cero';
  };
  ivaRetenidoPracticadoCents: number;
}

export interface AtsCompra {
  documentId: string;
  fechaEmision: string;
  tipoComprobante: string;
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  autorizacion: string | null;
  sustento: string | null;
  identificacion: string | null;
  proveedor: string | null;
  base0Cents: number;
  baseGravadaCents: number;
  ivaCents: number;
  totalCents: number;
  retenciones: { documentId: string; numero: string }[];
}

export interface AtsVentaGrupo {
  tipoIdentificacion: string | null;
  identificacion: string | null;
  cliente: string | null;
  tipoComprobante: string;
  comprobantes: number;
  base0Cents: number;
  baseGravadaCents: number;
  ivaCents: number;
}

export interface AtsAnulado {
  documentId: string;
  origen: string;
  tipoComprobante: string;
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  fechaEmision: string;
  fechaAnulacion: string | null;
}

export interface AtsRetencionSinCompra {
  documentId: string;
  numero: string;
  fechaEmision: string;
  proveedor: string | null;
  identificacion: string | null;
  sustento: string | null;
}

export interface AtsContent {
  periodo: string;
  informante: { ruc: string; legalName: string } | null;
  compras: AtsCompra[];
  ventasPorCliente: AtsVentaGrupo[];
  anulados: AtsAnulado[];
  retencionesSinCompra: AtsRetencionSinCompra[];
}

export type AnnexContent = AtsContent | F103Content | F104Content;

export interface RunFull extends RunSummary {
  content: AnnexContent;
}

export interface RunChange {
  key: string;
  previous: number;
  current: number;
  delta: number;
}

export interface RunDetail {
  run: RunFull;
  findings: Finding[];
  previous: { id: string; version: number; generatedAt: string } | null;
  changes: RunChange[];
  findingCounts: { errors: number; warnings: number; previousErrors: number | null; previousWarnings: number | null };
}

export interface GenerateResult {
  created: boolean;
  run: RunFull;
  findings: Finding[];
}

export interface ReconciliationItem {
  code: string;
  label: string;
  role: string;
  annexCents: number;
  accountingCents: number;
  differenceCents: number;
}

export interface Reconciliation {
  annex: AnnexType;
  period: string;
  runId: string;
  version: number;
  available: boolean;
  status: 'ok' | 'mismatch' | 'unavailable';
  items: ReconciliationItem[];
}

export interface ManualInputs {
  fields: string[];
  items: { fieldCode: string; amountCents: number; setBy: string; setAt: string }[];
}

export interface ReportDocumentRow {
  id: string;
  sourceService: 'billing' | 'purchasing' | 'fiscal';
  direction: 'sale' | 'purchase' | 'withholding_issued';
  documentTypeCode: string;
  number: string;
  issueDate: string;
  partyIdentification: string | null;
  partyName: string | null;
  totalCents: number;
  status: 'active' | 'voided';
}

export interface RunFilters {
  annex?: AnnexType;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface DocumentFilters {
  id?: string;
  direction?: ReportDocumentRow['direction'];
  status?: ReportDocumentRow['status'];
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Formas de pago de la Tabla 24 del SRI que ofrece la caja web. `01` es efectivo (sin utilización del sistema financiero). */
export type PaymentMethodCode = '01' | '16' | '19' | '20';

export interface PaymentMethodOption {
  code: PaymentMethodCode;
  /** Clave i18n del rótulo. */
  labelKey: string;
  icon: string;
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { code: '01', labelKey: 'pos.payment.cash', icon: 'mdi-cash' },
  { code: '16', labelKey: 'pos.payment.debit', icon: 'mdi-credit-card-outline' },
  { code: '19', labelKey: 'pos.payment.credit', icon: 'mdi-credit-card-check-outline' },
  { code: '20', labelKey: 'pos.payment.transfer', icon: 'mdi-bank-transfer' },
];

/** Una línea del carrito. Los importes van en centavos; las tarifas, en porcentaje (15 = 15 %). */
export interface PosLine {
  productId: string;
  name: string;
  sku: string | null;
  unitPriceCents: number;
  priceIncludesTax: boolean;
  ratesPercent: number[];
  quantity: number;
  discountCents: number;
}

/** Cliente de la venta. Sin cliente se factura a CONSUMIDOR FINAL (lo resuelve billing-service). */
export interface PosCustomer {
  id: string;
  name: string;
  identification: string | null;
}

/** Cuerpo de `POST /invoices/from-pos` (billing-service). */
export interface FromPosBody {
  terminalId: string;
  posSaleId: string;
  establishmentId: string;
  emissionPointId: string;
  customerId?: string | null;
  paymentMethodCode: PaymentMethodCode;
  /** El total que la caja le dijo al cliente: billing lo compara con el suyo y anota la diferencia. */
  posTotalCents: number;
  lines: Array<{
    productId: string;
    description: string;
    quantity: number;
    unitPrice: string;
    discountCents: number;
  }>;
}

/** Lo último que se facturó, para enseñar el comprobante mientras la persona decide la siguiente venta. */
export interface PosSaleResult {
  invoiceId: string;
  number: string | null;
  /** Total de la factura según el servidor. */
  totalCents: number;
  /** Total que la caja había calculado; si difiere, hay que avisar. */
  expectedCents: number;
  paymentMethodCode: PaymentMethodCode;
  receivedCents: number | null;
  changeCents: number;
}

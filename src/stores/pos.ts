import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { posApi } from '@/api/pos';
import { productApi } from '@/api/products';
import { useAuthStore } from '@/stores/auth';
import { extractError } from '@/utils/error';
import { saleTotals } from '@/utils/pos-totals';
import type { FromPosBody, PaymentMethodCode, PosCustomer, PosLine, PosSaleResult } from '@/types/pos';
import type { ProductSummary } from '@/types/products';

/**
 * Caja web: el carrito, el cliente y la forma de pago de la venta en curso. Todo lo demás (catálogo, clientes, facturación) es
 * la API del CRM con la sesión de quien vende; no hay base local ni cola: si no hay internet, la venta no se hace y se avisa.
 *
 * Dos ideas sostienen el diseño:
 *  - **Idempotencia.** Cada venta tiene su `posSaleId`, que se crea al agregar el primer producto y NO cambia hasta que se
 *    factura con éxito. Si la respuesta se pierde (se cae la red justo después de que billing guardó la factura), reintentar con
 *    el mismo id devuelve la misma factura en vez de crear otra.
 *  - **El borrador sobrevive a recargar la página**, guardado en el navegador por usuario y organización: recargar a mitad de una
 *    venta no pierde el carrito ni el id, y otra persona que use el mismo equipo no ve el de la anterior.
 */

const TERMINAL_KEY = 'pos:terminal-id';

interface Draft {
  posSaleId: string | null;
  lines: PosLine[];
  customer: PosCustomer | null;
  paymentMethodCode: PaymentMethodCode;
}

interface SelectedPoint {
  establishmentId: string;
  emissionPointId: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento (modo privado, bloqueado): la caja funciona igual, solo no recuerda
  }
}

const newId = (): string => crypto.randomUUID();

/** Por qué no se pudo agregar un producto (la vista lo traduce). */
export type AddProductFailure = 'no_price' | 'taxes' | 'error';

export const usePosStore = defineStore('pos', () => {
  const auth = useAuthStore();

  const terminalId = ref('');
  const point = ref<SelectedPoint | null>(null);

  const lines = ref<PosLine[]>([]);
  const customer = ref<PosCustomer | null>(null);
  const paymentMethodCode = ref<PaymentMethodCode>('01');
  const posSaleId = ref<string | null>(null);

  const submitting = ref(false);
  const error = ref<string | null>(null);
  /** El fallo fue de conexión (la petición no llegó a recibir respuesta): la vista lo dice con sus palabras en vez del texto crudo. */
  const errorIsNetwork = ref(false);
  const lastSale = ref<PosSaleResult | null>(null);

  const taxRates = new Map<string, number>();
  const productRates = new Map<string, number[]>();

  /** Identifica a quien vende: el borrador y el punto elegido son de esta persona en esta organización. */
  function scope(): string {
    const user = auth.user as { id?: string; orgId?: string | null } | null;
    return `${user?.orgId ?? 'sin-org'}:${user?.id ?? 'sin-usuario'}`;
  }

  function persist(): void {
    const key = `pos:draft:${scope()}`;
    if (lines.value.length === 0) write(key, null);
    else write(key, { posSaleId: posSaleId.value, lines: lines.value, customer: customer.value, paymentMethodCode: paymentMethodCode.value } satisfies Draft);
  }

  /** Carga el identificador del equipo, el punto de emisión elegido y el borrador pendiente. Se llama con la sesión ya cargada. */
  function init(): void {
    let id = read<string>(TERMINAL_KEY);
    if (!id) {
      // Identifica este navegador: junto al id de la venta es la clave de idempotencia en billing.
      id = `web-${newId().slice(0, 8)}`;
      write(TERMINAL_KEY, id);
    }
    terminalId.value = id;
    point.value = read<SelectedPoint>(`pos:point:${scope()}`);
    const draft = read<Draft>(`pos:draft:${scope()}`);
    lines.value = draft?.lines ?? [];
    customer.value = draft?.customer ?? null;
    paymentMethodCode.value = draft?.paymentMethodCode ?? '01';
    posSaleId.value = draft?.posSaleId ?? null;
    error.value = null;
    lastSale.value = null;
  }

  function selectPoint(establishmentId: string, emissionPointId: string): void {
    point.value = { establishmentId, emissionPointId };
    write(`pos:point:${scope()}`, point.value);
  }

  // ── Totales ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const totals = computed(() => saleTotals(lines.value));
  const itemCount = computed(() => lines.value.reduce((sum, l) => sum + l.quantity, 0));
  const canCharge = computed(() => lines.value.length > 0 && !!point.value && totals.value.totalCents > 0 && !submitting.value);

  // ── Carrito ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  async function ensureTaxRates(): Promise<void> {
    if (taxRates.size > 0) return;
    for (const rate of await productApi.listTaxRates()) taxRates.set(rate.id, Number(rate.percentage));
  }

  /** Las tarifas de los impuestos del producto, o null si alguna no se pudo resolver (el total saldría mal). */
  async function ratesFor(productId: string): Promise<number[] | null> {
    const cached = productRates.get(productId);
    if (cached) return cached;
    await ensureTaxRates();
    const detail = await productApi.getById(productId);
    const rates = detail.taxes.map((t) => taxRates.get(t.taxRateId));
    if (rates.some((r) => r === undefined || Number.isNaN(r))) return null;
    productRates.set(productId, rates as number[]);
    return rates as number[];
  }

  async function addProduct(product: ProductSummary): Promise<AddProductFailure | null> {
    error.value = null;
    const existing = lines.value.find((l) => l.productId === product.id);
    if (existing) {
      setQuantity(product.id, existing.quantity + 1);
      return null;
    }
    // billing rechaza una línea sin precio: mejor decirlo aquí que al cobrar.
    if (product.priceCents <= 0) return 'no_price';
    let rates: number[] | null;
    try {
      rates = await ratesFor(product.id);
    } catch {
      return 'error';
    }
    if (!rates) return 'taxes';
    // El producto pudo agregarse mientras esperábamos las tarifas (doble toque o lector que repite): se suma, no se duplica.
    const again = lines.value.find((l) => l.productId === product.id);
    if (again) {
      setQuantity(product.id, again.quantity + 1);
      return null;
    }
    if (!posSaleId.value) posSaleId.value = newId();
    lines.value.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPriceCents: product.priceCents,
      priceIncludesTax: product.priceIncludesTax,
      ratesPercent: rates,
      quantity: 1,
      discountCents: 0,
    });
    persist();
    return null;
  }

  function setQuantity(productId: string, quantity: number): void {
    const line = lines.value.find((l) => l.productId === productId);
    if (!line) return;
    if (!(quantity > 0)) {
      removeLine(productId);
      return;
    }
    line.quantity = Math.round(quantity * 1000) / 1000;
    // Si baja la cantidad, el descuento no puede superar lo que ahora vale la línea (billing lo rechazaría).
    line.discountCents = Math.min(line.discountCents, Math.round(line.quantity * line.unitPriceCents));
    persist();
  }

  function setDiscount(productId: string, discountCents: number): void {
    const line = lines.value.find((l) => l.productId === productId);
    if (!line) return;
    const max = Math.round(line.quantity * line.unitPriceCents);
    line.discountCents = Math.min(Math.max(0, Math.round(discountCents)), max);
    persist();
  }

  function removeLine(productId: string): void {
    lines.value = lines.value.filter((l) => l.productId !== productId);
    if (lines.value.length === 0) {
      posSaleId.value = null;
      customer.value = null;
    }
    persist();
  }

  function setCustomer(value: PosCustomer | null): void {
    customer.value = value;
    persist();
  }

  function setPaymentMethod(code: PaymentMethodCode): void {
    paymentMethodCode.value = code;
    persist();
  }

  /** Empieza una venta nueva: carrito vacío y un id de venta nuevo en cuanto se agregue el primer producto. */
  function clearSale(): void {
    lines.value = [];
    customer.value = null;
    paymentMethodCode.value = '01';
    posSaleId.value = null;
    error.value = null;
    persist();
  }

  function dismissLastSale(): void {
    lastSale.value = null;
  }

  // ── Cobro ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Factura la venta. Si falla, el carrito y el `posSaleId` se quedan como están: reintentar es seguro. `receivedCents` solo
   * importa en efectivo (para calcular el vuelto); null = pagó justo.
   */
  async function submit(receivedCents: number | null = null): Promise<PosSaleResult> {
    if (submitting.value) throw new Error('Ya se está facturando esta venta');
    if (!canCharge.value || !point.value) throw new Error('La venta no se puede cobrar');
    submitting.value = true;
    error.value = null;
    errorIsNetwork.value = false;
    const expectedCents = totals.value.totalCents;
    try {
      if (!posSaleId.value) posSaleId.value = newId();
      const body: FromPosBody = {
        terminalId: terminalId.value,
        posSaleId: posSaleId.value,
        establishmentId: point.value.establishmentId,
        emissionPointId: point.value.emissionPointId,
        customerId: customer.value?.id ?? null,
        paymentMethodCode: paymentMethodCode.value,
        posTotalCents: expectedCents,
        lines: lines.value.map((l) => ({
          productId: l.productId,
          description: l.name,
          quantity: l.quantity,
          unitPrice: (l.unitPriceCents / 100).toFixed(2),
          discountCents: l.discountCents,
        })),
      };
      const invoice = await posApi.fromPos(body);
      const method = paymentMethodCode.value;
      const result: PosSaleResult = {
        invoiceId: invoice.id,
        number: invoice.number,
        totalCents: invoice.totalCents,
        expectedCents,
        paymentMethodCode: method,
        receivedCents: method === '01' ? receivedCents : null,
        changeCents: method === '01' && receivedCents !== null ? Math.max(0, receivedCents - invoice.totalCents) : 0,
      };
      lastSale.value = result;
      clearSale();
      return result;
    } catch (e) {
      error.value = extractError(e);
      errorIsNetwork.value = !(e as { response?: unknown })?.response;
      throw e;
    } finally {
      submitting.value = false;
    }
  }

  return {
    terminalId, point, lines, customer, paymentMethodCode, posSaleId, submitting, error, errorIsNetwork, lastSale,
    totals, itemCount, canCharge,
    init, selectPoint, addProduct, setQuantity, setDiscount, removeLine, setCustomer, setPaymentMethod, clearSale, dismissLastSale, submit,
  };
});

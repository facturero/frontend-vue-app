/**
 * Lo que sale del navegador hacia la telemetría pasa por aquí. Una petición fallida lleva su cuerpo para poder reproducir el
 * error, pero ese cuerpo trae contraseñas, tokens y datos de clientes: se enmascara ANTES de salir, no en el servidor.
 *
 *  - Secretos (contraseñas, tokens, certificados .p12, claves): se reemplazan por `[REDACTED]`. Nunca hacen falta para reproducir.
 *  - Datos personales (identificación, correo, teléfono, nombres, direcciones): se conserva la FORMA (largo, dígitos, signos) y
 *    se pierde el valor. «0912345678» queda «9999999999»: basta para reproducir un error de validación sin saber de quién es.
 *  - El resto (cantidades, importes, ids, códigos) se deja tal cual: es lo que hace falta para replicar el caso.
 */

const SECRET_KEY = /pass(word)?|clave|secret|token|authorization|api[-_]?key|p12|certificate|certificado|private|cvv|card|tarjeta|\bpin\b/i;
const PERSONAL_KEY = /identification|identificacion|\bruc\b|cedula|cédula|e-?mail|correo|phone|telefono|teléfono|mobile|celular|address|direccion|dirección|\bname\b|nombre|razon|businessname|legalname|tradename/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_ARRAY = 20;
const MAX_STRING = 200;
/** Tope del cuerpo ya serializado: una factura con muchas líneas no debe inflar cada reporte. */
export const MAX_BODY_CHARS = 4000;

/** «Juan Pérez, 0912345678» → «Xxxx Xxxxx, 9999999999»: mismo largo y mismos signos, sin el valor. */
export function maskShape(value: string): string {
  // Unicode: «Pérez» no debe conservar la «é». Cualquier letra (con o sin tilde, ñ incluida) pasa a x / X.
  return value.replace(/\d/g, '9').replace(/\p{L}/gu, (c) => (c !== c.toLowerCase() ? 'X' : 'x'));
}

function mask(value: unknown, key: string, depth: number): unknown {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (PERSONAL_KEY.test(key)) return maskShape(value).slice(0, MAX_STRING);
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING}]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return PERSONAL_KEY.test(key) ? maskShape(String(value)) : value;
  if (typeof value !== 'object') return String(value);
  if (isBinary(value)) return '[binary]';
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => mask(v, key, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `…[+${value.length - MAX_ARRAY} más]`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mask(v, k, depth + 1);
  return out;
}

function isBinary(value: object): boolean {
  return (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value)))
  );
}

/**
 * Cuerpo de una petición o respuesta listo para adjuntar a un span: enmascarado y acotado. Acepta lo que entrega axios
 * (objeto ya parseado, o texto JSON). Devuelve `undefined` si no hay nada que adjuntar.
 */
export function maskBody(body: unknown): string | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  let value: unknown = body;
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body);
    } catch {
      // Texto que no es JSON (p. ej. una página de error HTML): se recorta y no se interpreta.
      return body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…[recortado]` : body;
    }
  }
  const text = JSON.stringify(mask(value, '', 0));
  if (text === undefined) return undefined;
  return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…[recortado]` : text;
}

/**
 * `/invoices/6f9619ff-…/lines?x=1` → `/invoices/:id/lines`. Sin los ids ni la consulta, todas las llamadas del mismo endpoint
 * comparten nombre de span y SigNoz puede agruparlas (con el id real habría un nombre distinto por cada factura).
 */
export function normalizePath(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  return (
    path
      .split('/')
      .map((seg) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) || /^\d+$/.test(seg) ? ':id' : seg))
      .join('/') || '/'
  );
}

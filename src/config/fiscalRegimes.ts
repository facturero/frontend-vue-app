/**
 * Registro de regímenes fiscales por país.
 *
 * La facturación electrónica cambia por país: quién autoriza, cómo se numeran
 * los documentos, si existen establecimientos y puntos de emisión, si hace
 * falta un certificado de firma. En vez de repartir `if (país === 'EC')` por
 * las vistas, cada régimen se declara aquí y la vista lee el del país de la
 * organización.
 *
 * Para dar de alta un país nuevo: añade su entrada y traduce sus claves. No
 * debería hacer falta tocar `InvoiceFormView`.
 */
export interface FiscalRegime {
  /** ISO 3166-1 alfa-2. */
  countryCode: string;
  /** Nombre mostrable del país. */
  countryName: string;
  /** Organismo que autoriza (SRI, AFIP, SAT…). Se interpola en los textos. */
  authority: string;
  /** Locale para fechas y números de los documentos fiscales. */
  locale: string;
  /** Símbolo por defecto si la factura no trae divisa. */
  currencyCode: string;
  /**
   * Identificador del tipo de documento «factura» en el catálogo del backend.
   * Es un UUID por país porque cada régimen tiene su propio catálogo.
   */
  invoiceDocumentTypeId: string;
  /** ¿El régimen usa establecimientos + puntos de emisión? (Ecuador sí). */
  usesEstablishments: boolean;
  /** ¿Hace falta un certificado de firma para autorizar? */
  requiresSigningCertificate: boolean;
}

const REGIMES: Record<string, FiscalRegime> = {
  EC: {
    countryCode: 'EC',
    countryName: 'Ecuador',
    authority: 'SRI',
    locale: 'es-EC',
    currencyCode: 'USD',
    invoiceDocumentTypeId: '024ce4f5-baf1-4d04-9a7c-189076230390',
    usesEstablishments: true,
    requiresSigningCertificate: true,
  },
};

/**
 * Régimen de reserva para organizaciones sin país configurado todavía. Permite
 * emitir de forma puramente comercial: sin autoridad, sin establecimientos y
 * sin certificado.
 */
const FALLBACK: FiscalRegime = {
  countryCode: '',
  countryName: '',
  authority: '',
  locale: 'es',
  currencyCode: 'USD',
  invoiceDocumentTypeId: '',
  usesEstablishments: false,
  requiresSigningCertificate: false,
};

/** Régimen del país indicado; el de reserva si ese país aún no está soportado. */
export function getFiscalRegime(countryCode?: string | null): FiscalRegime {
  if (!countryCode) return FALLBACK;
  return REGIMES[countryCode.toUpperCase()] ?? FALLBACK;
}

/** Países con régimen implementado, para poblar selectores. */
export function supportedCountries(): Array<{ title: string; value: string }> {
  return Object.values(REGIMES).map((r) => ({ title: r.countryName, value: r.countryCode }));
}

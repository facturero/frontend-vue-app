export type PluginBuildStatus = 'disponible' | 'en_construccion' | 'descontinuado';
export type DisplayStatus =
  | 'en_construccion'
  | 'disponible'
  | 'comprado'
  | 'desactivado'
  /** Plugin del núcleo: activo para todas las organizaciones, no se compra ni se apaga. */
  | 'incluido';
/** `included`: viene con la plataforma (núcleo y módulos base gratuitos): siempre activo, no se compra ni se apaga. */
export type ActivationSource = 'direct' | 'dependency' | 'included';
export type CustomRequestStatus = 'requested' | 'quoted' | 'created' | 'rejected';

export interface Plugin {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string | null;
  buildStatus: PluginBuildStatus;
  priceCents: number;
  currency: string;
  isPublic: boolean;
}

export interface CatalogPlugin extends Plugin {
  display_status: DisplayStatus;
  is_exclusive: boolean;
  depends_on: { code: string; name: string; autoActivate: boolean }[];
}

export interface OrganizationPlugin {
  organizationId: string;
  pluginId: string;
  pluginCode?: string;
  pluginName?: string;
  activationSource: ActivationSource;
  requiredByPluginId: string | null;
  status: 'active' | 'disabled';
  activatedAt: string;
  deactivatedAt: string | null;
  /** Baja programada: sigue activo y funcionando hasta esta fecha. */
  deactivateAt?: string | null;
  /** Dónde termina el periodo pago actual (cuando se haría efectiva una baja). Nulo si el módulo es gratis. */
  periodEndsAt?: string | null;
}

export interface QuoteRequirement {
  plugin: Plugin;
  price: number;
  already_active: boolean;
}

export interface QuoteDiscount {
  code: string;
  name: string;
  kind: 'percent' | 'fixed';
  /** Total descontado al mes, en centavos. */
  discount_cents: number;
  /** Meses que dura el descuento; null = mientras el módulo siga activo. */
  duration_months: number | null;
}

export interface Quote {
  plugin: Plugin;
  price: number;
  requires: QuoteRequirement[];
  total_monthly: number;
  /** Solo si se cotizó con un código que vale. */
  discount?: QuoteDiscount;
  /** Solo si se cotizó con un código que NO vale: el precio de lista viene igual. */
  discount_error?: { code: string; message: string };
  total_after_discount?: number;
  /** IVA en porcentaje (15 = 15 %), lo que cuesta de IVA al mes y el total mensual con IVA. */
  vat_percent?: number;
  vat_cents?: number;
  total_with_vat?: number;
  /** Prueba gratis de la organización; ausente si todavía no empezó. */
  trial?: { active: boolean; ends_at: string; days_left: number };
  /** Lo que se paga HOY con IVA: 0 mientras dure la prueba. */
  due_today?: number;
}

/** Una línea del carrito cotizado. */
export interface CartQuoteItem {
  plugin: Plugin;
  price: number;
  /** `selected`: lo que se eligió; `required`: lo que arrastra y se activará también; `already_active`: ya lo tiene. */
  kind: 'selected' | 'required' | 'already_active';
  /** Para `required`: código del módulo elegido que lo necesita. */
  required_by?: string;
}

/** La cotización de todo el carrito: lo que comparten los módulos se cuenta una sola vez. */
export interface CartQuote {
  items: CartQuoteItem[];
  /** Códigos que ya no se pueden activar (no existen, son del núcleo, aún no están disponibles). */
  invalid: { code: string; reason: 'not_found' | 'core' | 'not_available' }[];
  /** Dependencias que no se activan solas: hay que resolverlas antes. */
  missing: string[];
  total_monthly: number;
  discount?: QuoteDiscount;
  discount_error?: { code: string; message: string };
  total_after_discount?: number;
  vat_percent?: number;
  vat_cents?: number;
  total_with_vat?: number;
  trial?: { active: boolean; ends_at: string; days_left: number };
  due_today?: number;
}

export interface Subscription {
  trial: { started_at: string; ends_at: string; active: boolean; days_left: number } | null;
  vat_percent: number;
}

export interface ActivationResult {
  pluginCode: string;
  status: 'active';
  activationSource: ActivationSource;
}

export interface DeactivationResult {
  pluginCode: string;
  status: 'disabled';
}

export interface PluginCustomRequest {
  id: string;
  organizationId: string;
  description: string;
  basedOnPluginIds: string[];
  status: CustomRequestStatus;
  resultingPluginId: string | null;
  quotedPriceCents: number | null;
  rejectionReason: string | null;
}

export interface RequestCustomPluginInput {
  description: string;
  basedOnPluginCodes: string[];
}

export interface BusinessProfile {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface MyBusinessProfile {
  profile: (BusinessProfile & { status: 'selected' | 'skipped' }) | null;
  status: 'pending' | 'selected' | 'skipped';
  decidedAt: string | null;
}

export interface RecommendationRequirement {
  code: string;
  alreadyActive: boolean;
}

export interface RecommendationPlugin {
  code: string;
  name: string;
  category: string;
  buildStatus: PluginBuildStatus;
  priceCents: number;
  currency: string;
}

export type RecommendationState = 'activatable' | 'already_active' | 'coming_soon' | 'blocked';

export interface RecommendationItem {
  plugin: RecommendationPlugin;
  recommendation: 'essential' | 'suggested';
  state: RecommendationState;
  alreadyActive: boolean;
  requires: RecommendationRequirement[];
}

export interface BusinessProfileRecommendations {
  profile: { code: string; name: string };
  items: RecommendationItem[];
  totalMonthlyCents: number;
}

export type BatchActivationStatus =
  | 'activated'
  | 'already_active'
  | 'not_available'
  | 'missing_dependencies'
  | 'not_found';

export interface BatchActivationResult {
  code: string;
  result: BatchActivationStatus;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: ApiErrorDetail[];
}

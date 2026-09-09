export type PluginBuildStatus = 'disponible' | 'en_construccion' | 'descontinuado';
export type DisplayStatus =
  | 'en_construccion'
  | 'disponible'
  | 'comprado'
  | 'desactivado'
  /** Plugin del núcleo: activo para todas las organizaciones, no se compra ni se apaga. */
  | 'incluido';
export type ActivationSource = 'direct' | 'dependency';
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
}

export interface QuoteRequirement {
  plugin: Plugin;
  price: number;
  already_active: boolean;
}

export interface Quote {
  plugin: Plugin;
  price: number;
  requires: QuoteRequirement[];
  total_monthly: number;
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

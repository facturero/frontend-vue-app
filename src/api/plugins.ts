import { http } from '@/utils/http';
import type {
  ActivationResult,
  BatchActivationResult,
  BusinessProfile,
  BusinessProfileRecommendations,
  CartQuote,
  CatalogPlugin,
  DeactivationResult,
  MyBusinessProfile,
  OrganizationPlugin,
  PluginCustomRequest,
  Quote,
  RequestCustomPluginInput,
  Subscription,
} from '@/types/plugins';

const org = '/organizations/me';

export const pluginApi = {
  catalog: () =>
    http.get<CatalogPlugin[]>(`${org}/plugins/catalog`).then((r) => r.data),

  /** Prueba gratis e IVA. Para el administrador, la primera llamada arranca la prueba de la organización. */
  subscription: () =>
    http.get<Subscription>(`${org}/subscription`).then((r) => r.data),

  listMine: () =>
    http.get<OrganizationPlugin[]>(`${org}/plugins`).then((r) => r.data),

  quote: (code: string, discountCode?: string) =>
    http
      .get<Quote>(`${org}/plugins/${code}/quote`, { params: discountCode ? { discountCode } : undefined })
      .then((r) => r.data),

  activate: (code: string, discountCode?: string) =>
    http
      .post<ActivationResult[]>(`${org}/plugins/${code}/activate`, discountCode ? { discountCode } : undefined)
      .then((r) => r.data),

  /** El carrito guardado de la organización (vive en el servidor: sobrevive a recargar y a cambiar de equipo). */
  cartGet: () =>
    http.get<{ code: string; addedAt: string; addedByUserId: string | null }[]>(`${org}/plugins/cart`).then((r) => r.data),

  cartAdd: (code: string) => http.put(`${org}/plugins/cart/items/${code}`).then((r) => r.data),

  cartRemove: (code: string) => http.delete(`${org}/plugins/cart/items/${code}`).then((r) => r.data),

  cartClear: () => http.delete(`${org}/plugins/cart`).then(() => undefined),

  /** El carrito: cotiza varios módulos juntos (lo compartido se cuenta una vez; un código de descuento aplica a todo). */
  cartQuote: (codes: string[], discountCode?: string) =>
    http
      .post<CartQuote>(`${org}/plugins/cart/quote`, { codes, ...(discountCode ? { discountCode } : {}) })
      .then((r) => r.data),

  /** Activa todo el carrito de una vez: todo o nada. */
  cartActivate: (codes: string[], discountCode?: string) =>
    http
      .post<ActivationResult[]>(`${org}/plugins/cart/activate`, { codes, ...(discountCode ? { discountCode } : {}) })
      .then((r) => r.data),

  deactivate: (code: string) =>
    http.post<DeactivationResult[]>(`${org}/plugins/${code}/deactivate`).then((r) => r.data),

  cancelDeactivation: (code: string) =>
    http.post<OrganizationPlugin>(`${org}/plugins/${code}/cancel-deactivation`).then((r) => r.data),

  listRequests: () =>
    http.get<PluginCustomRequest[]>(`${org}/plugin-requests`).then((r) => r.data),

  requestCustom: (body: RequestCustomPluginInput) =>
    http.post<PluginCustomRequest>(`${org}/plugin-requests`, body).then((r) => r.data),

  businessProfiles: () =>
    http.get<BusinessProfile[]>('/business-profiles').then((r) => r.data),

  getMyBusinessProfile: () =>
    http.get<MyBusinessProfile>(`${org}/business-profile`).then((r) => r.data),

  chooseBusinessProfile: (code: string | null, source: 'onboarding' | 'settings') =>
    http.put<MyBusinessProfile>(`${org}/business-profile`, { code, source }).then((r) => r.data),

  recommendations: (code: string) =>
    http.get<BusinessProfileRecommendations>(`${org}/business-profiles/${code}/recommendations`).then((r) => r.data),

  activateBatch: (codes: string[]) =>
    http.post<BatchActivationResult[]>(`${org}/plugins/activate`, { codes }).then((r) => r.data),
};

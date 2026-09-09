import { http } from '@/utils/http';
import type {
  ActivationResult,
  BatchActivationResult,
  BusinessProfile,
  BusinessProfileRecommendations,
  CatalogPlugin,
  DeactivationResult,
  MyBusinessProfile,
  OrganizationPlugin,
  PluginCustomRequest,
  Quote,
  RequestCustomPluginInput,
} from '@/types/plugins';

const org = '/organizations/me';

export const pluginApi = {
  catalog: () =>
    http.get<CatalogPlugin[]>(`${org}/plugins/catalog`).then((r) => r.data),

  listMine: () =>
    http.get<OrganizationPlugin[]>(`${org}/plugins`).then((r) => r.data),

  quote: (code: string) =>
    http.get<Quote>(`${org}/plugins/${code}/quote`).then((r) => r.data),

  activate: (code: string) =>
    http.post<ActivationResult[]>(`${org}/plugins/${code}/activate`).then((r) => r.data),

  deactivate: (code: string) =>
    http.post<DeactivationResult[]>(`${org}/plugins/${code}/deactivate`).then((r) => r.data),

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

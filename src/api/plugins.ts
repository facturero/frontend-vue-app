import { http } from '@/utils/http';
import type {
  ActivationResult,
  CatalogPlugin,
  DeactivationResult,
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
};

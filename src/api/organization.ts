import { http } from '@/utils/http';
import type { OrganizationDTO, UpdateOrganizationInput } from '@/types/organization';

export const organizationApi = {
  getMyOrganization: () =>
    http.get<OrganizationDTO>('/organizations/me').then((r) => r.data),

  update: (body: UpdateOrganizationInput) =>
    http.patch<OrganizationDTO>('/organizations/me', body).then((r) => r.data),
};

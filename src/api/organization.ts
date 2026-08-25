import { http } from '@/utils/http';
import type {
  OrganizationDTO, UpdateOrganizationInput, UpsertOrganizationInput,
  EstablishmentDTO, CreateEstablishmentInput,
  EmissionPointDTO, CreateEmissionPointInput,
  PairingCodeDTO,
} from '@/types/organization';

export const organizationApi = {
  getMyOrganization: () =>
    http.get<OrganizationDTO>('/organizations/me').then((r) => r.data),

  update: (body: UpdateOrganizationInput) =>
    http.patch<OrganizationDTO>('/organizations/me', body).then((r) => r.data),

  upsert: (body: UpsertOrganizationInput) =>
    http.put<OrganizationDTO>('/organizations/me', body).then((r) => r.data),

  getEstablishments: () =>
    http.get<EstablishmentDTO[]>('/establishments').then((r) => r.data),

  createEstablishment: (body: CreateEstablishmentInput) =>
    http.post<EstablishmentDTO>('/establishments', body).then((r) => r.data),

  getEmissionPoints: (establishmentId: string) =>
    http.get<EmissionPointDTO[]>(`/establishments/${establishmentId}/billing-points`).then((r) => r.data),

  createEmissionPoint: (establishmentId: string, body: CreateEmissionPointInput) =>
    http.post<EmissionPointDTO>(`/establishments/${establishmentId}/billing-points`, body).then((r) => r.data),

  getPairingCode: (establishmentId: string, pointId: string) =>
    http.get<PairingCodeDTO>(`/establishments/${establishmentId}/billing-points/${pointId}/pairing-code`).then((r) => r.data),

  unlinkEmissionPoint: (establishmentId: string, pointId: string) =>
    http.post<EmissionPointDTO>(`/establishments/${establishmentId}/billing-points/${pointId}/unlink`).then((r) => r.data),
};

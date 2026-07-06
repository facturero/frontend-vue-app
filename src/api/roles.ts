import { http } from '@/utils/http';
import type { CreateRoleInput, PermissionItem, RoleSummary, UpdateRolePermissionsInput } from '@/types/roles';

export const roleApi = {
  list: () => http.get<RoleSummary[]>('/roles').then((r) => r.data),

  create: (body: CreateRoleInput) =>
    http.post<{ roleId: string }>('/roles', body).then((r) => r.data),

  updatePermissions: (roleId: string, body: UpdateRolePermissionsInput) =>
    http.patch<void>(`/roles/${roleId}/permissions`, body).then((r) => r.data),

  listPermissions: () => http.get<PermissionItem[]>('/permissions').then((r) => r.data),
};

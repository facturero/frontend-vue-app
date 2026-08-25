import { http } from '@/utils/http';
import type { EmployeeSummary, InviteEmployeeInput } from '@/types/employees';

export const employeeApi = {
  list: (establishmentId?: string) =>
    http.get<EmployeeSummary[]>(`/users${establishmentId ? `?establishmentId=${encodeURIComponent(establishmentId)}` : ''}`)
      .then((r) => r.data),

  invite: (body: InviteEmployeeInput) =>
    http.post<{ userId: string }>('/users/invite', body).then((r) => r.data),

  assignRole: (userId: string, roleIds: string[]) =>
    http.post<void>(`/users/${userId}/roles`, { roleIds }).then((r) => r.data),

  disable: (userId: string) =>
    http.post<void>(`/users/${userId}/disable`).then((r) => r.data),

  updateEstablishments: (userId: string, establishmentIds: string[]) =>
    http.post<void>(`/users/${userId}/establishments`, { establishmentIds }).then((r) => r.data),

  requestPasswordReset: (userId: string) =>
    http.post<void>(`/users/${userId}/password-reset`).then((r) => r.data),
};

import { http } from '@/utils/http';
import type { EmployeeSummary, InviteEmployeeInput } from '@/types/employees';

export const employeeApi = {
  list: () => http.get<EmployeeSummary[]>('/users').then((r) => r.data),

  invite: (body: InviteEmployeeInput) =>
    http.post<{ userId: string }>('/users/invite', body).then((r) => r.data),

  assignRole: (userId: string, roleIds: string[]) =>
    http.post<void>(`/users/${userId}/roles`, { roleIds }).then((r) => r.data),
};

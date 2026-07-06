export interface EmployeeSummary {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  roles: string[];
}

export interface InviteEmployeeInput {
  email: string;
  roleId: string;
}

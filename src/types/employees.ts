export interface EmployeeSummary {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  roles: string[];
  isOwner: boolean;
}

export interface InviteEmployeeInput {
  email: string;
  roleIds: string[];
}

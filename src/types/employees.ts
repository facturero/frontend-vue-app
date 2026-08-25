export interface EmployeeSummary {
  id: string;
  username: string | null;
  email: string;
  fullName: string | null;
  status: string;
  roles: string[];
  establishmentIds: string[];
  isOwner: boolean;
  hasPassword: boolean;
}

export interface InviteEmployeeInput {
  email: string;
  roleIds: string[];
  establishmentIds?: string[];
}

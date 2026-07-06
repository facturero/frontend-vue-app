export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRolePermissionsInput {
  permissions: string[];
}

export interface PermissionItem {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string | null;
}

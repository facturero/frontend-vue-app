export interface OrganizationDTO {
  id: string;
  legalName: string | null;
  tradeName: string | null;
  taxId: string | null;
  countryCode: string | null;
  status: 'active' | 'suspended';
  completed: boolean;
  settings: Record<string, unknown> | null;
}

export interface UpdateOrganizationInput {
  legalName?: string;
  tradeName?: string;
  settings?: Record<string, unknown>;
}

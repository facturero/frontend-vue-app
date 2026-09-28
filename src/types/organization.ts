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

export interface UpsertOrganizationInput {
  legalName: string;
  tradeName?: string;
  taxId: string;
  countryCode: string;
}

export interface EstablishmentDTO {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  countryCode: string;
  address: string | null;
  isMain: boolean;
  status: 'active' | 'inactive';
}

export interface CreateEstablishmentInput {
  name: string;
  address?: string;
  countryCode?: string;
}

export interface EmissionPointDTO {
  id: string;
  establishmentId: string;
  organizationId: string;
  code: string;
  name: string | null;
  status: 'active' | 'inactive';
  type: 'web' | 'pos';
  paired: boolean;
  /**
   * Tema del POS que tiene este punto por encima del default de la
   * organización. `null` = sin override, así que va al default. Ya viene
   * resuelto por el servidor: el cliente no vuelve a compositionar la cadena
   * override → default → integrado, que es donde se equivoca la gente.
   */
  posThemeId?: string | null;
  posThemeName?: string | null;
}

export interface CreateEmissionPointInput {
  name?: string;
  type?: 'web' | 'pos';
}

export interface PairingCodeDTO {
  code: string;
  secondsRemaining: number;
}

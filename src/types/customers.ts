export type CustomerType = 'person' | 'company';
export type CustomerStatus = 'active' | 'inactive';
export type AddressType = 'billing' | 'shipping' | 'other';

export interface Customer {
  id: string;
  organizationId: string;
  countryCode: string;
  identificationTypeId: string | null;
  identification: string | null;
  businessName: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  type: CustomerType;
  status: CustomerStatus;
  imageFileId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface Contact {
  id: string;
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
}

export interface Address {
  id: string;
  customerId: string;
  type: AddressType;
  line1: string;
  line2: string | null;
  city: string | null;
  province: string | null;
  countryCode: string | null;
  postalCode: string | null;
  isPrimary: boolean;
}

export interface Tag {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
}

export interface CustomerDetail extends Customer {
  contacts: Contact[];
  addresses: Address[];
  tags: Tag[];
}

export interface IdentificationType {
  id: string;
  countryCode: string;
  code: string;
  name: string;
  regex: string | null;
}

export interface CreateCustomerInput {
  businessName: string;
  type: CustomerType;
  tradeName?: string;
  identificationTypeId?: string;
  identification?: string;
  email?: string;
  phone?: string;
  imageFileId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCustomerInput {
  businessName?: string;
  tradeName?: string;
  identificationTypeId?: string;
  identification?: string;
  email?: string;
  phone?: string;
  imageFileId?: string;
  metadata?: Record<string, unknown>;
}

export interface ContactInput {
  name: string;
  email?: string;
  phone?: string;
  position?: string;
}

export interface AddressInput {
  type?: AddressType;
  line1: string;
  line2?: string;
  city?: string;
  province?: string;
  countryCode?: string;
  postalCode?: string;
  isPrimary?: boolean;
}

export interface TagInput {
  name: string;
  color?: string;
}

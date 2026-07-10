import { http } from '@/utils/http';
import type {
  Customer,
  CustomerDetail,
  CreateCustomerInput,
  UpdateCustomerInput,
  Contact,
  ContactInput,
  Address,
  AddressInput,
  Tag,
  TagInput,
  IdentificationType,
} from '@/types/customers';

export const customerApi = {
  list: (params?: { search?: string; status?: string; tagId?: string }) =>
    http.get<Customer[]>('/customers', { params }).then((r) => r.data),

  create: (body: CreateCustomerInput) =>
    http.post<Customer>('/customers', body).then((r) => r.data),

  getById: (id: string) =>
    http.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data),

  update: (id: string, body: UpdateCustomerInput) =>
    http.patch<Customer>(`/customers/${id}`, body).then((r) => r.data),

  disable: (id: string) =>
    http.post<void>(`/customers/${id}/disable`).then((r) => r.data),

  // Contactos
  listContacts: (customerId: string) =>
    http.get<Contact[]>(`/customers/${customerId}/contacts`).then((r) => r.data),

  addContact: (customerId: string, body: ContactInput) =>
    http.post<Contact>(`/customers/${customerId}/contacts`, body).then((r) => r.data),

  updateContact: (contactId: string, body: ContactInput) =>
    http.patch<Contact>(`/contacts/${contactId}`, body).then((r) => r.data),

  removeContact: (contactId: string) =>
    http.delete<void>(`/contacts/${contactId}`).then((r) => r.data),

  // Direcciones
  listAddresses: (customerId: string) =>
    http.get<Address[]>(`/customers/${customerId}/addresses`).then((r) => r.data),

  addAddress: (customerId: string, body: AddressInput) =>
    http.post<Address>(`/customers/${customerId}/addresses`, body).then((r) => r.data),

  updateAddress: (addressId: string, body: AddressInput) =>
    http.patch<Address>(`/addresses/${addressId}`, body).then((r) => r.data),

  removeAddress: (addressId: string) =>
    http.delete<void>(`/addresses/${addressId}`).then((r) => r.data),

  // Etiquetas
  listTags: () =>
    http.get<Tag[]>('/tags').then((r) => r.data),

  createTag: (body: TagInput) =>
    http.post<Tag>('/tags', body).then((r) => r.data),

  assignTag: (customerId: string, tagId: string) =>
    http.post<void>(`/customers/${customerId}/tags`, { tagId }).then((r) => r.data),

  removeTag: (customerId: string, tagId: string) =>
    http.delete<void>(`/customers/${customerId}/tags/${tagId}`).then((r) => r.data),

  // Catálogo (read-model de tax)
  listIdentificationTypes: () =>
    http.get<IdentificationType[]>('/identification-types').then((r) => r.data),
};

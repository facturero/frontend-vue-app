import { http } from '@/utils/http';
import type {
  ProductSummary,
  ProductDetail,
  CreateProductInput,
  UpdateProductInput,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  Unit,
  CreateUnitInput,
  UpdateUnitInput,
  TaxRate,
  ProductImage,
  AddProductImageInput,
  UpdateTaxesInput,
} from '@/types/products';

export const productApi = {
  list: (params?: { search?: string; status?: string; type?: string; categoryId?: string }) =>
    http.get<ProductSummary[]>('/products', { params }).then((r) => r.data),

  create: (body: CreateProductInput) =>
    http.post<ProductDetail>('/products', body).then((r) => r.data),

  getById: (id: string) =>
    http.get<ProductDetail>(`/products/${id}`).then((r) => r.data),

  update: (id: string, body: UpdateProductInput) =>
    http.patch<ProductDetail>(`/products/${id}`, body).then((r) => r.data),

  disable: (id: string) =>
    http.post<void>(`/products/${id}/disable`).then((r) => r.data),

  updateTaxes: (id: string, body: UpdateTaxesInput) =>
    http.put<ProductDetail>(`/products/${id}/taxes`, body).then((r) => r.data),

  listImages: (id: string) =>
    http.get<ProductImage[]>(`/products/${id}/images`).then((r) => r.data),

  addImage: (id: string, body: AddProductImageInput) =>
    http.post<ProductImage>(`/products/${id}/images`, body).then((r) => r.data),

  removeImage: (productId: string, imageId: string) =>
    http.delete<void>(`/products/${productId}/images/${imageId}`).then((r) => r.data),

  setPrimaryImage: (productId: string, imageId: string) =>
    http.put<void>(`/products/${productId}/images/${imageId}/primary`).then((r) => r.data),

  listCategories: () =>
    http.get<Category[]>('/categories').then((r) => r.data),

  createCategory: (body: CreateCategoryInput) =>
    http.post<Category>('/categories', body).then((r) => r.data),

  updateCategory: (id: string, body: UpdateCategoryInput) =>
    http.patch<Category>(`/categories/${id}`, body).then((r) => r.data),

  deleteCategory: (id: string) =>
    http.delete<void>(`/categories/${id}`).then((r) => r.data),

  listUnits: () =>
    http.get<Unit[]>('/units').then((r) => r.data),

  createUnit: (body: CreateUnitInput) =>
    http.post<Unit>('/units', body).then((r) => r.data),

  updateUnit: (id: string, body: UpdateUnitInput) =>
    http.patch<Unit>(`/units/${id}`, body).then((r) => r.data),

  listTaxRates: () =>
    http.get<TaxRate[]>('/tax-rates').then((r) => r.data),
};

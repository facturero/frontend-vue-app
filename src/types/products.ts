export type ProductType = 'good' | 'service';
export type ProductStatus = 'active' | 'inactive';
export type TaxKind = 'vat' | 'withholding_iva' | 'withholding_rent' | 'special';

export interface ProductSummary {
  id: string;
  organizationId: string;
  sku: string | null;
  name: string;
  type: ProductType;
  categoryId: string | null;
  unitId: string | null;
  status: ProductStatus;
  price: string;
  priceCents: number;
  currencyCode: string;
  priceIncludesTax: boolean;
  imageFileId: string | null;
}

export interface ProductTax {
  id: string;
  taxRateId: string;
  kind: TaxKind;
}

export interface ProductImage {
  id: string;
  productId: string;
  fileId: string;
  alt: string | null;
  isPrimary: boolean;
  position: number;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  trackStock: boolean;
  taxes: ProductTax[];
  images: ProductImage[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  type: ProductType;
  price: string;
  currencyCode: string;
  sku?: string;
  description?: string;
  categoryId?: string;
  unitId?: string;
  taxRateIds?: string[];
  priceIncludesTax?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateProductInput {
  name?: string;
  sku?: string | null;
  description?: string | null;
  type?: ProductType;
  categoryId?: string | null;
  unitId?: string | null;
  price?: string;
  currencyCode?: string;
  priceIncludesTax?: boolean;
  status?: ProductStatus;
  metadata?: Record<string, unknown> | null;
}

export interface Category {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  status: 'active' | 'inactive';
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  status?: 'active' | 'inactive';
}

export interface Unit {
  id: string;
  organizationId: string;
  code: string;
  name: string;
}

export interface CreateUnitInput {
  code: string;
  name: string;
}

export interface UpdateUnitInput {
  name?: string;
}

export interface TaxRate {
  id: string;
  countryCode: string;
  code: string;
  name: string | null;
  percentage: string;
  kind: TaxKind;
  isDefault: boolean;
}

export interface AddProductImageInput {
  fileId: string;
  alt?: string;
  position?: number;
  isPrimary?: boolean;
}

export interface UpdateTaxesInput {
  taxRateIds: string[];
}

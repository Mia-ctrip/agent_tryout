import type {
  AuthenticatedRequest,
  FormDataLike,
  NativePhotoFile,
} from './observation-api.ts';


export type PersonalProduct = {
  product_id: number;
  client_request_id: string;
  name: string;
  created_at: string;
  use_count: number;
  last_used_at: string | null;
  source_type: 'custom' | 'standard';
  standard_product_id: number | null;
  brand_name: string | null;
  formula_version: string | null;
  regulatory_type: RegulatoryType | null;
  image_url: string | null;
  image_expires_at: string | null;
};

export type ProductUseProduct = {
  product_id: number;
  name: string;
  brand_name: string | null;
  formula_version: string | null;
  image_asset_id: number | null;
  document_id: number | null;
  document_version: string | null;
  image_url: string | null;
  image_expires_at: string | null;
};

export type RegulatoryType = 'cosmetic' | 'drug' | 'medical_device';

export type ProductMatchType =
  | 'personal_exact'
  | 'standard_exact'
  | 'standard_alias'
  | 'prefix'
  | 'contains'
  | 'fuzzy';

export type ProductSearchItem = {
  source_type: 'personal' | 'standard';
  match_type: ProductMatchType;
  personal_product_id: number | null;
  standard_product_id: number | null;
  name: string;
  brand_name: string | null;
  formula_version: string | null;
  product_category: string | null;
  regulatory_type: RegulatoryType | null;
  image_url: string | null;
  image_expires_at: string | null;
  in_cabinet: boolean;
};

export type ProductSearchPage = {
  items: ProductSearchItem[];
  next_cursor: string | null;
};

export type StandardProductDocument = {
  document_id: number;
  market_region: string;
  language: string;
  regulatory_type: RegulatoryType;
  document_version: string;
  effective_date: string | null;
  registration_number: string | null;
  source_name: string;
  source_url: string;
  indications_original_text: string | null;
  content_sha256: string;
  original_document_url: string | null;
  original_document_expires_at: string | null;
};

export type StandardProductDetail = {
  standard_product_id: number;
  catalog_code: string;
  brand_name: string;
  official_name: string;
  product_category: string;
  formula_version: string;
  key_strength: string | null;
  regulatory_type: RegulatoryType;
  registration_number: string | null;
  market_region: string;
  status: 'active' | 'inactive';
  image_url: string | null;
  image_expires_at: string | null;
  current_document: StandardProductDocument | null;
};

export type ProductUse = {
  product_use_id: number;
  client_request_id: string;
  used_at: string;
  used_timezone_offset_minutes: number;
  note: string | null;
  created_at: string;
  products: ProductUseProduct[];
};

export type PersonalProductDetail = PersonalProduct & {
  uses: ProductUse[];
};

export type CreateProductInput = {
  clientRequestId: string;
  name: string;
};

export type AddStandardProductInput = {
  clientRequestId: string;
  standardProductId: number;
  displayNameOverride?: string | null;
};

export type CreateCustomProductInput = {
  clientRequestId: string;
  name: string;
  image?: NativePhotoFile;
};

export type CreateProductUseInput = {
  clientRequestId: string;
  usedAt: string;
  timezoneOffsetMinutes: number;
  productIds: number[];
  note: string | null;
};

export async function createPersonalProduct(
  request: AuthenticatedRequest,
  input: CreateProductInput,
): Promise<PersonalProduct> {
  return request<PersonalProduct>('/products', {
    method: 'POST',
    body: JSON.stringify({
      client_request_id: input.clientRequestId,
      name: input.name.trim(),
    }),
  });
}

export function buildCustomProductForm(
  input: CreateCustomProductInput,
  form: FormDataLike = new FormData() as unknown as FormDataLike,
): FormDataLike {
  form.append('client_request_id', input.clientRequestId);
  form.append('name', input.name.trim());
  if (input.image) {
    form.append('file', input.image);
  }
  return form;
}

export async function createCustomProduct(
  request: AuthenticatedRequest,
  form: FormDataLike,
): Promise<PersonalProduct> {
  return request<PersonalProduct>('/products/custom', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
}

export async function searchProducts(
  request: AuthenticatedRequest,
  { query, limit = 20, cursor }: { query: string; limit?: number; cursor?: string },
): Promise<ProductSearchPage> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return request<ProductSearchPage>(`/product-search?${params.toString()}`);
}

export async function getStandardProduct(
  request: AuthenticatedRequest,
  standardProductId: number,
): Promise<StandardProductDetail> {
  return request<StandardProductDetail>(`/catalog/products/${standardProductId}`);
}

export async function addStandardProductToCabinet(
  request: AuthenticatedRequest,
  input: AddStandardProductInput,
): Promise<PersonalProduct> {
  return request<PersonalProduct>('/products/from-standard', {
    method: 'POST',
    body: JSON.stringify({
      client_request_id: input.clientRequestId,
      standard_product_id: input.standardProductId,
      display_name_override: input.displayNameOverride ?? null,
    }),
  });
}

export async function listPersonalProducts(
  request: AuthenticatedRequest,
): Promise<PersonalProduct[]> {
  return request<PersonalProduct[]>('/products');
}

export async function getPersonalProduct(
  request: AuthenticatedRequest,
  productId: number,
): Promise<PersonalProductDetail> {
  return request<PersonalProductDetail>(`/products/${productId}`);
}

export async function createProductUse(
  request: AuthenticatedRequest,
  input: CreateProductUseInput,
): Promise<ProductUse> {
  return request<ProductUse>('/product-uses', {
    method: 'POST',
    body: JSON.stringify({
      client_request_id: input.clientRequestId,
      used_at: input.usedAt,
      used_timezone_offset_minutes: input.timezoneOffsetMinutes,
      product_ids: input.productIds,
      note: input.note,
    }),
  });
}

export async function listProductUses(
  request: AuthenticatedRequest,
  { limit = 50, beforeId }: { limit?: number; beforeId?: number } = {},
): Promise<ProductUse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId !== undefined) {
    params.set('before_id', String(beforeId));
  }
  return request<ProductUse[]>(`/product-uses?${params.toString()}`);
}

export async function listAllProductUses(
  request: AuthenticatedRequest,
): Promise<ProductUse[]> {
  const pageSize = 100;
  const uses: ProductUse[] = [];
  const seenIds = new Set<number>();
  let beforeId: number | undefined;

  while (true) {
    const page = await listProductUses(request, { limit: pageSize, beforeId });
    for (const use of page) {
      if (!seenIds.has(use.product_use_id)) {
        seenIds.add(use.product_use_id);
        uses.push(use);
      }
    }
    if (page.length < pageSize) break;
    const nextBeforeId = Math.min(...page.map(({ product_use_id }) => product_use_id));
    if (!Number.isSafeInteger(nextBeforeId) || nextBeforeId === beforeId) break;
    beforeId = nextBeforeId;
  }

  return uses;
}

export async function getProductUse(
  request: AuthenticatedRequest,
  useId: number,
): Promise<ProductUse> {
  return request<ProductUse>(`/product-uses/${useId}`);
}

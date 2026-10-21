import type {
  Brand,
  Category,
  CategoryUpdateInput,
  Collection,
  CollectionInput,
  Banner,
  BannerInput,
  BannerTemplateData,
  BannerTemplateRecord,
  PageLayoutEntry,
  PageLayoutPage,
  Product,
  ProductImage,
  ProductInput,
  ProductVariant,
  RestockHistoryResponse,
  VariantByBarcode,
  VariantInput,
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  MediaItem,
  CashCut,
  CashCutsResponse,
  CashCutSettings,
  CashCutSettingsUpdate,
  AppSettings,
  AppSettingsUpdate,
  Order,
  OrderSource,
  OrderStatus,
  OrderUpdateInput,
  PaymentMethod,
  OrdersResponse,
  PackagesTile,
  PackagesTileInput,
  PosSaleInput,
  ReturnCreateInput,
  ReturnRecord,
  WholesaleTier,
  WholesaleTierInput,
  NotificationsResponse,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const TOKEN_KEY = 'andary-admin-token'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const isFormData = options.body instanceof FormData

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new Error('Sesión expirada, inicia sesión de nuevo')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; admin: { id: number; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getCategories: () => request<Category[]>('/categories'),
  createCategory: (input: CategoryUpdateInput & { name: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(input) }),
  updateCategory: (id: number, input: CategoryUpdateInput) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteCategory: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),

  getPackagesTile: () => request<PackagesTile>('/packages-tile'),
  updatePackagesTile: (input: PackagesTileInput) =>
    request<PackagesTile>('/packages-tile', { method: 'PUT', body: JSON.stringify(input) }),

  getBrands: () => request<Brand[]>('/brands'),
  createBrand: (name: string) => request<Brand>('/brands', { method: 'POST', body: JSON.stringify({ name }) }),
  updateBrand: (id: number, name: string) =>
    request<Brand>(`/brands/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteBrand: (id: number) => request<void>(`/brands/${id}`, { method: 'DELETE' }),

  getProducts: () => request<Product[]>('/products?includeInactive=true'),
  getProduct: (id: number) => request<Product>(`/products/${id}`),
  createProduct: (data: ProductInput) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<ProductInput>) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  bulkDeleteProducts: (productIds: number[]) =>
    request<void>('/products/bulk', { method: 'DELETE', body: JSON.stringify({ productIds }) }),

  addProductImages: (id: number, images: Array<string | { url: string; colorName?: string | null }>) =>
    request<ProductImage[]>(`/products/${id}/images`, { method: 'POST', body: JSON.stringify({ images }) }),
  updateProductImage: (imageId: number, colorName: string | null) =>
    request<ProductImage>(`/products/images/${imageId}`, { method: 'PUT', body: JSON.stringify({ colorName }) }),
  reorderProductImages: (id: number, orderedIds: number[]) =>
    request<ProductImage[]>(`/products/${id}/images/reorder`, { method: 'PUT', body: JSON.stringify({ orderedIds }) }),
  deleteProductImage: (imageId: number) =>
    request<void>(`/products/images/${imageId}`, { method: 'DELETE' }),
  bulkUpdateDiscount: (productIds: number[], discountType: string | null, discountValue: number | null) =>
    request<Product[]>('/products/bulk-discount', {
      method: 'PATCH',
      body: JSON.stringify({ productIds, discountType, discountValue }),
    }),

  addVariant: (productId: number, data: VariantInput) =>
    request<ProductVariant>(`/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(data) }),
  updateVariant: (variantId: number, data: Partial<VariantInput>) =>
    request<ProductVariant>(`/products/variants/${variantId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVariant: (variantId: number) =>
    request<void>(`/products/variants/${variantId}`, { method: 'DELETE' }),

  getVariantByBarcode: (barcode: string) =>
    request<VariantByBarcode>(`/variants/barcode/${encodeURIComponent(barcode)}`),
  adjustStock: (barcode: string, payload: { delta?: number; stock?: number }) =>
    request<ProductVariant>(`/variants/barcode/${encodeURIComponent(barcode)}/stock`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getRestockHistory: (params: { from?: string; to?: string; productId?: number; adminEmail?: string; q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    if (params.productId) qs.set('productId', String(params.productId))
    if (params.adminEmail) qs.set('adminEmail', params.adminEmail)
    if (params.q) qs.set('q', params.q)
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<RestockHistoryResponse>(`/variants/restocks${query ? `?${query}` : ''}`)
  },

  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return request<{ url: string; thumbUrl: string; key: string }>('/uploads', { method: 'POST', body: formData })
  },
  getMediaLibrary: () => request<MediaItem[]>('/uploads'),
  /** Deletes an uploaded photo that either never got attached to anything
   * (a draft product's image, removed/replaced before the product was
   * saved) or is being explicitly discarded — safe to call speculatively,
   * the backend no-ops if the URL is still referenced anywhere else. */
  deleteImage: (url: string) => request<void>('/uploads', { method: 'DELETE', body: JSON.stringify({ url }) }),

  getCollections: () => request<Collection[]>('/collections?includeInactive=true'),
  getCollection: (id: number) => request<Collection>(`/collections/${id}`),
  createCollection: (data: CollectionInput) =>
    request<Collection>('/collections', { method: 'POST', body: JSON.stringify(data) }),
  updateCollection: (id: number, data: Partial<CollectionInput>) =>
    request<Collection>(`/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCollection: (id: number) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
  addCollectionProduct: (id: number, productId: number, discountPrice: number | null = null) =>
    request<Collection>(`/collections/${id}/products`, {
      method: 'POST',
      body: JSON.stringify({ productId, discountPrice }),
    }),
  reorderCollectionProducts: (id: number, orderedProductIds: number[]) =>
    request<Collection>(`/collections/${id}/products/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedProductIds }),
    }),
  updateCollectionProductDiscount: (id: number, productId: number, discountPrice: number | null) =>
    request<Collection>(`/collections/${id}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ discountPrice }),
    }),
  removeCollectionProduct: (id: number, productId: number) =>
    request<Collection>(`/collections/${id}/products/${productId}`, { method: 'DELETE' }),

  getBannerTemplates: () => request<BannerTemplateRecord[]>('/banner-templates'),
  createBannerTemplate: (data: { name: string; preset: BannerTemplateData }) =>
    request<BannerTemplateRecord>('/banner-templates', { method: 'POST', body: JSON.stringify(data) }),
  deleteBannerTemplate: (id: number) => request<void>(`/banner-templates/${id}`, { method: 'DELETE' }),

  getBanners: () => request<Banner[]>('/banners?includeInactive=true'),
  createBanner: (data: BannerInput) => request<Banner>('/banners', { method: 'POST', body: JSON.stringify(data) }),
  updateBanner: (id: number, data: Partial<BannerInput>) =>
    request<Banner>(`/banners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBanner: (id: number) => request<void>(`/banners/${id}`, { method: 'DELETE' }),
  reorderBanners: (orderedIds: number[]) =>
    request<void>('/banners/reorder', { method: 'PUT', body: JSON.stringify({ orderedIds }) }),

  getPageLayout: (page: PageLayoutPage) => request<PageLayoutEntry[]>(`/page-layouts/${page}`),
  updatePageLayout: (page: PageLayoutPage, order: { type: string; id?: number }[]) =>
    request<PageLayoutEntry[]>(`/page-layouts/${page}`, { method: 'PUT', body: JSON.stringify({ order }) }),

  getWholesaleTiers: () => request<WholesaleTier[]>('/wholesale-tiers'),
  createWholesaleTier: (data: WholesaleTierInput) =>
    request<WholesaleTier>('/wholesale-tiers', { method: 'POST', body: JSON.stringify(data) }),
  updateWholesaleTier: (id: number, data: Partial<WholesaleTierInput>) =>
    request<WholesaleTier>(`/wholesale-tiers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWholesaleTier: (id: number) => request<void>(`/wholesale-tiers/${id}`, { method: 'DELETE' }),

  getOrders: (
    params: {
      from?: string
      to?: string
      status?: OrderStatus
      source?: OrderSource
      /** Exact datetimes reproducing one cash cut's own membership rule —
       * takes over from from/to entirely. See CashCuts.tsx's "Ver en Ventas"
       * link and orders.controller.js's listOrders. */
      confirmedFrom?: string
      confirmedTo?: string
    } = {}
  ) => {
    const query = new URLSearchParams()
    if (params.from) query.set('from', params.from)
    if (params.to) query.set('to', params.to)
    if (params.status) query.set('status', params.status)
    if (params.source) query.set('source', params.source)
    if (params.confirmedFrom) query.set('confirmedFrom', params.confirmedFrom)
    if (params.confirmedTo) query.set('confirmedTo', params.confirmedTo)
    const qs = query.toString()
    return request<OrdersResponse>(`/orders${qs ? `?${qs}` : ''}`)
  },
  getOrder: (id: number) => request<Order>(`/orders/${id}`),
  updateOrder: (id: number, data: OrderUpdateInput) =>
    request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateOrderPhone: (id: number, phone: string | null) =>
    request<Order>(`/orders/${id}/phone`, { method: 'PATCH', body: JSON.stringify({ phone }) }),
  updateOrderPackaging: (id: number, isPackaged: boolean) =>
    request<Order>(`/orders/${id}/packaging`, { method: 'PATCH', body: JSON.stringify({ isPackaged }) }),
  confirmOrder: (id: number, paymentMethod?: PaymentMethod | null) =>
    request<Order>(`/orders/${id}/confirm`, { method: 'POST', body: JSON.stringify({ paymentMethod }) }),
  cancelOrder: (id: number) => request<void>(`/orders/${id}/cancel`, { method: 'POST' }),
  cancelConfirmedOrder: (id: number, password: string) =>
    request<Order>(`/orders/${id}/cancel-confirmed`, { method: 'POST', body: JSON.stringify({ password }) }),
  createPosSale: (data: PosSaleInput) => request<Order>('/orders/pos', { method: 'POST', body: JSON.stringify(data) }),

  getCashCuts: (params: { from?: string; to?: string } = {}) => {
    const query = new URLSearchParams()
    if (params.from) query.set('from', params.from)
    if (params.to) query.set('to', params.to)
    const qs = query.toString()
    return request<CashCutsResponse>(`/cash-cuts${qs ? `?${qs}` : ''}`)
  },
  createCashCut: () => request<CashCut>('/cash-cuts', { method: 'POST' }),
  getCashCutSettings: () => request<CashCutSettings>('/cash-cuts/settings'),
  updateCashCutSettings: (data: CashCutSettingsUpdate) =>
    request<CashCutSettings>('/cash-cuts/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getSettings: () => request<AppSettings>('/settings'),
  updateSettings: (data: AppSettingsUpdate) => request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  getReturns: (params: { from?: string; to?: string; orderId?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.from) query.set('from', params.from)
    if (params.to) query.set('to', params.to)
    if (params.orderId) query.set('orderId', String(params.orderId))
    const qs = query.toString()
    return request<ReturnRecord[]>(`/returns${qs ? `?${qs}` : ''}`)
  },
  createReturn: (data: ReturnCreateInput) => request<ReturnRecord>('/returns', { method: 'POST', body: JSON.stringify(data) }),
  updateReturn: (id: number, settled: boolean) =>
    request<ReturnRecord>(`/returns/${id}`, { method: 'PATCH', body: JSON.stringify({ settled }) }),

  getCustomers: (search?: string) =>
    request<Customer[]>(`/customers/admin${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createCustomer: (data: CustomerCreateInput) =>
    request<Customer>('/customers/admin', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: CustomerUpdateInput) =>
    request<Customer>(`/customers/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getVapidPublicKey: () => request<{ publicKey: string }>('/notifications/vapid-public-key'),
  subscribeToPush: (subscription: PushSubscriptionJSON) =>
    request<void>('/notifications/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribeFromPush: (endpoint: string) =>
    request<void>('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  getNotifications: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<NotificationsResponse>(`/notifications${query ? `?${query}` : ''}`)
  },
  markNotificationRead: (id: number) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
}

export { TOKEN_KEY }

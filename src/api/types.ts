export interface Category {
  id: number
  name: string
  slug: string
  /** Overrides for the storefront's "shop by category" tile — null falls
   * back to an auto-picked product photo / a generic tagline there. */
  image_url: string | null
  tagline: string | null
  /** Where image_url is anchored within its tile (CSS background-position,
   * percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  /** null = background-size: cover (fills the tile). Set = an explicit
   * background-size percent instead, letting the admin shrink the photo
   * within its tile instead of always cropping to fill it. */
  image_zoom: number | null
  /** null = the tile's own default dark gradient over the photo; a 0-150
   * number scales that gradient's opacity — same idea as banners. */
  scrim_opacity: number | null
  sort_order: number
  /** 0 = kept out of the storefront's own category browsing (home tiles,
   * catalog filter pills) — still usable everywhere a category is just a
   * pricing/grouping key (Mayoreo tiers, the Cotizador's Pants/Paq. 3 Boss
   * rows), which have no real browsable products yet. */
  show_in_nav: number
  /** 0 = no active product in this category currently has any stock —
   * computed live on every fetch, never stored. A category with no stock is
   * effectively hidden on the storefront the same as show_in_nav=0, even if
   * this checkbox is on — shown here as a read-only hint, not editable. */
  has_stock: number
}

/** Partial by design — a drag-reorder save sends only sortOrder, a rename
 * only name, an image change only imageUrl, etc. */
export interface CategoryUpdateInput {
  name?: string
  imageUrl?: string | null
  tagline?: string | null
  sortOrder?: number
  imageFocusX?: number
  imageFocusY?: number
  imageZoom?: number | null
  scrimOpacity?: number | null
  showInNav?: boolean
}

/** Overrides for the storefront home page's fixed "Paquetes" tile (see
 * CategoryShowcase in frontend/src/pages/Catalog.tsx) — a synthetic tile,
 * not a real row in `categories`, so it needed this separate singleton
 * settings blob to get the same photo/tagline control every real category
 * already has. Null fields keep the tile's original auto-picked photo /
 * fixed tagline. */
export interface PackagesTile {
  image_url: string | null
  tagline: string | null
  image_focus_x: number
  image_focus_y: number
  image_zoom: number | null
  scrim_opacity: number | null
}

export interface PackagesTileInput {
  imageUrl?: string | null
  tagline?: string | null
  imageFocusX?: number
  imageFocusY?: number
  imageZoom?: number | null
  scrimOpacity?: number | null
}

export interface Brand {
  id: number
  name: string
  slug: string
}

export interface ProductVariant {
  id: number
  product_id: number
  size: string
  color_name: string
  color_hex: string
  barcode: string
  stock: number
  sort_order: number
}

export interface ProductImage {
  id: number
  product_id: number
  image_url: string
  color_name: string | null
  sort_order: number
}

export type DiscountType = 'percent' | 'fixed_price' | 'amount_off'
export type CollectionPricingMode = 'none' | 'unit' | 'bundle' | 'wholesale' | 'combo'

/** One category quota within a 'combo' pricing_mode collection, e.g.
 * "2 Playeras" or "1 Gorra de regalo". A non-null product_id pins the part
 * to that exact product instead of letting the customer pick any product
 * from category_id. */
export interface CollectionBundlePart {
  id: number
  category_id: number
  category_name: string
  category_slug: string
  /** Deprecated — no longer set from the admin form. See is_specific. */
  product_id: number | null
  product_name?: string | null
  /** true: only products curated into the collection (for category_id) count,
   * up to required_qty. false: any product in category_id counts dynamically,
   * no curation needed. */
  is_specific: number
  required_qty: number
  /** Only meaningful for pricing_mode 'bundle': makes this part its own
   * independent "required_qty units of category_id for $price" tier,
   * instead of pooling toward the collection's flat bundle_qty/bundle_price. */
  price: string | null
  is_gift: number
  /** Only set for pricing_mode 'combo': which tier (variant) this part
   * belongs to — see CollectionComboTier. Null for 'bundle'/'unit'. */
  combo_tier_id: number | null
}

/** A priced variant of a 'combo' collection, e.g. "2 Playeras + 2 Gorras —
 * $1380" and "3 Playeras + 3 Gorras — $1970" are two tiers. Every 'combo'
 * collection has at least one; with exactly one, the customer picks products
 * directly (no tier-card screen); with more than one, they choose a tier
 * first, like wholesale's quantity ranges. */
export interface CollectionComboTier {
  id: number
  price: string
  sort_order: number
}

export interface CollectionBundlePartInput {
  categoryId: number
  productId?: number | null
  isSpecific: boolean
  requiredQty: number
  price?: number | null
  isGift: boolean
}

export interface CollectionComboTierInput {
  price: number
  parts: CollectionBundlePartInput[]
}

export interface ProductCollectionMembership {
  id: number
  name: string
  slug: string
  pricing_mode: CollectionPricingMode
  unit_price: string | null
  bundle_qty: number | null
  bundle_price: string | null
  discount_price: string | null
}

export interface Product {
  id: number
  category_id: number | null
  brand_id: number | null
  name: string
  slug: string
  description: string | null
  price: string
  main_image_url: string | null
  is_new: number
  is_featured: number
  is_active: number
  /** Computed fresh on every request from real confirmed sales — never a
   * stored/manual flag, so it can't be toggled from the admin. */
  is_bestseller: boolean
  discount_type: DiscountType | null
  discount_value: string | null
  category_name?: string | null
  category_slug?: string | null
  brand_name?: string | null
  brand_slug?: string | null
  images: ProductImage[]
  variants: ProductVariant[]
  /** Only present on products embedded inside a Collection: per-product
   * discount price that applies only within that collection. */
  collection_discount_price?: string | null
  /** Active collections this product belongs to (with their pricing config). */
  collections: ProductCollectionMembership[]
}

export interface VariantByBarcode {
  id: number
  product_id: number
  size: string
  color_name: string
  color_hex: string
  barcode: string
  stock: number
  product_name: string
  product_slug: string
  main_image_url: string | null
}

export interface ProductInput {
  name: string
  description: string
  price: number
  brandId: number | null
  categoryId: number | null
  mainImageUrl: string | null
  isNew: boolean
  isFeatured: boolean
  isActive: boolean
  discountType: DiscountType | null
  discountValue: number | null
}

export interface VariantInput {
  size: string
  colorName: string
  colorHex: string
  barcode: string
  stock: number
  sortOrder?: number
}

export interface StockMovement {
  id: number
  variant_id: number
  delta: number
  resulting_stock: number
  admin_email: string | null
  created_at: string
  size: string
  color_name: string
  barcode: string
  product_id: number
  product_name: string
  main_image_url: string | null
}

export interface RestockHistoryResponse {
  rows: StockMovement[]
  total: number
}

export interface Collection {
  id: number
  name: string
  slug: string
  /** Admin-only short label to tell apart two collections sharing the same
   * customer-facing `name` — never shown to customers. */
  admin_tag: string | null
  description: string | null
  pricing_mode: CollectionPricingMode
  unit_price: string | null
  unit_min_qty: number | null
  bundle_qty: number | null
  bundle_price: string | null
  wholesale_category_id: number | null
  wholesale_any_product: number
  /** Only meaningful for pricing_mode 'none' with curated products — shows
   * an "Añadir todo al carrito" button on the storefront. */
  allow_add_all_to_cart: number
  promo_text: string | null
  banner_image_url: string | null
  /** Custom banner layout from the visual editor — null uses the plain
   * fixed rendering (banner_image_url + promo_text) instead. */
  layout_json: BannerElement[] | null
  /** Where banner_image_url is anchored within its box (CSS
   * background-position, percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  is_active: number
  /** Independent of is_active — a collection can be active (buyable) without
   * taking up its own section on the home page. */
  show_on_home: number
  /** Shows a "Tiempo limitado" tag on the storefront. Both dates are
   * optional even when this is on (NULL = just the plain tag, no
   * countdown) — see limited_time_ends_at for when the live countdown
   * kicks in. */
  limited_time: number
  limited_time_starts_at: string | null
  /** Once this is 3 days away or closer, the storefront shows a live
   * countdown instead of just the plain "Tiempo limitado" tag. */
  limited_time_ends_at: string | null
  sort_order: number
  products: Product[]
  bundle_parts: CollectionBundlePart[]
  combo_tiers: CollectionComboTier[]
  /** Tier key most picked in real confirmed sales — see the frontend's
   * Catalog.tsx for how it decides the "Más elegido" ribbon. */
  most_chosen_tier_key: string | null
}

export interface CollectionInput {
  name: string
  adminTag?: string | null
  description: string
  bannerImageUrl: string | null
  layoutJson?: BannerElement[] | null
  imageFocusX?: number
  imageFocusY?: number
  isActive: boolean
  showOnHome: boolean
  limitedTime?: boolean
  limitedTimeStartsAt?: string | null
  limitedTimeEndsAt?: string | null
  sortOrder: number
  pricingMode: CollectionPricingMode
  unitPrice: number | null
  unitMinQty: number | null
  bundleQty: number | null
  bundlePrice: number | null
  wholesaleCategoryId?: number | null
  wholesaleAnyProduct?: boolean
  allowAddAllToCart?: boolean
  promoText: string | null
  bundleParts?: CollectionBundlePartInput[]
  /** Only used for pricingMode 'combo' — replaces bundleParts entirely. */
  comboTiers?: CollectionComboTierInput[]
}

export type BannerDevice = 'mobile' | 'tablet' | 'desktop'

/** One element's position and size for one specific device breakpoint. All
 * size fields are relative to BANNER_REFERENCE_WIDTH and rendered as
 * container-query units, so they scale with however wide the banner's own
 * box actually is — the "px" the admin types in is really "size at a
 * reference desktop width", not a literal fixed pixel count. */
export interface BannerDeviceLayout {
  xPct: number
  yPct: number
  fontSize: number
  /** Inner spacing between the text and its background/border box. */
  padding?: number
  /** Corner rounding — 0 is square, a large value (e.g. 999) reads as a full
   * pill. */
  borderRadius?: number
  borderWidth?: number
  /** For kind 'image', its box size (reference-px, same cqw-scaled unit
   * system as fontSize) since a photo has no text to size itself off of —
   * unset falls back to a default box in bannerElementStyle. For a text/
   * button/badge/title/subtitle kind, an explicit box width (unset lets it
   * auto-size to its own text, never wrapping for 'button' — see
   * .banner-editor__el--button — or wrapping at a max-width for others). */
  width?: number
  height?: number
}

/** One positioned, styled text element in a hero slide's custom banner
 * layout (from the admin's visual banner editor) — a badge/title/subtitle/
 * button drawn from the slide's plain fields, a free-standing text box, or
 * an extra button added on top. */
export interface BannerElement {
  id: string
  kind: 'badge' | 'title' | 'subtitle' | 'button' | 'text' | 'plaque' | 'image'
  text: string
  /** Only meaningful for kind 'plaque': the big price line, e.g. "$1,360" —
   * see .banner-plaque in index.css for the shop's own "flyer" price-card
   * look this reuses. */
  priceText?: string
  /** Only meaningful for kind 'plaque': the small line under the price, e.g.
   * "(Cada prenda a $340 c/u)". */
  captionText?: string
  /** Only meaningful for kind 'image': the uploaded photo shown in this
   * element's own box — lets a layout collage several product photos around
   * the text, not just one full-bleed background. */
  imageUrl?: string | null
  color: string
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  /** Drop shadow behind the text, 0 (or unset) = none, up to 5 = strongest —
   * helps legibility over busy photo areas. `boolean` is only ever read, not
   * written — legacy shape from before this was a level (true ≈ level 3). */
  textShadow?: number | boolean
  /** Fill color behind the text ("el tono"). Unset/null = no fill. */
  backgroundColor?: string | null
  /** Unset/null = no border. Pairs with no backgroundColor for an
   * outline-only box ("solo el puro borde"). */
  borderColor?: string | null
  /** iOS-style frosted glass fill — a translucent tint (backgroundColor, or
   * white if unset) plus a background blur, instead of a flat opaque fill.
   * Independent of backgroundColor/borderColor so a color choice already
   * made isn't lost when toggling this off. */
  glass?: boolean
  /** 'left' (default when unset): xPct is the box's left edge, as always.
   * 'center': xPct is the box's horizontal CENTER instead (rendered via a
   * -50% transform), so the element stays truly centered regardless of how
   * long its text is — used by the "Centrado" template. */
  align?: 'left' | 'center'
  /** Only meaningful for kind 'button' — where it links to. 'catalog'
   * (default) scrolls to the general catalog, 'collection' scrolls to
   * collectionSlug's own section, 'category' navigates to that category's
   * filtered catalog view, 'url' goes to an arbitrary link. */
  linkType?: 'catalog' | 'collection' | 'category' | 'packages' | 'url'
  collectionSlug?: string | null
  categorySlug?: string | null
  url?: string | null
  /** true (default when unset) keeps position and size identical across
   * mobile/tablet/desktop — moving or resizing on any one device tab
   * updates all three. false lets each device be positioned/sized
   * independently (e.g. to move a title that overlaps something on mobile
   * only, without touching desktop). */
  linked?: boolean
  /** Per-breakpoint position/size — always present on anything saved by the
   * current editor. Optional only so TypeScript doesn't choke on elements
   * saved before this existed; resolveDeviceLayout() falls back to the
   * legacy flat fields below for those. */
  layouts?: {
    desktop: BannerDeviceLayout
    tablet: BannerDeviceLayout
    mobile: BannerDeviceLayout
  }
  /** @deprecated pre-per-device fields — only read as a fallback by
   * resolveDeviceLayout() for elements saved before `layouts` existed. */
  xPct?: number
  yPct?: number
  fontSize?: number
  padding?: number
  borderRadius?: number
  borderWidth?: number
}

/** Resolves one element's position/size for `device`, transparently
 * migrating pre-per-device elements (flat xPct/yPct/fontSize/...) into the
 * same shape — every consumer only ever deals with one shape. Kept here
 * (not just in the admin) since the frontend reads the same saved data. */
export function resolveDeviceLayout(el: BannerElement, device: BannerDevice): BannerDeviceLayout {
  if (el.layouts) return el.layouts[device] ?? el.layouts.desktop
  return {
    xPct: el.xPct ?? 50,
    yPct: el.yPct ?? 50,
    fontSize: el.fontSize ?? 16,
    padding: el.padding,
    borderRadius: el.borderRadius,
    borderWidth: el.borderWidth,
  }
}

export type BannerKind = 'hero' | 'promo'
export type BannerPlacement = 'home_hero' | 'home_promo' | 'packages' | 'category'

/** A promotional banner anywhere in the storefront. `kind: 'hero'` is a
 * rich, freely-positioned banner (layout_json) — only ever used for the
 * home page's main carousel (placement: 'home_hero'). `kind: 'promo'` is
 * the simpler image+title+subtitle+badge strip (formerly the standalone
 * "Arma tu paquete" banner) and can be placed on the home promo strip, the
 * Paquetes page, or one specific category's page. */
export interface Banner {
  id: number
  kind: BannerKind
  placement: BannerPlacement
  /** Only meaningful when placement = 'category'. */
  placement_category_id: number | null
  placement_category_slug?: string | null
  placement_category_name?: string | null
  image_url: string
  badge_text: string | null
  title: string | null
  subtitle: string | null
  cta_text: string | null
  cta_link: string | null
  collection_id: number | null
  collection_slug?: string | null
  collection_name?: string | null
  is_active: number
  sort_order: number
  /** Custom banner layout from the visual editor — null uses the plain
   * fixed rendering of the fields above instead. Only ever set for kind = 'hero'. */
  layout_json: BannerElement[] | null
  /** Where image_url is anchored within its box (CSS background-position,
   * percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  /** NULL = background-size: cover; set = an explicit percent, shrinking the
   * photo to show it in full instead of always cropping to fill the box. */
  image_zoom: number | null
  /** NULL = the placement's own default dark gradient over the photo; set =
   * a 0-150 percent multiplier scaling that gradient's opacity. */
  scrim_opacity: number | null
  /** Optional separate photo shown only below the tablet breakpoint (see
   * resolveBannerDevice) — a single image's aspect ratio can't look right
   * in both a wide desktop box and a tall/narrow mobile one, so this lets
   * the admin upload a differently cropped/composed shot just for mobile
   * instead of the same one being forced to fit (or shrunk small via
   * image_zoom) there. NULL falls back to image_url, same as before this
   * existed. Reuses image_focus_x/y and image_zoom (its own position/size
   * within its own box), not doubled per image. */
  image_url_mobile: string | null
}

export interface BannerInput {
  kind: BannerKind
  placement: BannerPlacement
  placementCategoryId?: number | null
  imageUrl: string
  badgeText: string | null
  title: string | null
  subtitle: string | null
  ctaText: string | null
  ctaLink: string | null
  collectionId: number | null
  isActive: boolean
  sortOrder: number
  layoutJson?: BannerElement[] | null
  imageFocusX?: number
  imageFocusY?: number
  imageZoom?: number | null
  scrimOpacity?: number | null
  imageUrlMobile?: string | null
}

/** One slot in a page's own curated section order — 'home' mixes home_promo
 * banners, the "Comprar por categoría" tile grid, and whichever collections
 * are picked for it; 'packages' mixes packages-placement banners and
 * whichever collections are picked for the Paquetes page. Both replace what
 * used to be separate, overlapping controls (a collection's own "mostrar en
 * inicio" toggle, its own drag order, a banner's own per-placement order)
 * with one curated list per page. Already resolved by the backend (stale
 * ids dropped) — see backend/src/controllers/pageLayouts.controller.js. */
export type PageLayoutPage = 'home' | 'packages'

export type PageLayoutEntry =
  | { type: 'category_showcase' }
  | { type: 'all_products' }
  | { type: 'banner'; id: number; label: string }
  | { type: 'collection'; id: number; label: string }

export interface WholesaleTier {
  id: number
  category_id: number | null
  category_name?: string | null
  min_qty: number
  max_qty: number | null
  price_per_unit: string
  sort_order: number
  /** Manually pins the "Más elegido" ribbon for this tier on the storefront
   * — see frontend's Catalog.tsx isTierFeatured(). Takes priority over the
   * sales-data-derived collections.most_chosen_tier_key pick. */
  is_featured: number
}

export interface WholesaleTierInput {
  categoryId: number | null
  minQty: number
  maxQty: number | null
  pricePerUnit: number
  sortOrder: number
  isFeatured?: boolean
}

/** One row from the "elegir de la galería" picker — every image ever
 * uploaded through ImageUploader, so it can be reused elsewhere instead of
 * uploading a duplicate copy of the same file. */
export interface MediaItem {
  id: number
  url: string
  created_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled'
export type OrderSource = 'whatsapp' | 'pos'

/** A snapshot of one product/variant at the moment the order was placed —
 * not a live join, so it stays accurate even if the product/price/variant
 * changes or is deleted later. */
export interface OrderItem {
  id: number
  order_id: number
  product_id: number | null
  variant_id: number | null
  product_name: string
  size: string | null
  color_name: string | null
  main_image_url: string | null
  unit_price: string
  quantity: number
  /** Snapshot of the package/collection this line's price came from — null
   * for a plain retail-priced item. */
  collection_id: number | null
  collection_name: string | null
  /** Flat currency amount subtracted per unit ("descuento por producto"). */
  discount_amount: string
  /** Why discount_amount is set — e.g. "Cliente frecuente" when applied
   * automatically at order creation. Null for a plain manual discount. */
  discount_reason: string | null
  /** Added from the admin ("añadir producto de regalo") — still deducts
   * stock on confirm, excluded from revenue. */
  is_gift: number
  /** Was out of stock when the customer sent it — an availability inquiry,
   * not a confirmed sale yet (can't be confirmed until restocked). */
  is_preorder: number
}

/** One "Enviar pedido por WhatsApp" click, recorded automatically — see
 * backend/src/controllers/orders.controller.js. 'pending' until the admin
 * confirms it (which is also when stock is deducted) or cancels it. */
export interface Order {
  id: number
  customer_id: number | null
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  status: OrderStatus
  /** 'whatsapp' — sent by a customer from the storefront; 'pos' — rung up
   * in-person from Punto de venta (already confirmed the moment it exists). */
  source: OrderSource
  /** Flat currency amount subtracted from the order's total ("descuento total"). */
  discount_amount: string
  /** Set for a Punto de venta sale, or once a WhatsApp order is confirmed
   * (see confirmOrder) — null only while a WhatsApp order is still pending. */
  payment_method: PaymentMethod | null
  /** Manually typed in by an admin — a guest WhatsApp order has no
   * automatic way to learn the customer's number. Independent of
   * customer_phone, which only ever comes from a logged-in account. */
  guest_phone: string | null
  is_packaged: number
  packed_at: string | null
  created_at: string
  confirmed_at: string | null
  items: OrderItem[]
}

export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'transfer'

export interface OrderItemInput {
  productId?: number | null
  variantId?: number | null
  productName: string
  size?: string | null
  colorName?: string | null
  mainImageUrl?: string | null
  unitPrice: number
  quantity: number
  collectionId?: number | null
  collectionName?: string | null
  discountAmount?: number
  discountReason?: string | null
  isGift?: boolean
  isPreorder?: boolean
}

export interface OrderUpdateInput {
  notes?: string | null
  discountAmount?: number
  items?: OrderItemInput[]
}

/** One line rung up on the Escáner/Punto de venta screen — always sold at
 * the price shown there, no "discount reason" bookkeeping like a WhatsApp
 * order gets. */
export interface PosSaleItemInput {
  productId?: number | null
  variantId?: number | null
  name: string
  size?: string | null
  colorName?: string | null
  image?: string | null
  unitPrice: number
  quantity: number
  collectionId?: number | null
  collectionName?: string | null
  discountAmount?: number
  isGift?: boolean
}

export interface PosSaleInput {
  items: PosSaleItemInput[]
  notes?: string | null
  discountAmount?: number
  paymentMethod?: PaymentMethod | null
  /** The "cliente frecuente" this sale is rung up for, if any — their
   * standing discount_amount gets applied per line server-side. */
  customerId?: number | null
}

/** One specific product_id/color/size that contributed to a byProduct name
 * group — lets the admin tell apart two catalog products that happen to
 * share a display name. colorHex/mainImageUrl are a live lookup (not a
 * historical snapshot), just for a nicer drill-down — fine since nothing
 * financial depends on them. */
export interface ProductStatVariant {
  productId: number | null
  colorName: string | null
  colorHex: string | null
  size: string | null
  mainImageUrl: string | null
  quantity: number
  gifts: number
}

export interface OrdersResponse {
  orders: Order[]
  summary: {
    confirmedCount: number
    /** Same date+source scope as confirmedCount, but independent of the
     * Estado filter — so these three always show the full breakdown. */
    pendingCount: number
    cancelledCount: number
    totalCount: number
    revenue: number
    itemsSold: number
    giftsCount: number
    byCategory: { categoryName: string; itemsSold: number; gifts: number }[]
    /** Sorted by quantity sold, descending — same rows also carry each
     * product's gift count, so "más vendidos" and "regalos" both read from
     * this one list. */
    byProduct: { productName: string; quantity: number; gifts: number; variants: ProductStatVariant[] }[]
    /** Sorted by quantity sold, descending — plain retail lines (no
     * collection) never appear here. */
    byPackage: { collectionId: number; collectionName: string; quantity: number }[]
  }
}

export interface CashCutSourceBreakdown {
  salesCount: number
  itemsSold: number
  totalAmount: number
}

/** A "corte de caja" — closes out every confirmed sale (WhatsApp and
 * mostrador alike) since the previous cut, which then becomes this one's
 * period_from. by_source breaks the same totals down by channel. */
export interface CashCut {
  id: number
  period_from: string
  period_to: string
  sales_count: number
  items_sold: number
  total_amount: string
  by_source: { whatsapp: CashCutSourceBreakdown; pos: CashCutSourceBreakdown } | null
  admin_email: string | null
  created_at: string
}

export interface AppSettings {
  id: number
  label_width_mm: number
  label_height_mm: number
  low_stock_threshold: number
  bestseller_min_qty: number
  bestseller_limit: number
  updated_at: string
}

export interface AppSettingsUpdate {
  labelWidthMm?: number
  labelHeightMm?: number
  lowStockThreshold?: number
  bestsellerMinQty?: number
  bestsellerLimit?: number
}

export interface CashCutSettings {
  id: number
  enabled: number
  frequency: 'daily' | 'weekly'
  hour: number
  /** Only meaningful when frequency = 'weekly'. 0 = domingo .. 6 = sábado
   * (matches JS's Date#getDay()). */
  weekday: number | null
  updated_at: string
}

export interface CashCutSettingsUpdate {
  enabled?: boolean
  frequency?: 'daily' | 'weekly'
  hour?: number
  weekday?: number | null
}

export interface CashCutsResponse {
  cuts: CashCut[]
  /** Confirmed sales since the last cut, not yet swept into one. */
  pending: {
    since: string
    salesCount: number
    itemsSold: number
    totalAmount: number
    bySource: { whatsapp: CashCutSourceBreakdown; pos: CashCutSourceBreakdown }
  }
}

/** A storefront account (created only by logging in with Google — see
 * customers.controller.js). The admin can also pre-create one by just an
 * email, before that person ever logs in, to set up a standing discount. */
export interface Customer {
  id: number
  name: string
  email: string | null
  phone: string | null
  /** Flat currency amount taken off every unit in every order this customer
   * places, on top of any other pricing — 0 = no special treatment. */
  discount_amount: string
  created_at: string
}

export interface CustomerCreateInput {
  name?: string
  email: string
  phone?: string
  discountAmount?: number
}

export interface CustomerUpdateInput {
  name?: string
  phone?: string
  discountAmount?: number
}

export type ReturnType = 'return' | 'exchange'

/** One return or exchange against a single order_item — see
 * backend/src/controllers/returns.controller.js. Processed immediately on
 * creation (stock already moved by the time this exists), so there's no
 * pending/cancel state like orders have. */
export interface ReturnRecord {
  id: number
  order_id: number
  order_item_id: number
  type: ReturnType
  quantity: number
  reason: string | null
  new_product_id: number | null
  new_variant_id: number | null
  new_product_name: string | null
  new_size: string | null
  new_color_name: string | null
  new_main_image_url: string | null
  /** Snapshotted at creation — see backend/src/controllers/returns.controller.js.
   * refunded_amount is what the original line was worth (set for both
   * types); charged_amount is the replacement's own value (only nonzero
   * for 'exchange'). charged_amount - refunded_amount is the net money
   * difference: positive = customer owes more, negative = owed a refund. */
  refunded_amount: string
  charged_amount: string
  created_at: string
  // Joined in for display — the original line's own snapshot fields.
  product_name: string
  size: string | null
  color_name: string | null
  main_image_url: string | null
  unit_price: string
  order_status: OrderStatus
  customer_name: string | null
  /** NULL = recorded but the cash/replacement hasn't been confirmed as
   * actually handed over yet. Set (a timestamp) once an admin confirms it. */
  settled_at: string | null
}

/** One role's (badge/title/subtitle/button) style+position within a saved
 * banner template — mirrors BannerEditor.tsx's local TemplatePreset, kept
 * here too since it's the shape both a saved template's preset_json and the
 * "build one from the banner I just arranged" flow need to agree on. */
export interface BannerTemplatePreset {
  layout: BannerDeviceLayout
  mobileLayout?: Partial<BannerDeviceLayout>
  align?: 'left' | 'center'
  color: string
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  textShadow?: number
  backgroundColor?: string | null
  borderColor?: string | null
}

/** Only `title` is required — an admin-saved template is built from whatever
 * roles a real banner actually had (see BannerEditor.tsx's
 * buildTemplateFromElements), which might not include a badge/subtitle/
 * button at all. */
export interface BannerTemplateData {
  badge?: BannerTemplatePreset
  title: BannerTemplatePreset
  subtitle?: BannerTemplatePreset
  button?: BannerTemplatePreset
  secondaryButton?: BannerTemplatePreset
  secondaryButtonText?: string
}

export interface BannerTemplateRecord {
  id: number
  name: string
  preset_json: BannerTemplateData
  created_at: string
}

export interface ReturnCreateInput {
  orderId: number
  orderItemId: number
  type: ReturnType
  quantity: number
  reason?: string | null
  newProductId?: number
  newVariantId?: number
}

export type NotificationType = 'low_stock' | 'out_of_stock' | 'cash_cut' | 'whatsapp_order'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  body: string
  product_id: number | null
  product_name: string | null
  product_slug: string | null
  product_image_url: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse {
  rows: AppNotification[]
  unread: number
  total: number
}

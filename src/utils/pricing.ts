import type { Collection, CollectionBundlePart, Product, WholesaleTier } from '../api/types'

/** Kept in sync by hand with frontend/src/utils/pricing.ts — this whole
 * file is a straight port of that one so the POS (Punto de venta) prices a
 * multi-item sale exactly the same way the storefront cart does (wholesale
 * pooling, bundle/combo quotas, per-product collection discounts), instead
 * of pricing each line in isolation. Only this type differs from the
 * original (the admin has no shopping-cart context to import CartItem
 * from) — it declares just the fields priceCart and its helpers actually
 * read. */
export interface PricingCartItem {
  productId: number
  price: number
  quantity: number
}

export function getProductQuantities(items: PricingCartItem[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity)
  }
  return map
}

export function findTier(qty: number, tiers: WholesaleTier[]): WholesaleTier | null {
  return tiers.find((t) => qty >= t.min_qty && (t.max_qty === null || qty <= t.max_qty)) ?? null
}

/** The per-unit wholesale price for this line, only if it beats retail. */
export function getWholesalePrice(item: PricingCartItem, productQty: number, tiers: WholesaleTier[]): number | null {
  const tier = findTier(productQty, tiers)
  if (!tier) return null
  const tierPrice = parseFloat(tier.price_per_unit)
  return tierPrice < item.price ? tierPrice : null
}

/** A straight product-level sale price (percent / fixed price / amount off). */
export function getProductDiscountPrice(product: Pick<Product, 'price' | 'discount_type' | 'discount_value'>): number | null {
  if (!product.discount_type || product.discount_value === null) return null
  const price = parseFloat(product.price)
  const value = parseFloat(product.discount_value)
  if (Number.isNaN(value)) return null

  let discounted: number
  if (product.discount_type === 'percent') discounted = price * (1 - value / 100)
  else if (product.discount_type === 'fixed_price') discounted = value
  else discounted = price - value

  discounted = Math.max(0, discounted)
  return discounted < price ? discounted : null
}

export interface CollectionPriceInfo {
  collectionId: number
  collectionName: string
  pricingMode: Collection['pricing_mode']
  unitPrice: number | null
  unitMinQty: number | null
  bundleQty: number | null
  bundlePrice: number | null
  discountPrice: number | null
  bundleParts: CollectionBundlePart[]
  wholesaleCategoryId: number | null
  wholesaleAnyProduct: boolean
  /** Set only for a 'bundle' candidate scoped to one specific priced part
   * (its own "N unidades de esta categoría por $X" tier) instead of the
   * collection's flat bundle_qty/bundle_price pool — see
   * findBundlePartCandidates below. */
  bundlePartId: number | null
  /** Set only for a 'combo' candidate scoped to one specific tier (variant)
   * — see findComboTierCandidates below. Every 'combo' candidate has one
   * (combo has no flat/untiered pricing path anymore). */
  comboTierId: number | null
}

function toCollectionPriceInfo(
  collection: Collection,
  discountPrice: number | null = null,
  bundlePartId: number | null = null,
  comboTierId: number | null = null
): CollectionPriceInfo {
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    pricingMode: collection.pricing_mode,
    unitPrice: collection.unit_price ? parseFloat(collection.unit_price) : null,
    unitMinQty: collection.unit_min_qty,
    bundleQty: collection.bundle_qty,
    bundlePrice: collection.bundle_price ? parseFloat(collection.bundle_price) : null,
    discountPrice,
    bundleParts: collection.bundle_parts ?? [],
    wholesaleCategoryId: collection.wholesale_category_id,
    wholesaleAnyProduct: !!collection.wholesale_any_product,
    bundlePartId,
    comboTierId,
  }
}

/** First active collection (with pricing configured, or a per-product
 * discount) that a product belongs to. Collection pricing always wins over
 * wholesale/product discounts once found. */
export function buildCollectionPriceMap(collections: Collection[]): Map<number, CollectionPriceInfo> {
  const map = new Map<number, CollectionPriceInfo>()
  for (const collection of collections) {
    if (!collection.is_active) continue
    for (const product of collection.products) {
      if (map.has(product.id)) continue
      const discountPrice = product.collection_discount_price ? parseFloat(product.collection_discount_price) : null
      const hasPricing = collection.pricing_mode !== 'none' || discountPrice !== null
      if (!hasPricing) continue
      map.set(product.id, toCollectionPriceInfo(collection, discountPrice))
    }
  }
  return map
}

export type PriceSource = 'retail' | 'wholesale' | 'discount' | 'collection'

export interface PricedItem {
  item: PricingCartItem
  effectivePrice: number
  source: PriceSource
  collectionId?: number
  collectionName?: string
  collectionPricingMode?: Collection['pricing_mode']
  /** Which specific tier within the collection this line actually used —
   * `bundle:<partId>`, `combo:<tierId>` or `wholesale:<wholesaleTierId>`. */
  tierKey?: string | null
}

/** Resolves per-line prices for the whole cart in one pass: collection
 * pricing (unit price, per-product discount, or bundle pooling) always
 * wins; otherwise the cheapest of retail / product discount / wholesale
 * tier is used, mirroring the "never charge more than retail" rule. */
export function priceCart(
  items: PricingCartItem[],
  tiers: WholesaleTier[],
  collections: Collection[],
  productDiscounts: Map<number, number>,
  productCategories: Map<number, number | null> = new Map()
): { pricedItems: PricedItem[]; breakdown: PriceBreakdown } {
  const collectionMap = buildCollectionPriceMap(collections)
  const productQuantities = getProductQuantities(items)

  // A wholesale collection with wholesale_any_product=true doesn't need its
  // products curated by hand — every product in wholesale_category_id (or
  // the whole catalog, when that's unset) counts, falling back to this only
  // for products not explicitly listed in any priced collection.
  const wildcardWholesaleByCategory = new Map<number, CollectionPriceInfo>()
  let wildcardWholesaleAny: CollectionPriceInfo | null = null
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'wholesale' || !collection.wholesale_any_product) continue
    const info = toCollectionPriceInfo(collection)
    if (collection.wholesale_category_id != null) {
      if (!wildcardWholesaleByCategory.has(collection.wholesale_category_id)) {
        wildcardWholesaleByCategory.set(collection.wholesale_category_id, info)
      }
    } else if (!wildcardWholesaleAny) {
      wildcardWholesaleAny = info
    }
  }

  // A "cualquier producto" part (is_specific false) isn't limited to the
  // collection's curated product list either — matched the same way as
  // ProductCard/PackageBuilderContext's isInActiveCollection, so the fix
  // applies consistently at pick time and at checkout time. A "producto
  // específico" part relies purely on curation (already covered by the
  // `collectionMap` explicit lookup above), so it's excluded here. Only
  // 'unit'/'bundle' use this path now (when that collection opted into parts
  // at all, i.e. bundle_parts.length > 0) — 'combo' is always tier-scoped,
  // handled entirely by findComboTierCandidates below instead.
  function findPartsFallbacks(categoryId: number, mode: Collection['pricing_mode']): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== mode || collection.bundle_parts.length === 0) continue
      // A 'bundle' part with its own price is handled as its own scoped tier
      // by findBundlePartCandidates below, not folded into the collection's
      // flat bundle_qty/bundle_price pool.
      const matches = collection.bundle_parts.some(
        (part) => !part.is_specific && part.category_id === categoryId && (mode !== 'bundle' || part.price === null)
      )
      if (matches) result.push(toCollectionPriceInfo(collection))
    }
    return result
  }

  /** Every priced part, across every active 'bundle' collection, whose
   * category matches this item — each one is its own independent tier ("N
   * unidades de esta categoría por $X"), so a single category can surface
   * several simultaneously (e.g. a 2-for-$800 tier and a 3-for-$1000 tier on
   * the same "Gorras" category); the best-price-wins loop below picks
   * whichever currently applies at the lowest price. */
  function findBundlePartCandidates(item: PricingCartItem, categoryId: number): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
      for (const part of collection.bundle_parts) {
        if (part.price === null || part.category_id !== categoryId) continue
        if (part.is_specific) {
          const curatedIds = new Set(collection.products.map((p) => p.id))
          if (!curatedIds.has(item.productId)) continue
        }
        result.push(toCollectionPriceInfo(collection, null, part.id))
      }
    }
    return result
  }

  /** Every combo tier (variant), across every active 'combo' collection,
   * with a part matching this item's category — a collection with several
   * tiers on the same category (e.g. a 2-for-$1380 and a 3-for-$1970 combo,
   * both needing "Playeras") surfaces one candidate per tier, and the
   * best-price-wins loop below picks whichever currently applies cheapest. */
  function findComboTierCandidates(item: PricingCartItem, categoryId: number): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== 'combo') continue
      const curatedIds = new Set(collection.products.map((p) => p.id))
      for (const tier of collection.combo_tiers) {
        const matches = collection.bundle_parts.some((part) => {
          if (part.combo_tier_id !== tier.id || part.category_id !== categoryId) return false
          if (part.is_specific) return curatedIds.has(item.productId)
          return true
        })
        if (matches) result.push(toCollectionPriceInfo(collection, null, null, tier.id))
      }
    }
    return result
  }

  /** Every active collection this item could plausibly be priced under —
   * a product can genuinely qualify for several at once (e.g. a wildcard
   * combo AND a wildcard unit-price deal AND wholesale, simultaneously), and
   * whichever one isn't complete/met yet shouldn't shadow one that is. The
   * pricing pass below tries each and keeps whichever actually applies at
   * the lowest price, instead of committing to just the first match. */
  function resolveCollectionCandidates(item: PricingCartItem): CollectionPriceInfo[] {
    const candidates: CollectionPriceInfo[] = []
    const seen = new Set<string>()
    function add(info: CollectionPriceInfo | null | undefined) {
      if (!info) return
      const key = `${info.collectionId}:${info.bundlePartId ?? ''}:${info.comboTierId ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      candidates.push(info)
    }
    add(collectionMap.get(item.productId))
    const categoryId = productCategories.get(item.productId)
    if (categoryId != null) {
      add(wildcardWholesaleByCategory.get(categoryId))
    }
    add(wildcardWholesaleAny)
    if (categoryId != null) {
      findPartsFallbacks(categoryId, 'unit').forEach(add)
      findPartsFallbacks(categoryId, 'bundle').forEach(add)
      findBundlePartCandidates(item, categoryId).forEach(add)
      findComboTierCandidates(item, categoryId).forEach(add)
    }
    return candidates
  }

  /** Whether this item matches a part explicitly flagged as a free gift on
   * its resolved collection — used by 'unit'/'bundle' pricing (combo has its
   * own bucket system below that already prices gift parts at 0). */
  function isGiftMatch(categoryId: number, info: CollectionPriceInfo): boolean {
    return info.bundleParts.some((part) => part.is_gift && part.category_id === categoryId)
  }

  // A category with its own tiers uses only those; everything else falls
  // back to the tiers left with no category (category_id === null).
  const fallbackTiers = tiers.filter((t) => t.category_id === null)
  const tiersByCategory = new Map<number, WholesaleTier[]>()
  for (const t of tiers) {
    if (t.category_id === null) continue
    if (!tiersByCategory.has(t.category_id)) tiersByCategory.set(t.category_id, [])
    tiersByCategory.get(t.category_id)!.push(t)
  }
  function tiersFor(productId: number): WholesaleTier[] {
    const categoryId = productCategories.get(productId)
    if (categoryId != null && tiersByCategory.has(categoryId)) return tiersByCategory.get(categoryId)!
    return fallbackTiers
  }

  // GLOBAL WHOLESALE POOL: normally each 'wholesale' collection pools only
  // its own matching items (see wholesaleCollectionPrice further below) —
  // but when 2+ wholesale-configured categories (e.g. playeras, gorras)
  // have items in the SAME cart, their quantities combine into ONE shared
  // total, and EACH category then looks up its OWN tier for that shared
  // total (its own min_qty/max_qty brackets, same tier list as always —
  // only the qty fed into the lookup changes). With 0 or 1 participating
  // categories this collapses to exactly today's per-collection pooling
  // below, so the common case is unaffected. A collection with
  // wholesale_category_id === null (the whole-catalog wildcard / shared
  // fallback tiers) doesn't participate — it already spans everything, so
  // there's no second category to combine it with; it keeps using the
  // per-collection pooling below.
  //
  // Each item is attributed to at most ONE wholesale category — whichever
  // wholesale candidate resolveCollectionCandidates would try first (curated
  // collection membership beats a wildcard match, same precedence used
  // everywhere else in this file) — so an item that happens to qualify for
  // more than one wholesale collection is never double-counted into two
  // categories' totals.
  function primaryWholesaleCandidate(item: PricingCartItem): CollectionPriceInfo | null {
    return resolveCollectionCandidates(item).find((c) => c.pricingMode === 'wholesale' && c.wholesaleCategoryId != null) ?? null
  }

  const globalWholesaleCategoryIds = new Set<number>()
  for (const collection of collections) {
    if (collection.is_active && collection.pricing_mode === 'wholesale' && collection.wholesale_category_id != null) {
      globalWholesaleCategoryIds.add(collection.wholesale_category_id)
    }
  }

  const wholesaleCategoryQty = new Map<number, number>()
  for (const item of items) {
    const candidate = primaryWholesaleCandidate(item)
    const categoryId = candidate?.wholesaleCategoryId ?? null
    if (categoryId == null || !globalWholesaleCategoryIds.has(categoryId)) continue
    wholesaleCategoryQty.set(categoryId, (wholesaleCategoryQty.get(categoryId) ?? 0) + item.quantity)
  }

  const participatingCategoryIds = [...globalWholesaleCategoryIds].filter((id) => (wholesaleCategoryQty.get(id) ?? 0) > 0)

  // Null unless 2+ categories actually have wholesale-eligible items in the
  // SAME cart right now — a single participating category (or none) means
  // there's nothing to combine, so every downstream check below is a no-op
  // and today's per-collection pooling is all that ever runs.
  const combinedWholesaleQty =
    participatingCategoryIds.length >= 2
      ? participatingCategoryIds.reduce((sum, id) => sum + wholesaleCategoryQty.get(id)!, 0)
      : null

  // Per participating category, the tier the COMBINED total unlocks — null
  // means that category's own lowest min_qty still isn't reached even at
  // the combined total, so it falls back to normal pricing exactly as if
  // the global pool never triggered for it (each category's eligibility is
  // independent even though the qty fed into the lookup is shared).
  const globalWholesaleTierByCategory = new Map<number, WholesaleTier | null>()
  if (combinedWholesaleQty !== null) {
    for (const categoryId of participatingCategoryIds) {
      globalWholesaleTierByCategory.set(categoryId, findTier(combinedWholesaleQty, tiersByCategory.get(categoryId) ?? fallbackTiers))
    }
  }

  /** Non-null only for an item whose global-pool category resolved to a
   * tier above — its price is FORCED by the shared pool, unconditionally
   * bypassing whatever bundle/unit/combo price it might otherwise have won
   * on price alone (see the pricedItems loop below) — except it still never
   * charges more than the item's own retail price (same "never beat
   * retail" rule the single-category wholesale path already enforces), an
   * explicit admin-set per-product discount price is left alone (that's a
   * deliberate manual pin, not a pricing mode competing on price), and a
   * unit that could be a free gift part of some bundle/combo in its
   * category is left alone too (checked broadly — if this item could be a
   * gift match for ANY of its candidate collections, it skips the override
   * and falls through to the normal loop below, which already handles the
   * real paid/free split correctly). */
  function globalWholesaleOverride(item: PricingCartItem): { info: CollectionPriceInfo; tier: WholesaleTier } | null {
    if (combinedWholesaleQty === null) return null
    if (collectionMap.get(item.productId)?.discountPrice != null) return null
    const categoryId = productCategories.get(item.productId)
    if (categoryId == null) return null
    if (resolveCollectionCandidates(item).some((c) => isGiftMatch(categoryId, c))) return null
    const info = primaryWholesaleCandidate(item)
    if (!info || info.wholesaleCategoryId == null) return null
    const tier = globalWholesaleTierByCategory.get(info.wholesaleCategoryId)
    if (!tier) return null
    const tierPrice = parseFloat(tier.price_per_unit)
    if (tierPrice >= item.price) return null
    return { info, tier }
  }

  // Pre-compute bundle consumption per collection so mixed-product bundles
  // are shared fairly across the collection's cart lines, in item order.
  // Iterated straight from `collections` (not collectionMap) so a
  // parts-driven bundle with no curated products still gets a pool
  // computed, and totalQty is pooled via resolveCollectionCandidates so parts
  // (wildcard) matches count too, not just explicitly curated ones. A part
  // flagged "gift" reserves up to 1 of the completed bundle's slots to
  // price at 0 instead of splitting bundlePrice across it like the rest.
  const bundleRemaining = new Map<number, number>()
  const bundleGiftRemaining = new Map<number, number>()
  const bundleGiftPartsCount = new Map<number, number>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
    if (!collection.bundle_qty || !collection.bundle_price) continue
    if (bundleRemaining.has(collection.id)) continue
    const info = toCollectionPriceInfo(collection)
    const giftPartsCount = info.bundleParts.filter((p) => p.is_gift).length
    let totalQty = 0
    for (const item of items) {
      if (globalWholesaleOverride(item)) continue
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    const bundleUnits = Math.floor(totalQty / info.bundleQty!) * info.bundleQty!
    const giftUnits = Math.min(giftPartsCount, bundleUnits)
    bundleRemaining.set(collection.id, bundleUnits - giftUnits)
    bundleGiftRemaining.set(collection.id, giftUnits)
    bundleGiftPartsCount.set(collection.id, giftPartsCount)
  }

  // Each priced bundle part is its own independent tier pool — "N unidades
  // de esta categoría por $X" — separate from the collection-level
  // bundleRemaining above (which only ever covers parts with no price of
  // their own, or collections with no parts at all). Keyed by part id since
  // several priced parts can share the same category (different tiers).
  const bundlePartBuckets = new Map<number, ComboBucket>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
    for (const part of collection.bundle_parts) {
      if (part.price === null || bundlePartBuckets.has(part.id)) continue
      const curatedIds = new Set(collection.products.map((p) => p.id))
      let have = 0
      for (const item of items) {
        if (globalWholesaleOverride(item)) continue
        const categoryId = productCategories.get(item.productId)
        if (categoryId !== part.category_id) continue
        if (part.is_specific && !curatedIds.has(item.productId)) continue
        have += item.quantity
      }
      const completeSets = part.required_qty > 0 ? Math.floor(have / part.required_qty) : 0
      const totalUnits = completeSets * part.required_qty
      const unitPrice = part.is_gift ? 0 : parseFloat(part.price) / part.required_qty
      bundlePartBuckets.set(part.id, { remaining: totalUnits, price: unitPrice })
    }
  }

  // A 'unit' collection with a minimum quantity only unlocks its price once
  // the cart holds at least that many units pooled across the collection's
  // products (mirrors how wholesale tiers gate on accumulated quantity).
  // Same iterate-from-`collections` + resolveCollectionCandidates pooling as
  // bundle above, for the same reason (parts-driven wildcard matching).
  const unitQualifies = new Map<number, boolean>()
  const unitGiftRemaining = new Map<number, number>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'unit' || !collection.unit_price) continue
    if (unitQualifies.has(collection.id)) continue
    const info = toCollectionPriceInfo(collection)
    unitGiftRemaining.set(collection.id, info.bundleParts.filter((p) => p.is_gift).length)
    if (!info.unitMinQty || info.unitMinQty <= 1) {
      unitQualifies.set(collection.id, true)
      continue
    }
    let totalQty = 0
    for (const item of items) {
      if (globalWholesaleOverride(item)) continue
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    unitQualifies.set(collection.id, totalQty >= info.unitMinQty)
  }

  // 'wholesale' collections have no price of their own — the pooled quantity
  // of the collection's products in the cart (mixed products count together,
  // unlike the per-product wholesale tiers below) is looked up against
  // wholesale_tiers rows for the collection's own wholesale_category_id (or
  // the fallback, no-category, rows when that's unset). Iterated straight
  // from `collections` (not collectionMap) so a wildcard collection with no
  // curated products still gets a pooled price computed.
  const wholesaleCollectionPrice = new Map<number, number | null>()
  const wholesaleTierIdByCollection = new Map<number, number | null>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'wholesale') continue
    if (wholesaleCollectionPrice.has(collection.id)) continue
    let totalQty = 0
    for (const item of items) {
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    const relevantTiers =
      collection.wholesale_category_id != null
        ? (tiersByCategory.get(collection.wholesale_category_id) ?? fallbackTiers)
        : fallbackTiers
    const tier = findTier(totalQty, relevantTiers)
    wholesaleCollectionPrice.set(collection.id, tier ? parseFloat(tier.price_per_unit) : null)
    wholesaleTierIdByCollection.set(collection.id, tier?.id ?? null)
  }

  // 'combo' collections require per-category quotas (e.g. 2 Playeras + 2
  // Gorras, maybe with a gift quota) to be met before a tier's price
  // applies. A "producto específico" part only counts products actually
  // curated into the collection (for its category) instead of any product
  // in that category. Every combo collection has at least one tier (see
  // CollectionComboTier) — for each tier, group its own parts by category
  // into ordered price buckets (gift parts price at 0), scaled to however
  // many complete sets the cart currently holds for THAT tier — items are
  // priced by draining the buckets they qualify for, in cart order, same
  // mutate-as-you-go pattern as bundleRemaining. Keyed by tier id (not
  // collection id) so a collection with several tiers on the same category
  // (e.g. 2-for-$1380 and 3-for-$1970, both needing Playeras) keeps each
  // tier's pool independent.
  interface ComboBucket {
    remaining: number
    price: number
  }
  const comboBucketsByTier = new Map<number, Map<number, ComboBucket[]>>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'combo') continue
    const curatedIds = new Set(collection.products.map((p) => p.id))

    for (const tier of collection.combo_tiers) {
      if (comboBucketsByTier.has(tier.id)) continue
      const tierParts = collection.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
      if (tierParts.length === 0) continue

      const tierPrice = parseFloat(tier.price)
      const paidQtyPerSet = tierParts.filter((p) => !p.is_gift).reduce((sum, p) => sum + p.required_qty, 0)
      if (paidQtyPerSet === 0) continue
      const paidUnitPrice = tierPrice / paidQtyPerSet

      // "Have" quantity per part: a "específico" part only counts curated
      // products; a "cualquier producto" part counts the whole category
      // (this can overlap with a específico part's count, but that only
      // ever makes completeSets a conservative underestimate, never an
      // overcharge, since actual allocation below still respects each
      // bucket's own scope).
      let completeSets = Infinity
      for (const part of tierParts) {
        let have = 0
        for (const item of items) {
          if (globalWholesaleOverride(item)) continue
          if (!resolveCollectionCandidates(item).some((c) => c.comboTierId === tier.id)) continue
          const categoryId = productCategories.get(item.productId)
          if (categoryId !== part.category_id) continue
          if (part.is_specific && !curatedIds.has(item.productId)) continue
          have += item.quantity
        }
        completeSets = Math.min(completeSets, Math.floor(have / part.required_qty))
      }
      if (!Number.isFinite(completeSets)) completeSets = 0

      const byCategory = new Map<number, ComboBucket[]>()
      for (const part of tierParts) {
        const list = byCategory.get(part.category_id) ?? []
        list.push({
          remaining: part.required_qty * completeSets,
          price: part.is_gift ? 0 : paidUnitPrice,
        })
        byCategory.set(part.category_id, list)
      }
      comboBucketsByTier.set(tier.id, byCategory)
    }
  }

  /** Drains `quantity` units across `buckets` in order (mutating their
   * remaining counts), pricing any leftover at `fallbackPrice`. Returns the
   * blended per-unit price for the whole line. */
  function consumeBuckets(quantity: number, buckets: ComboBucket[], fallbackPrice: number): number {
    let qtyLeft = quantity
    let totalCost = 0
    for (const bucket of buckets) {
      if (qtyLeft <= 0) break
      if (bucket.remaining <= 0) continue
      const take = Math.min(qtyLeft, bucket.remaining)
      totalCost += take * bucket.price
      bucket.remaining -= take
      qtyLeft -= take
    }
    if (qtyLeft > 0) totalCost += qtyLeft * fallbackPrice
    return totalCost / quantity
  }

  /** Prices `item` as if it belonged to `info`, WITHOUT committing any pool
   * consumption yet — returns null if this candidate doesn't actually apply
   * (e.g. a combo whose quotas aren't met). `commit()` performs the real
   * drain against the live pools; call it only for whichever candidate ends
   * up winning, never for ones only used to compare prices. */
  function tryPriceForCandidate(item: PricingCartItem, info: CollectionPriceInfo): { price: number; commit: () => void } | null {
    if (info.discountPrice !== null) {
      return { price: info.discountPrice, commit: () => {} }
    }

    if (info.pricingMode === 'unit' && info.unitPrice !== null && unitQualifies.get(info.collectionId)) {
      const categoryId = productCategories.get(item.productId)
      const isGift = categoryId != null && isGiftMatch(categoryId, info)
      if (!isGift) return { price: info.unitPrice, commit: () => {} }
      const trialBuckets: ComboBucket[] = [{ remaining: unitGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
      const price = consumeBuckets(item.quantity, trialBuckets, info.unitPrice)
      return {
        price,
        commit: () => {
          const liveBuckets: ComboBucket[] = [{ remaining: unitGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
          consumeBuckets(item.quantity, liveBuckets, info.unitPrice!)
          unitGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
        },
      }
    }

    if (info.pricingMode === 'bundle' && info.bundlePartId != null) {
      const buildBucket = (): ComboBucket[] => {
        const b = bundlePartBuckets.get(info.bundlePartId!)
        return b ? [{ ...b }] : []
      }
      const trialBuckets = buildBucket()
      if (!trialBuckets.some((b) => b.remaining > 0)) return null
      const price = consumeBuckets(item.quantity, trialBuckets, item.price)
      return {
        price,
        commit: () => {
          const liveBuckets = buildBucket()
          if (liveBuckets.length === 0) return
          consumeBuckets(item.quantity, liveBuckets, item.price)
          bundlePartBuckets.set(info.bundlePartId!, liveBuckets[0])
        },
      }
    }

    if (info.pricingMode === 'bundle' && info.bundleQty && info.bundlePrice) {
      const categoryId = productCategories.get(item.productId)
      const isGift = categoryId != null && isGiftMatch(categoryId, info)
      const giftPartsCount = bundleGiftPartsCount.get(info.collectionId) ?? 0
      const paidQtyPerSet = Math.max(1, info.bundleQty - giftPartsCount)
      const bundleUnitPrice = info.bundlePrice / paidQtyPerSet
      const buildBuckets = (): ComboBucket[] => {
        const list: ComboBucket[] = []
        if (isGift) list.push({ remaining: bundleGiftRemaining.get(info.collectionId) ?? 0, price: 0 })
        list.push({ remaining: bundleRemaining.get(info.collectionId) ?? 0, price: bundleUnitPrice })
        return list
      }
      const trialBuckets = buildBuckets()
      if (!trialBuckets.some((b) => b.remaining > 0)) return null
      const price = consumeBuckets(item.quantity, trialBuckets, item.price)
      return {
        price,
        commit: () => {
          const liveBuckets = buildBuckets()
          consumeBuckets(item.quantity, liveBuckets, item.price)
          if (isGift) bundleGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
          bundleRemaining.set(info.collectionId, liveBuckets[isGift ? 1 : 0].remaining)
        },
      }
    }

    if (info.pricingMode === 'wholesale') {
      const tierPrice = wholesaleCollectionPrice.get(info.collectionId) ?? null
      if (tierPrice === null || tierPrice >= item.price) return null
      return { price: tierPrice, commit: () => {} }
    }

    if (info.pricingMode === 'combo') {
      if (info.comboTierId == null) return null
      const categoryId = productCategories.get(item.productId)
      const cloneBuckets = (): ComboBucket[] | undefined => {
        const source = categoryId != null ? comboBucketsByTier.get(info.comboTierId!)?.get(categoryId) : undefined
        return source?.map((b) => ({ ...b }))
      }
      const trialBuckets = cloneBuckets()
      const eligibleRemaining = trialBuckets?.reduce((sum, b) => sum + b.remaining, 0) ?? 0
      if (!trialBuckets || eligibleRemaining <= 0) return null
      const price = consumeBuckets(item.quantity, trialBuckets, item.price)
      return {
        price,
        commit: () => {
          const liveBuckets = cloneBuckets()
          if (!liveBuckets) return
          consumeBuckets(item.quantity, liveBuckets, item.price)
          const source = comboBucketsByTier.get(info.comboTierId!)?.get(categoryId!)
          if (source) for (let i = 0; i < source.length; i++) source[i].remaining = liveBuckets[i].remaining
        },
      }
    }

    return null
  }

  const pricedItems: PricedItem[] = items.map((item) => {
    // GLOBAL WHOLESALE POOL override: once 2+ wholesale categories combine
    // to reach a bracket, that bracket's per-unit price is forced for this
    // category's items — unconditionally, bypassing the cheapest-candidate
    // loop below (a customer who reaches "6 a 9 piezas" combining
    // playeras+gorras gets wholesale pricing on both, even if a bundle
    // would otherwise have been cheaper for one of them) — except it still
    // never beats retail, never overrides a manual discount, and never
    // touches a gift-eligible item (see globalWholesaleOverride above).
    const globalOverride = globalWholesaleOverride(item)
    if (globalOverride) {
      return {
        item,
        effectivePrice: parseFloat(globalOverride.tier.price_per_unit),
        source: 'collection',
        collectionId: globalOverride.info.collectionId,
        collectionName: globalOverride.info.collectionName,
        collectionPricingMode: 'wholesale',
        tierKey: `wholesale:${globalOverride.tier.id}`,
      }
    }

    // Try every collection this item could qualify for and keep whichever
    // actually applies at the lowest price — a combo that isn't complete
    // yet (or a wholesale tier that isn't reached) must never shadow a
    // different, currently-applicable deal on the same product. An explicit
    // admin-set discount price is authoritative and short-circuits the rest.
    let best: { price: number; commit: () => void; info: CollectionPriceInfo } | null = null
    for (const info of resolveCollectionCandidates(item)) {
      const result = tryPriceForCandidate(item, info)
      if (!result) continue
      if (!best || result.price < best.price) best = { ...result, info }
      if (info.discountPrice !== null) break
    }

    if (best) {
      best.commit()
      let tierKey: string | null = null
      if (best.info.bundlePartId != null) tierKey = `bundle:${best.info.bundlePartId}`
      else if (best.info.comboTierId != null) tierKey = `combo:${best.info.comboTierId}`
      else if (best.info.pricingMode === 'wholesale') {
        const wholesaleTierId = wholesaleTierIdByCollection.get(best.info.collectionId)
        tierKey = wholesaleTierId != null ? `wholesale:${wholesaleTierId}` : null
      }
      return {
        item,
        effectivePrice: best.price,
        source: 'collection',
        collectionId: best.info.collectionId,
        collectionName: best.info.collectionName,
        collectionPricingMode: best.info.pricingMode,
        tierKey,
      }
    }

    const productQty = productQuantities.get(item.productId) ?? item.quantity
    const wholesalePrice = getWholesalePrice(item, productQty, tiersFor(item.productId))
    const discountPrice = productDiscounts.get(item.productId) ?? null

    if (discountPrice !== null && (wholesalePrice === null || discountPrice <= wholesalePrice)) {
      return { item, effectivePrice: discountPrice, source: 'discount' }
    }
    if (wholesalePrice !== null) {
      return { item, effectivePrice: wholesalePrice, source: 'wholesale' }
    }

    return { item, effectivePrice: item.price, source: 'retail' }
  })

  return { pricedItems, breakdown: buildBreakdown(pricedItems) }
}

export interface PriceBreakdown {
  subtotal: number
  wholesaleSavings: number
  discountSavings: number
  collectionSavings: number
  total: number
}

function buildBreakdown(pricedItems: PricedItem[]): PriceBreakdown {
  let subtotal = 0
  let wholesaleSavings = 0
  let discountSavings = 0
  let collectionSavings = 0

  for (const { item, effectivePrice, source } of pricedItems) {
    subtotal += item.price * item.quantity
    const savings = (item.price - effectivePrice) * item.quantity
    if (source === 'wholesale') wholesaleSavings += savings
    if (source === 'discount') discountSavings += savings
    if (source === 'collection') collectionSavings += savings
  }

  return {
    subtotal,
    wholesaleSavings,
    discountSavings,
    collectionSavings,
    total: subtotal - wholesaleSavings - discountSavings - collectionSavings,
  }
}

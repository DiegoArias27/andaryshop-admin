import type { Product } from '../api/types'

export function getDiscountedPrice(product: Pick<Product, 'price' | 'discount_type' | 'discount_value'>): number | null {
  if (!product.discount_type || product.discount_value === null) return null
  const price = parseFloat(product.price)
  const value = parseFloat(product.discount_value)
  if (Number.isNaN(value)) return null

  let discounted: number
  if (product.discount_type === 'percent') discounted = price * (1 - value / 100)
  else if (product.discount_type === 'fixed_price') discounted = value
  else discounted = price - value

  return Math.max(0, discounted)
}

export type ProductPriceInfo =
  | { type: 'none' }
  | { type: 'discount'; price: number; collectionName: string | null; collectionId: number | null }
  | { type: 'bundle'; collectionName: string; collectionId: number }

/** Resolves what price (if any) to display for a product anywhere in the
 * admin: an active collection's pricing always wins (a per-product discount
 * or a flat unit price). A bundle deal doesn't count toward that priority —
 * it has no fixed unit price of its own, so the product's own sale price is
 * shown instead when it has one, and the bundle only surfaces as a
 * membership tag when there's nothing else to show. */
export function getProductPriceInfo(product: Product): ProductPriceInfo {
  const retail = parseFloat(product.price)
  let bundleFallback: ProductPriceInfo | null = null

  for (const c of product.collections ?? []) {
    if (c.discount_price) {
      const price = Number(c.discount_price)
      if (price < retail) return { type: 'discount', price, collectionName: c.name, collectionId: c.id }
    }
    if (c.pricing_mode === 'unit' && c.unit_price) {
      const price = Number(c.unit_price)
      if (price < retail) return { type: 'discount', price, collectionName: c.name, collectionId: c.id }
    }
    if (c.pricing_mode === 'bundle' && c.bundle_qty && c.bundle_price && !bundleFallback) {
      bundleFallback = { type: 'bundle', collectionName: c.name, collectionId: c.id }
    }
  }

  const discounted = getDiscountedPrice(product)
  if (discounted !== null) return { type: 'discount', price: discounted, collectionName: null, collectionId: null }

  return bundleFallback ?? { type: 'none' }
}

import type { LightboxImage } from '../components/ImageLightbox'
import type { Product } from '../api/types'

/** Every photo a product has, not just whichever single image a given
 * table/card happens to show — clicking a thumbnail anywhere in admin
 * should open the whole gallery. Falls back to just main_image_url for a
 * product whose gallery rows haven't loaded/exist for some reason. */
export function productGallery(p: Product): LightboxImage[] {
  if (p.images.length > 0) {
    return [...p.images].sort((a, b) => a.sort_order - b.sort_order).map((img) => ({ url: img.image_url }))
  }
  return p.main_image_url ? [{ url: p.main_image_url }] : []
}

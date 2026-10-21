import type { AppNotification } from '../api/types'

/** Where clicking a notification should take the admin — a cash-cut alert
 * goes to Cortes, a WhatsApp order goes to Ventas pre-filtered to exactly
 * that (pending, WhatsApp), and a stock alert goes to that product's editor.
 * null means the notification isn't actionable (shouldn't normally happen,
 * since every current type sets one of these). */
export function notificationLink(n: AppNotification): string | null {
  if (n.type === 'cash_cut') return '/cortes'
  if (n.type === 'whatsapp_order') return '/pedidos?status=pending&source=whatsapp'
  if (n.product_id != null) return `/productos/${n.product_id}`
  return null
}

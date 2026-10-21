import { createContext } from 'react'
import type { Customer, PaymentMethod } from '../api/types'

/** One line in a Punto de Venta sale, in progress or held — moved here
 * (instead of living only in StockLookup.tsx) so a held sale can be typed
 * and passed around without StockLookup.tsx and the context importing from
 * each other in a circle. */
export interface SaleLine {
  key: string
  productId: number | null
  variantId: number | null
  name: string
  size: string | null
  colorName: string | null
  colorHex: string | null
  image: string | null
  unitPrice: number
  overridePrice: number | null
  discountAmount: number
  quantity: number
  isGift: boolean
}

/** Everything that makes up "the sale currently being rung up" — bundled so
 * it can be stashed away ("Poner en espera") and picked back up later, or by
 * a different visit to Punto de Venta, without losing any of it. */
export interface HeldSale {
  id: string
  /** Shown in the floating "ventas en espera" list — the first line's
   * product name, or a generic fallback for an empty/unusual sale. */
  label: string
  saleLines: SaleLine[]
  saleNotes: string
  paymentMethod: PaymentMethod
  totalOverride: number | null
  customer: Customer | null
  createdAt: number
}

export interface PosSessionContextValue {
  heldSales: HeldSale[]
  holdSale: (sale: Omit<HeldSale, 'id' | 'createdAt'>) => void
  /** Moves a held sale out of the list and stages it as `pendingResume` —
   * StockLookup.tsx picks that up in an effect and loads it into its own
   * local state, then calls clearPendingResume(). Two steps (instead of
   * resumeSale just returning the value) because the floating widget that
   * calls this lives outside StockLookup.tsx entirely (in AdminLayout), so
   * there's no local state on this end to hand the sale back to directly. */
  requestResume: (id: string) => void
  pendingResume: HeldSale | null
  clearPendingResume: () => void
  discardSale: (id: string) => void
}

export const PosSessionContext = createContext<PosSessionContextValue | null>(null)

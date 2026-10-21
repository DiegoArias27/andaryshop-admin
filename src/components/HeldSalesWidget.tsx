import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosSession } from '../hooks/usePosSession'
import { formatPrice } from '../utils/currency'
import { CartIcon, TrashIcon } from './icons'

/** A rough preview total for the held-sales list — doesn't need the full
 * collection/wholesale-aware pricing engine StockLookup.tsx uses live, just
 * enough for the cashier to recognize which sale is which at a glance. */
function previewTotal(sale: { saleLines: { unitPrice: number; overridePrice: number | null; discountAmount: number; quantity: number; isGift: boolean }[]; totalOverride: number | null }): number {
  if (sale.totalOverride != null) return sale.totalOverride
  return sale.saleLines.reduce(
    (sum, l) => (l.isGift ? sum : sum + Math.max(0, (l.overridePrice ?? l.unitPrice) - l.discountAmount) * l.quantity),
    0
  )
}

/** Visible on every admin page (not just Punto de Venta) so stepping away
 * to check something in Productos never risks losing a sale mid-ring-up —
 * only renders once there's actually at least one sale on hold. */
export default function HeldSalesWidget() {
  const { heldSales, requestResume, discardSale } = usePosSession()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (heldSales.length === 0) return null

  function handleResume(id: string) {
    requestResume(id)
    setOpen(false)
    navigate('/stock')
  }

  return (
    <div className="held-sales-widget">
      {open && (
        <div className="held-sales-widget__panel">
          <h3>Ventas en espera</h3>
          <ul>
            {heldSales.map((sale) => (
              <li key={sale.id}>
                <div>
                  <strong>{sale.label}</strong>
                  <span>{formatPrice(previewTotal(sale))}</span>
                </div>
                <div className="held-sales-widget__actions">
                  <button type="button" className="btn btn--accent btn--sm" onClick={() => handleResume(sale.id)}>
                    Reanudar
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--ghost"
                    onClick={() => discardSale(sale.id)}
                    aria-label="Descartar venta en espera"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="held-sales-widget__button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ventas en espera"
      >
        <CartIcon />
        <span className="held-sales-widget__badge">{heldSales.length}</span>
      </button>
    </div>
  )
}

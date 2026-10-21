import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { ReturnRecord } from '../api/types'
import { formatPrice } from '../utils/currency'
import { QUICK_RANGE_LABELS, computeQuickRange, type QuickRange } from '../utils/dateRanges'
import LoadingState from '../components/LoadingState'
import ImageLightbox, { type LightboxImage } from '../components/ImageLightbox'

const DEFAULT_WEEK = computeQuickRange('this_week')!

/** Positive = the customer owes more (charged more than what was
 * refunded); negative = they're owed money back; zero for a plain return
 * (nothing charged) or an even-price exchange. */
function netDiff(r: ReturnRecord): number {
  return Number(r.charged_amount) - Number(r.refunded_amount)
}

/** Whether this specific record involves no actual money changing hands —
 * true for a return, refunded_amount is always real cash, so this only ever
 * applies to an even-price exchange (a straight product swap). */
function isMoneyless(r: ReturnRecord): boolean {
  return r.type === 'exchange' && Math.abs(netDiff(r)) < 0.01
}

/** Actual cash paid back to the customer — a plain return's full
 * refunded_amount, or (for an exchange) only the portion by which the
 * replacement was cheaper. refunded_amount alone overstates this for an
 * exchange: per ReturnRecord's own doc, it's just the ORIGINAL line's
 * snapshotted value (used together with charged_amount to compute the
 * price difference), not money that was actually handed over. */
function actualCashRefunded(r: ReturnRecord): number {
  if (r.type === 'return') return Number(r.refunded_amount)
  const diff = netDiff(r)
  return diff < 0 ? -diff : 0
}

function moneyDiffLabel(r: ReturnRecord): string {
  if (r.type === 'return') return `Reembolso: ${formatPrice(r.refunded_amount)}`
  if (isMoneyless(r)) return 'Cambio sin diferencia de precio'
  const diff = netDiff(r)
  return diff > 0 ? `El cliente debe pagar ${formatPrice(diff)} más` : `Se le debe reembolsar ${formatPrice(-diff)}`
}

function ReturnCard({ r, onToggleSettled }: { r: ReturnRecord; onToggleSettled: (r: ReturnRecord) => void }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const moneyless = isMoneyless(r)

  const rawImages: (LightboxImage | null)[] = [
    r.main_image_url ? { url: r.main_image_url, label: r.product_name } : null,
    r.type === 'exchange' && r.new_main_image_url ? { url: r.new_main_image_url, label: r.new_product_name ?? undefined } : null,
  ]
  const images = rawImages.filter((img): img is LightboxImage => !!img)

  return (
    <div className="order-card">
      <div className="order-card__header">
        <div>
          <span className={`order-status ${r.type === 'exchange' ? 'order-status--inquiry' : 'order-status--returned'}`}>
            {r.type === 'exchange' ? 'Cambio' : 'Devolución'}
          </span>
          <strong className="order-card__id">Venta #{r.order_id}</strong>
          <span className="order-card__date">{new Date(r.created_at).toLocaleString('es-MX')}</span>
        </div>
      </div>
      {r.customer_name && <p className="order-card__customer">{r.customer_name}</p>}
      <ul className="order-card__items">
        <li className="order-card__item">
          {r.main_image_url ? (
            <button type="button" className="order-card__item-thumb-btn" onClick={() => setViewerIndex(0)} aria-label="Ver imagen en grande">
              <img src={r.main_image_url} alt="" />
            </button>
          ) : (
            <div className="order-card__item-thumb" />
          )}
          <span className="order-card__item-info">
            {r.product_name}
            {r.size && ` — Talla ${r.size}`}
            {r.color_name && `, ${r.color_name}`}
          </span>
          <span className="order-card__item-qty">x{r.quantity}</span>
          <span className="order-card__item-price">{formatPrice(Number(r.unit_price) * r.quantity)}</span>
        </li>
        {r.type === 'exchange' && (
          <li className="order-card__item">
            {r.new_main_image_url ? (
              <button
                type="button"
                className="order-card__item-thumb-btn"
                onClick={() => setViewerIndex(images.findIndex((img) => img.url === r.new_main_image_url))}
                aria-label="Ver imagen en grande"
              >
                <img src={r.new_main_image_url} alt="" />
              </button>
            ) : (
              <div className="order-card__item-thumb" />
            )}
            <span className="order-card__item-info">
              Cambiado por: {r.new_product_name}
              {r.new_size && ` — Talla ${r.new_size}`}
              {r.new_color_name && `, ${r.new_color_name}`}
            </span>
            <span className="order-card__item-price">{formatPrice(r.charged_amount)}</span>
          </li>
        )}
      </ul>
      <p className={`order-card__money-diff ${netDiff(r) < 0 ? 'order-card__money-diff--owed' : netDiff(r) > 0 ? 'order-card__money-diff--charge' : ''}`}>
        {moneyDiffLabel(r)}
      </p>
      {r.reason && <p className="order-card__notes">Motivo: {r.reason}</p>}
      <div className="order-card__settle-row">
        <span className={`order-card__settle-badge ${r.settled_at ? 'order-card__settle-badge--done' : 'order-card__settle-badge--pending'}`}>
          {r.settled_at
            ? `${moneyless ? 'Cambio entregado' : 'Dinero entregado'} · ${new Date(r.settled_at).toLocaleString('es-MX')}`
            : moneyless
              ? 'Pendiente de confirmar cambio'
              : 'Pendiente de confirmar entrega'}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onToggleSettled(r)}>
          {r.settled_at ? 'Deshacer' : moneyless ? 'Confirmar cambio de producto' : 'Confirmar entrega de dinero'}
        </button>
      </div>

      {viewerIndex !== null && images.length > 0 && (
        <ImageLightbox images={images} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  )
}

export default function Returns() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Arriving from a sale's "Ver devolución/cambio" link — that return might
  // be well outside whatever date range happens to be selected, so this
  // takes over from the from/to filter entirely until cleared.
  const orderFilter = searchParams.get('order')
  const [from, setFrom] = useState(DEFAULT_WEEK.from)
  const [to, setTo] = useState(DEFAULT_WEEK.to)
  const [quickRange, setQuickRange] = useState<QuickRange>('this_week')
  const [returns, setReturns] = useState<ReturnRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleQuickRangeChange(range: QuickRange) {
    setQuickRange(range)
    const computed = computeQuickRange(range)
    if (computed) {
      setFrom(computed.from)
      setTo(computed.to)
    }
  }

  function handleManualDateChange(setter: (v: string) => void, value: string) {
    setter(value)
    setQuickRange('custom')
  }

  function load() {
    const query = orderFilter ? { orderId: Number(orderFilter) } : { from, to }
    api
      .getReturns(query)
      .then(setReturns)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar'))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to, orderFilter])

  function handleToggleSettled(r: ReturnRecord) {
    api
      .updateReturn(r.id, !r.settled_at)
      .then((updated) => setReturns((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? prev))
      .catch(() => {})
  }

  const returnCount = returns?.filter((r) => r.type === 'return').length ?? 0
  const exchangeCount = returns?.filter((r) => r.type === 'exchange').length ?? 0
  const totalRefunded = returns?.reduce((sum, r) => sum + actualCashRefunded(r), 0) ?? 0
  // Scoped to exchanges only — a plain return isn't a "price difference", it's
  // a full refund (already counted above), so folding it in here too would
  // just double-count the same money under a second, unrelated-looking card.
  const totalNetDiff = returns?.filter((r) => r.type === 'exchange').reduce((sum, r) => sum + netDiff(r), 0) ?? 0
  const pendingSettleCount = returns?.filter((r) => !r.settled_at).length ?? 0

  return (
    <div className="page-block">
      <h1>Devoluciones y cambios</h1>
      <p className="page-block__hint">
        Registra una devolución o cambio desde la venta correspondiente en Ventas (botón "Devolución / Cambio" en
        una venta confirmada) — aquí se ve el historial completo. Al registrar uno, el stock se ajusta de inmediato:
        se repone lo devuelto y, en un cambio, se descuenta el producto de reemplazo.
      </p>

      {orderFilter ? (
        <div className="orders-filters">
          <span className="chip-filter chip-filter--active">Venta #{orderFilter}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSearchParams({})}>
            Ver todas las devoluciones
          </button>
        </div>
      ) : (
        <div className="orders-filters">
          <label className="form-field">
            Periodo
            <select value={quickRange} onChange={(e) => handleQuickRangeChange(e.target.value as QuickRange)}>
              {(Object.keys(QUICK_RANGE_LABELS) as QuickRange[]).map((r) => (
                <option key={r} value={r}>
                  {QUICK_RANGE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Desde
            <input type="date" value={from} onChange={(e) => handleManualDateChange(setFrom, e.target.value)} />
          </label>
          <label className="form-field">
            Hasta
            <input type="date" value={to} onChange={(e) => handleManualDateChange(setTo, e.target.value)} />
          </label>
        </div>
      )}

      {returns && (
        <div className="orders-summary">
          <div className="orders-summary__totals">
            <div className="orders-summary__item">
              <strong>{returnCount}</strong>
              <span>devoluciones</span>
            </div>
            <div className="orders-summary__item">
              <strong>{exchangeCount}</strong>
              <span>cambios</span>
            </div>
            <div className="orders-summary__item">
              <strong>{formatPrice(totalRefunded)}</strong>
              <span>reembolsado</span>
            </div>
            <div className="orders-summary__item">
              <strong>{totalNetDiff >= 0 ? '+' : '-'}{formatPrice(Math.abs(totalNetDiff))}</strong>
              {/* Purely descriptive (what already happened in this range),
                  not a to-do — worded to avoid reading like an outstanding
                  action still waiting to be resolved. */}
              <span>{totalNetDiff >= 0 ? 'diferencia de cambios a favor de la tienda' : 'diferencia de cambios a favor del cliente'}</span>
            </div>
            <div className={`orders-summary__item ${pendingSettleCount > 0 ? 'orders-summary__item--warn' : ''}`}>
              <strong>{pendingSettleCount}</strong>
              <span>por confirmar</span>
            </div>
          </div>
        </div>
      )}

      {!returns && !error && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}
      {returns && returns.length === 0 && <p className="state-msg">No hay devoluciones ni cambios en este rango.</p>}

      <div className="orders-list">
        {returns?.map((r) => (
          <ReturnCard key={r.id} r={r} onToggleSettled={handleToggleSettled} />
        ))}
      </div>
    </div>
  )
}

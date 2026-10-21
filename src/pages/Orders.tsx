import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type {
  Order,
  OrderItem,
  OrderItemInput,
  OrderSource,
  OrderStatus,
  OrdersResponse,
  PaymentMethod,
  Product,
  ProductStatVariant,
  ProductVariant,
  ReturnRecord,
} from '../api/types'
import { formatPrice } from '../utils/currency'
import { QUICK_RANGE_LABELS, computeQuickRange, type QuickRange } from '../utils/dateRanges'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import LoadingState from '../components/LoadingState'
import ReturnModal from '../components/ReturnModal'
import Modal from '../components/Modal'
import ImageLightbox from '../components/ImageLightbox'
import {
  AwardIcon,
  CardIcon,
  CartIcon,
  CashIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  EditIcon,
  GiftIcon,
  LayersIcon,
  PackageIcon,
  PlusIcon,
  ScissorsIcon,
  SearchIcon,
  TagIcon,
  TransferIcon,
  WhatsappIcon,
} from '../components/icons'

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
}

const SOURCE_LABELS: Record<OrderSource, string> = {
  whatsapp: 'WhatsApp',
  pos: 'Mostrador',
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  debit: 'Tarjeta de débito',
  credit: 'Tarjeta de crédito',
  transfer: 'Transferencia',
}

type StatView = 'top' | 'all' | 'packages' | 'category' | 'gifts'

const STAT_VIEW_LABELS: Record<StatView, string> = {
  top: 'Más vendidos',
  all: 'Todos los productos vendidos',
  packages: 'Paquetes más vendidos',
  category: 'Por categoría',
  gifts: 'Regalos',
}

interface OrderPackageMatch {
  order: Order
  quantity: number
}

interface StatTableRow {
  key: string
  label: string
  quantity: number
  gifts: number | null
  /** Present only for product-based rows (top/all/gifts) — expands inline
   * into the same table instead of opening a separate modal. */
  variants?: ProductStatVariant[]
  /** Present only for package rows — every sale in the current date range
   * that included this specific package, so "Paquetes más vendidos" can
   * answer "which sales was this from", not just the aggregate count. */
  orders?: OrderPackageMatch[]
}

type StatAccent = 'red' | 'amber' | 'green' | 'blue' | 'pink' | 'neutral'

/** A compact summary tile — icon, count and the top entry's name, nothing
 * else — so a long ranking never forces its own scrollbar onto the page.
 * Clicking opens the full ranking as a table further down (see StatTable).
 * The accent color is purely a scanning aid (redundant with the label). */
function StatSummaryCard({
  label,
  count,
  topLabel,
  active,
  onClick,
  icon,
  accent,
}: {
  label: string
  count: number
  topLabel?: string
  active: boolean
  onClick: () => void
  icon: ReactNode
  accent: StatAccent
}) {
  return (
    <button
      type="button"
      className={`sales-stats__card sales-stats__card--clickable sales-stats__card--${accent} ${active ? 'sales-stats__card--active' : ''}`}
      onClick={onClick}
    >
      <span className="sales-stats__card-icon">{icon}</span>
      <h3>{label}</h3>
      <p className="sales-stats__count">{count}</p>
      {topLabel && <p className="sales-stats__top">Top: {topLabel}</p>}
    </button>
  )
}

/** One product's color/talla breakdown, rendered inline — same markup
 * whether it's expanded under a "Más vendidos"/"Todos"/"Regalos" row. */
function VariantBreakdown({ variants }: { variants: ProductStatVariant[] }) {
  return (
    <div className="stat-drilldown">
      {variants.map((v, idx) => (
        <div key={idx} className="stat-drilldown__row">
          {v.mainImageUrl ? (
            <img src={v.mainImageUrl} alt="" className="stat-drilldown__thumb" />
          ) : (
            <div className="stat-drilldown__thumb stat-drilldown__thumb--empty" />
          )}
          <div className="stat-drilldown__info">
            <span className="stat-drilldown__variant">
              <span className="color-dot" style={{ backgroundColor: v.colorHex ?? '#d4d4d4' }} />
              {v.colorName ?? 'Sin color'}
              {v.size ? ` · Talla ${v.size}` : ''}
            </span>
            <span className="stat-drilldown__qty">
              {v.quantity > 0 && <span>{v.quantity} vendidas</span>}
              {v.gifts > 0 && (
                <span>
                  {v.gifts} regalo{v.gifts === 1 ? '' : 's'}
                </span>
              )}
            </span>
          </div>
          {v.productId ? (
            <Link to={`/productos/${v.productId}`} className="btn btn--ghost btn--sm stat-drilldown__btn">
              Ver producto <ChevronRightIcon width={14} height={14} />
            </Link>
          ) : (
            <span className="stat-drilldown__deleted">Producto eliminado</span>
          )}
        </div>
      ))}
      {variants.length === 0 && <p className="state-msg">Sin detalle disponible.</p>}
    </div>
  )
}

/** Which sales (in the currently loaded date range) included this package —
 * so "Paquetes más vendidos" can answer "which sale was this from", not
 * just show the aggregate count. Jumps to the actual order card below on
 * click instead of duplicating its details here. */
function OrderBreakdown({ orders }: { orders: OrderPackageMatch[] }) {
  function scrollToOrder(e: MouseEvent<HTMLAnchorElement>, orderId: number) {
    e.preventDefault()
    document.getElementById(`order-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="stat-drilldown">
      {orders.map(({ order, quantity }) => (
        <div key={order.id} className="stat-drilldown__row">
          <div className="stat-drilldown__info">
            <span className="stat-drilldown__variant">
              Venta #{order.id} · {new Date(order.created_at).toLocaleDateString('es-MX')}
              {order.customer_name ? ` · ${order.customer_name}` : ''}
            </span>
            <span className="stat-drilldown__qty">
              <span>
                {quantity} {quantity === 1 ? 'paquete' : 'paquetes'}
              </span>
            </span>
          </div>
          <a
            href={`#order-${order.id}`}
            className="btn btn--ghost btn--sm stat-drilldown__btn"
            onClick={(e) => scrollToOrder(e, order.id)}
          >
            Ver venta <ChevronRightIcon width={14} height={14} />
          </a>
        </div>
      ))}
      {orders.length === 0 && <p className="state-msg">Sin ventas en este rango.</p>}
    </div>
  )
}

function StatTable({ view, rows, onClose }: { view: StatView; rows: StatTableRow[]; onClose: () => void }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const firstColumnLabel = view === 'packages' ? 'Paquete' : view === 'category' ? 'Categoría' : 'Producto'
  const hasDrilldown = rows.some((r) => r.variants || r.orders)

  return (
    <div className="sales-stats__table-wrap">
      <div className="sales-stats__table-header">
        <h3>{STAT_VIEW_LABELS[view]}</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{firstColumnLabel}</th>
              <th>Vendidos</th>
              <th>Regalos</th>
              {hasDrilldown && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) => {
              const canExpand = !!(row.variants || row.orders)
              const expanded = expandedKey === row.key
              const trs = [
                <tr
                  key={row.key}
                  className={canExpand ? 'sales-stats__table-row--clickable' : ''}
                  onClick={canExpand ? () => setExpandedKey((k) => (k === row.key ? null : row.key)) : undefined}
                >
                  <td>{row.label}</td>
                  <td>{row.quantity}</td>
                  <td>{row.gifts ?? '—'}</td>
                  {hasDrilldown && (
                    <td>
                      {canExpand && (
                        <ChevronRightIcon
                          width={14}
                          height={14}
                          className={`sales-stats__chevron ${expanded ? 'sales-stats__chevron--open' : ''}`}
                        />
                      )}
                    </td>
                  )}
                </tr>,
              ]
              if (expanded && canExpand) {
                trs.push(
                  <tr key={`${row.key}-detail`} className="sales-stats__detail-row">
                    <td colSpan={hasDrilldown ? 4 : 3}>
                      {row.variants ? <VariantBreakdown variants={row.variants} /> : <OrderBreakdown orders={row.orders!} />}
                    </td>
                  </tr>
                )
              }
              return trs
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function itemLineTotal(item: OrderItem): number {
  if (item.is_gift) return 0
  return Math.max(0, Number(item.unit_price) - Number(item.discount_amount)) * item.quantity
}

function orderTotal(order: Order): number {
  const gross = order.items.reduce((sum, i) => sum + itemLineTotal(i), 0)
  return Math.max(0, gross - Number(order.discount_amount))
}

/** Positive = the customer owes more than what was refunded (an exchange
 * for a pricier item); negative = they're owed money back (a plain return,
 * or an exchange for something cheaper); zero for an even-price exchange. */
function returnNetDiff(r: ReturnRecord): number {
  return Number(r.charged_amount) - Number(r.refunded_amount)
}

/** The order's own total doesn't change when a return/exchange is
 * recorded (order_items are a snapshot, never edited after the fact) — so
 * the sale would otherwise still look like it's "charging" for an item
 * that's since come back. Nets that out for display only. */
function netOrderTotal(order: Order, returns: ReturnRecord[]): number {
  const adjustment = returns.reduce((sum, r) => sum + returnNetDiff(r), 0)
  return Math.max(0, orderTotal(order) + adjustment)
}

/** Splits one order's lines into sections by which package/collection they
 * came from ("qué tipo de paquete se acopló") — items with no collection
 * (plain retail lines) land in one final "Individual" group. Preserves
 * first-appearance order for both groups and the items inside them. */
function groupItemsByPackage(items: OrderItem[]): { label: string; items: OrderItem[] }[] {
  const groups: { key: string; label: string; items: OrderItem[] }[] = []
  for (const item of items) {
    const key = item.collection_name ?? '__individual__'
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: item.collection_name ?? 'Individual', items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  // Keep any "Individual" group last regardless of where it first appeared.
  groups.sort((a, b) => (a.key === '__individual__' ? 1 : 0) - (b.key === '__individual__' ? 1 : 0))
  return groups
}

function draftItemFromOrderItem(i: OrderItem): OrderItemInput {
  return {
    productId: i.product_id,
    variantId: i.variant_id,
    productName: i.product_name,
    size: i.size,
    colorName: i.color_name,
    mainImageUrl: i.main_image_url,
    unitPrice: Number(i.unit_price),
    quantity: i.quantity,
    collectionId: i.collection_id,
    collectionName: i.collection_name,
    discountAmount: Number(i.discount_amount),
    discountReason: i.discount_reason,
    isGift: !!i.is_gift,
    isPreorder: !!i.is_preorder,
  }
}

/** A small inline search-and-pick panel for "Añadir producto de regalo" —
 * picks a specific product + variant (so confirming the sale still deducts
 * its stock, same as any other line). */
function GiftProductPicker({ onPick, onCancel }: { onPick: (product: Product, variant: ProductVariant) => void; onCancel: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => setProducts([]))
  }, [])

  const term = search.trim().toLowerCase()
  const filtered = (products ?? []).filter((p) => !term || p.name.toLowerCase().includes(term))

  return (
    <div className="gift-picker">
      <div className="search-field">
        <SearchIcon />
        <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      {!products && <LoadingState />}
      <div className="gift-picker__list">
        {filtered.slice(0, 30).map((p) => (
          <div key={p.id} className="gift-picker__product">
            {p.main_image_url ? <img src={p.main_image_url} alt="" /> : <div className="gift-picker__thumb" />}
            <span className="gift-picker__name">{p.name}</span>
            <div className="gift-picker__variants">
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={v.stock <= 0}
                  title={v.stock <= 0 ? 'Sin stock' : undefined}
                  onClick={() => onPick(p, v)}
                >
                  {v.size} / {v.color_name} ({v.stock})
                </button>
              ))}
            </div>
          </div>
        ))}
        {products && filtered.length === 0 && <p className="state-msg">Ningún producto coincide.</p>}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

function OrderCard({ order, returns, onChanged }: { order: Order; returns: ReturnRecord[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [draftItems, setDraftItems] = useState<OrderItemInput[]>([])
  const [draftDiscount, setDraftDiscount] = useState('0')
  const [draftNotes, setDraftNotes] = useState('')
  const [showGiftPicker, setShowGiftPicker] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancelConfirmedModal, setShowCancelConfirmedModal] = useState(false)
  const [cancelPassword, setCancelPassword] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState(order.guest_phone ?? '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [showPaymentPicker, setShowPaymentPicker] = useState(false)
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<PaymentMethod>('cash')
  const { toast } = useToast()
  const confirmDialog = useConfirm()

  function startEdit() {
    setDraftItems(order.items.map(draftItemFromOrderItem))
    setDraftDiscount(order.discount_amount)
    setDraftNotes(order.notes ?? '')
    setError(null)
    setEditing(true)
  }

  function updateDraftItem(idx: number, changes: Partial<OrderItemInput>) {
    setDraftItems((items) => items.map((it, i) => (i === idx ? { ...it, ...changes } : it)))
  }

  function removeDraftItem(idx: number) {
    setDraftItems((items) => items.filter((_, i) => i !== idx))
  }

  function addDraftProduct(product: Product, variant: ProductVariant, isGift: boolean) {
    setDraftItems((items) => [
      ...items,
      {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        size: variant.size,
        colorName: variant.color_name,
        mainImageUrl: product.main_image_url,
        unitPrice: parseFloat(product.price),
        quantity: 1,
        discountAmount: 0,
        isGift,
      },
    ])
    setShowGiftPicker(false)
    setShowProductPicker(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.updateOrder(order.id, {
        notes: draftNotes.trim() || null,
        discountAmount: Number(draftDiscount) || 0,
        items: draftItems,
      })
      setEditing(false)
      onChanged()
      toast('Venta actualizada con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmSale() {
    setConfirming(true)
    setError(null)
    try {
      await api.confirmOrder(order.id, confirmPaymentMethod)
      setShowPaymentPicker(false)
      onChanged()
      toast('Venta confirmada — stock actualizado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar')
    } finally {
      setConfirming(false)
    }
  }

  async function handleSavePhone() {
    setSavingPhone(true)
    try {
      await api.updateOrderPhone(order.id, phoneDraft.trim() || null)
      setEditingPhone(false)
      onChanged()
      toast('Teléfono actualizado')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el teléfono', 'error')
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleTogglePackaging() {
    try {
      await api.updateOrderPackaging(order.id, !order.is_packaged)
      onChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al actualizar', 'error')
    }
  }

  async function handleCancelSale() {
    const ok = await confirmDialog({
      title: '¿Cancelar esta venta?',
      message: 'Se marcará como cancelada. No afecta el stock.',
      confirmLabel: 'Cancelar venta',
      danger: true,
    })
    if (!ok) return
    try {
      await api.cancelOrder(order.id)
      onChanged()
      toast('Venta cancelada')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al cancelar', 'error')
    }
  }

  function closeCancelConfirmedModal() {
    setShowCancelConfirmedModal(false)
    setCancelPassword('')
    setCancelError(null)
  }

  async function handleCancelConfirmedSale() {
    setCancelling(true)
    setCancelError(null)
    try {
      await api.cancelConfirmedOrder(order.id, cancelPassword)
      closeCancelConfirmedModal()
      onChanged()
      toast('Venta cancelada — stock restaurado')
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar')
    } finally {
      setCancelling(false)
    }
  }

  const isPending = order.status === 'pending'
  const itemGroups = groupItemsByPackage(order.items)
  const showGroupLabels = itemGroups.length > 1 || itemGroups[0]?.label !== 'Individual'

  // Every item photo in this order, flattened in the same top-to-bottom
  // order they're actually rendered in (grouped by package) — what the
  // lightbox browses through when one of them is clicked (see viewerIndex).
  const orderImages = itemGroups
    .flatMap((g) => g.items)
    .filter((i): i is typeof i & { main_image_url: string } => !!i.main_image_url)
    .map((i) => ({ id: i.id, url: i.main_image_url, label: i.product_name }))

  // Same idea as orderImages above, but for the editable draft table — keyed
  // by array index instead of a real row id (a freshly-added draft line has
  // none yet).
  const draftImages = draftItems
    .map((item, idx) => ({ idx, url: item.mainImageUrl, label: item.productName }))
    .filter((x): x is { idx: number; url: string; label: string } => !!x.url)

  const hasReturn = returns.some((r) => r.type === 'return')
  const hasExchange = returns.some((r) => r.type === 'exchange')
  const showsReturnStatus = order.status === 'confirmed' && (hasReturn || hasExchange)
  const returnStatusLabel = hasReturn && hasExchange ? 'Devolución y cambio' : hasReturn ? 'Devolución' : 'Cambio'
  const statusClass = showsReturnStatus ? 'returned' : order.status
  const statusLabel = showsReturnStatus ? returnStatusLabel : STATUS_LABELS[order.status]

  const grossTotal = orderTotal(order)
  const netTotal = netOrderTotal(order, returns)
  const netAdjustment = returns.reduce((sum, r) => sum + returnNetDiff(r), 0)
  // Whichever way it went (money owed to the store or back to the
  // customer), name it plainly instead of just showing a smaller number.
  const returnMoneyNote =
    returns.length === 0
      ? null
      : Math.abs(netAdjustment) < 0.01
        ? 'sin diferencia de precio'
        : netAdjustment < 0
          ? `se reembolsó ${formatPrice(-netAdjustment)}`
          : `el cliente pagó ${formatPrice(netAdjustment)} más`

  return (
    <div id={`order-${order.id}`} className={`order-card order-card--${order.status}`}>
      <div className="order-card__header">
        <div>
          <span className={`order-status order-status--${statusClass}`}>{statusLabel}</span>
          <span className="tag order-card__source-tag">{SOURCE_LABELS[order.source]}</span>
          {!order.customer_phone && (
            <span className="order-card__phone order-card__phone--inline">
              {editingPhone ? (
                <>
                  <input
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="Teléfono del cliente"
                    autoFocus
                  />
                  <button type="button" className="btn btn--accent btn--sm" onClick={handleSavePhone} disabled={savingPhone}>
                    {savingPhone ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setPhoneDraft(order.guest_phone ?? '')
                      setEditingPhone(false)
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : order.guest_phone ? (
                <>
                  <span>📞 {order.guest_phone}</span>
                  <button type="button" className="icon-btn icon-btn--ghost" onClick={() => setEditingPhone(true)} aria-label="Editar teléfono">
                    <EditIcon width={14} height={14} />
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingPhone(true)}>
                  + Agregar teléfono
                </button>
              )}
            </span>
          )}
          {order.payment_method && <span className="tag">{PAYMENT_METHOD_LABELS[order.payment_method]}</span>}
          <strong className="order-card__id">Venta #{order.id}</strong>
          <span className="order-card__date">{new Date(order.created_at).toLocaleString('es-MX')}</span>
          {returns.length > 0 && (
            <Link to={`/devoluciones?order=${order.id}`} className="order-card__return-link">
              {hasReturn && hasExchange ? 'Ver devolución y cambio' : hasReturn ? 'Ver devolución' : 'Ver cambio'}
              {returnMoneyNote ? ` · ${returnMoneyNote}` : ''} ›
            </Link>
          )}
        </div>
        <div className="order-card__total">
          {netTotal !== grossTotal && <span className="order-card__total-original">{formatPrice(grossTotal)}</span>}
          {formatPrice(netTotal)}
        </div>
      </div>

      {(order.customer_name || order.customer_phone) && (
        <p className="order-card__customer">
          {order.customer_name ?? 'Cliente'} {order.customer_phone ? `· ${order.customer_phone}` : ''}
        </p>
      )}

      {order.status !== 'cancelled' && (
        <label className="order-card__packaging">
          <input type="checkbox" checked={!!order.is_packaged} onChange={handleTogglePackaging} />
          Empaquetado
        </label>
      )}

      {!editing ? (
        <>
          {itemGroups.map((group) => (
            <div key={group.label} className="order-card__group">
              {showGroupLabels && <h4 className="order-card__group-label">{group.label}</h4>}
              <ul className="order-card__items">
                {group.items.map((item) => (
                  <li key={item.id} className="order-card__item">
                    {item.main_image_url ? (
                      <button
                        type="button"
                        className="order-card__item-thumb-btn"
                        onClick={() => setViewerIndex(orderImages.findIndex((img) => img.id === item.id))}
                        aria-label="Ver imagen en grande"
                      >
                        <img src={item.main_image_url} alt="" />
                      </button>
                    ) : (
                      <div className="order-card__item-thumb" />
                    )}
                    <span className="order-card__item-info">
                      {item.product_name}
                      {item.size && ` — Talla ${item.size}`}
                      {item.color_name && `, ${item.color_name}`}
                      {!!item.is_gift && (
                        <span className="tag order-card__gift-tag">
                          <GiftIcon width={12} height={12} /> Regalo
                        </span>
                      )}
                      {!item.is_gift && Number(item.discount_amount) > 0 && (
                        <span className="tag">
                          -{formatPrice(item.discount_amount)} c/u{item.discount_reason ? ` · ${item.discount_reason}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="order-card__item-qty">x{item.quantity}</span>
                    <span className="order-card__item-price">
                      {item.is_gift ? 'Gratis' : formatPrice(itemLineTotal(item))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Number(order.discount_amount) > 0 && (
            <p className="order-card__discount">Descuento total: -{formatPrice(order.discount_amount)}</p>
          )}
          {order.notes && <p className="order-card__notes">Notas: {order.notes}</p>}

          {error && <p className="form-error">{error}</p>}

          {isPending && !showPaymentPicker && (
            <div className="order-card__actions">
              <button
                type="button"
                className="btn btn--accent btn--sm"
                onClick={() => setShowPaymentPicker(true)}
                disabled={!order.is_packaged}
                title={!order.is_packaged ? 'Marca "Empaquetado" antes de confirmar' : undefined}
              >
                Confirmar venta
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={startEdit}>
                Editar venta
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleCancelSale}>
                Cancelar venta
              </button>
              {!order.is_packaged && <span className="order-card__packaging-hint">Marca "Empaquetado" antes de confirmar</span>}
            </div>
          )}

          {isPending && showPaymentPicker && (
            <div className="order-card__confirm-payment">
              <div className="pos-payment-method">
                <span className="pos-payment-method__label">Forma de pago</span>
                <div className="pos-payment-method__row">
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${confirmPaymentMethod === 'cash' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setConfirmPaymentMethod('cash')}
                  >
                    <CashIcon width={16} height={16} /> Efectivo
                  </button>
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${confirmPaymentMethod === 'debit' || confirmPaymentMethod === 'credit' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setConfirmPaymentMethod((pm) => (pm === 'debit' || pm === 'credit' ? pm : 'credit'))}
                  >
                    <CardIcon width={16} height={16} /> Tarjeta
                  </button>
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${confirmPaymentMethod === 'transfer' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setConfirmPaymentMethod('transfer')}
                  >
                    <TransferIcon width={16} height={16} /> Transferencia
                  </button>
                </div>
                {(confirmPaymentMethod === 'debit' || confirmPaymentMethod === 'credit') && (
                  <div className="pos-payment-method__row pos-payment-method__row--sub">
                    <button
                      type="button"
                      className={`pos-payment-method__btn pos-payment-method__btn--sm ${confirmPaymentMethod === 'debit' ? 'pos-payment-method__btn--active' : ''}`}
                      onClick={() => setConfirmPaymentMethod('debit')}
                    >
                      Débito
                    </button>
                    <button
                      type="button"
                      className={`pos-payment-method__btn pos-payment-method__btn--sm ${confirmPaymentMethod === 'credit' ? 'pos-payment-method__btn--active' : ''}`}
                      onClick={() => setConfirmPaymentMethod('credit')}
                    >
                      Crédito
                    </button>
                  </div>
                )}
              </div>
              <div className="order-card__actions">
                <button type="button" className="btn btn--accent btn--sm" onClick={handleConfirmSale} disabled={confirming}>
                  {confirming ? 'Confirmando…' : 'Confirmar'}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowPaymentPicker(false)} disabled={confirming}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {order.status === 'confirmed' && (
            <div className="order-card__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowReturnModal(true)}>
                Devolución / Cambio
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowCancelConfirmedModal(true)}>
                Cancelar venta
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="order-card__edit">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Cant.</th>
                  <th>Descuento (por unidad)</th>
                  <th>Regalo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      {item.mainImageUrl ? (
                        <button
                          type="button"
                          className="order-card__item-thumb-btn"
                          onClick={() => setViewerIndex(draftImages.findIndex((img) => img.idx === idx))}
                          aria-label="Ver imagen en grande"
                        >
                          <img src={item.mainImageUrl} alt="" className="admin-table__thumb" />
                        </button>
                      ) : (
                        <div className="admin-table__thumb admin-table__thumb--empty" />
                      )}
                    </td>
                    <td>
                      {item.productName}
                      {item.size && ` — ${item.size}`}
                      {item.colorName && `, ${item.colorName}`}
                    </td>
                    <td>{formatPrice(item.unitPrice)}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateDraftItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ width: 60 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.discountAmount ?? 0}
                        onChange={(e) =>
                          updateDraftItem(idx, { discountAmount: Number(e.target.value) || 0, discountReason: null })
                        }
                        style={{ width: 80 }}
                      />
                      {item.discountReason && <p className="page-block__hint">{item.discountReason}</p>}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!item.isGift}
                        onChange={(e) => updateDraftItem(idx, { isGift: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeDraftItem(idx)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showProductPicker ? (
            <GiftProductPicker onPick={(p, v) => addDraftProduct(p, v, false)} onCancel={() => setShowProductPicker(false)} />
          ) : showGiftPicker ? (
            <GiftProductPicker onPick={(p, v) => addDraftProduct(p, v, true)} onCancel={() => setShowGiftPicker(false)} />
          ) : (
            <div className="order-card__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowProductPicker(true)}>
                <PlusIcon width={14} height={14} /> Añadir producto
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowGiftPicker(true)}>
                <GiftIcon width={14} height={14} /> Añadir producto de regalo
              </button>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field">
              Descuento total (MXN)
              <input type="number" min="0" step="0.01" value={draftDiscount} onChange={(e) => setDraftDiscount(e.target.value)} />
            </label>
            <label className="form-field">
              Notas
              <input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {showReturnModal && (
        <ReturnModal
          order={order}
          onClose={() => setShowReturnModal(false)}
          onCreated={() => {
            setShowReturnModal(false)
            onChanged()
          }}
        />
      )}

      {showCancelConfirmedModal && (
        <Modal title={`Cancelar venta #${order.id}`} onClose={closeCancelConfirmedModal}>
          <p className="page-block__hint">
            Esta venta ya está confirmada — cancelarla restaura el stock de cada artículo. Ingresa tu contraseña de
            administrador para confirmar.
          </p>
          <label className="form-field">
            Contraseña
            <input
              type="password"
              value={cancelPassword}
              onChange={(e) => setCancelPassword(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && cancelPassword && handleCancelConfirmedSale()}
            />
          </label>
          {cancelError && <p className="form-error">{cancelError}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={closeCancelConfirmedModal} disabled={cancelling}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn--accent"
              onClick={handleCancelConfirmedSale}
              disabled={cancelling || !cancelPassword}
            >
              {cancelling ? 'Cancelando…' : 'Cancelar venta'}
            </button>
          </div>
        </Modal>
      )}

      {viewerIndex !== null && (editing ? draftImages : orderImages).length > 0 && (
        <ImageLightbox
          images={editing ? draftImages : orderImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}

const DEFAULT_WEEK = computeQuickRange('this_week')!

export default function Orders() {
  const [searchParams] = useSearchParams()
  // Arriving from Cortes' "Ver ventas de este corte/periodo" link — takes
  // over the default range once, on first render, and shows a banner
  // confirming whether this exact period was already cut or not.
  // confirmedFrom/confirmedTo (exact datetimes, from a specific cut's own
  // period) take priority over from/to whenever present — see load()
  // below — and reproduce that cut's own totals precisely, instead of the
  // day-level from/to widening the range into a neighboring cut's sales.
  // Cleared the moment the admin touches any filter by hand (see
  // handleQuickRangeChange/handleManualDateChange/setStatus/setSource),
  // since editing means leaving that exact-cut view.
  const initialConfirmedFrom = searchParams.get('confirmedFrom')
  const initialConfirmedTo = searchParams.get('confirmedTo')
  const initialFrom = searchParams.get('from')
  const cutStatus = searchParams.get('cutStatus')
  const cutId = searchParams.get('cutId')
  const [confirmedFrom, setConfirmedFrom] = useState(initialConfirmedFrom)
  const [confirmedTo, setConfirmedTo] = useState(initialConfirmedTo)
  const [from, setFrom] = useState(
    initialConfirmedFrom
      ? initialConfirmedFrom.slice(0, 10)
      : // No real lower bound (e.g. the very first cash cut ever) — match
        // `to` instead of the this-week default, so the date pickers don't
        // show a nonsensical inverted range while confirmedTo does the
        // actual (unbounded-below) filtering.
        initialConfirmedTo?.slice(0, 10) || initialFrom || DEFAULT_WEEK.from
  )
  const [to, setTo] = useState(
    initialConfirmedTo ? initialConfirmedTo.slice(0, 10) : searchParams.get('to') || DEFAULT_WEEK.to
  )
  const [quickRange, setQuickRange] = useState<QuickRange>(
    initialConfirmedFrom || initialConfirmedTo || initialFrom ? 'custom' : 'this_week'
  )
  const [status, setStatus] = useState<OrderStatus | ''>((searchParams.get('status') as OrderStatus) || '')
  const [source, setSource] = useState<OrderSource | ''>((searchParams.get('source') as OrderSource) || '')
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [returnsByOrder, setReturnsByOrder] = useState<Map<number, ReturnRecord[]>>(new Map())
  // Scoped to the same from/to as the orders list (unlike returnsByOrder
  // above, which is deliberately unscoped) — just for the "Cambios"/
  // "Devoluciones" summary cards below, so their counts match whatever
  // range is currently being viewed.
  const [rangeReturns, setRangeReturns] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statView, setStatView] = useState<StatView | null>(null)
  const [showStatsMobile, setShowStatsMobile] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)
  const statTableRef = useRef<HTMLDivElement>(null)
  const statusStatsRef = useRef<HTMLDivElement>(null)
  const didMountFilters = useRef(false)

  function load() {
    setLoading(true)
    api
      .getOrders({
        from,
        to,
        status: status || undefined,
        source: source || undefined,
        confirmedFrom: confirmedFrom ?? undefined,
        confirmedTo: confirmedTo ?? undefined,
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar ventas')
        setLoading(false)
      })
    // Not scoped to the same from/to — a return can be recorded well after
    // its original sale, so the order needs to know about it regardless of
    // which date range is currently being viewed.
    api
      .getReturns()
      .then((returns) => {
        const map = new Map<number, ReturnRecord[]>()
        for (const r of returns) {
          const list = map.get(r.order_id) ?? []
          list.push(r)
          map.set(r.order_id, list)
        }
        setReturnsByOrder(map)
      })
      .catch(() => {})
    api
      .getReturns({ from, to })
      .then(setRangeReturns)
      .catch(() => {})
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to, status, source, confirmedFrom, confirmedTo])

  // "Pendiente" can never match a mostrador sale — it's born confirmed and
  // only ever moves to cancelled (see cancelConfirmedOrder). Steer away from
  // that combination instead of silently showing an empty list.
  useEffect(() => {
    if (source === 'pos' && status === 'pending') setStatus('')
  }, [source, status])

  // Filtering (channel switch or a status card) brings the status cards
  // into view — that's the summary of the new filter, and scrolling any
  // further would bury it under the individual order cards below. Skips the
  // very first render so the page doesn't jump on load.
  useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true
      return
    }
    // Changing the channel or status leaves whatever exact-cut view a
    // Cortes link opened — a cash cut is inherently "all confirmed sales",
    // so filtering away from that no longer represents it anyway.
    setConfirmedFrom(null)
    setConfirmedTo(null)
    statusStatsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [status, source])

  // Opening a stat's table brings it into view the same way.
  useEffect(() => {
    if (statView) statTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [statView])

  function handleQuickRangeChange(range: QuickRange) {
    setQuickRange(range)
    const computed = computeQuickRange(range)
    if (computed) {
      setFrom(computed.from)
      setTo(computed.to)
    }
    setConfirmedFrom(null)
    setConfirmedTo(null)
  }

  function handleManualDateChange(setter: (v: string) => void, value: string) {
    setter(value)
    setQuickRange('custom')
    setConfirmedFrom(null)
    setConfirmedTo(null)
  }

  // byProduct already comes sorted by quantity sold, descending — filter out
  // gift-only rows (0 sold) rather than re-sorting. Gifts get their own sort
  // since that list's order has nothing to do with units actually sold.
  const soldProducts = data ? data.summary.byProduct.filter((p) => p.quantity > 0) : []
  const topProducts = soldProducts.slice(0, 5)
  const giftProducts = data
    ? [...data.summary.byProduct].filter((p) => p.gifts > 0).sort((a, b) => b.gifts - a.gifts)
    : []
  const exchangeCount = rangeReturns.filter((r) => r.type === 'exchange').length
  const returnCount = rangeReturns.filter((r) => r.type === 'return').length
  const visibleOrders = data?.orders ?? []

  function toggleStatView(view: StatView) {
    setStatView((v) => (v === view ? null : view))
  }

  function productRow(p: { productName: string; quantity: number; gifts: number; variants: ProductStatVariant[] }): StatTableRow {
    return {
      key: p.productName,
      label: p.productName,
      quantity: p.quantity,
      gifts: p.gifts,
      variants: p.variants,
    }
  }

  // Mirrors the backend's own byPackage aggregation (confirmed orders,
  // non-gift lines only) so the drill-down's sales always add up to the
  // same total shown on the summary card.
  function ordersForPackage(collectionId: number): OrderPackageMatch[] {
    if (!data) return []
    return data.orders
      .filter((o) => o.status === 'confirmed')
      .map((order) => ({
        order,
        quantity: order.items
          .filter((i) => i.collection_id === collectionId && !i.is_gift)
          .reduce((sum, i) => sum + i.quantity, 0),
      }))
      .filter((x) => x.quantity > 0)
      .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime())
  }

  const statRows: Record<StatView, StatTableRow[]> = {
    top: topProducts.map(productRow),
    all: soldProducts.map(productRow),
    gifts: giftProducts.map(productRow),
    packages: data
      ? data.summary.byPackage.map((p) => ({
          key: String(p.collectionId),
          label: p.collectionName,
          quantity: p.quantity,
          gifts: null,
          orders: ordersForPackage(p.collectionId),
        }))
      : [],
    category: data
      ? data.summary.byCategory.map((c) => ({ key: c.categoryName, label: c.categoryName, quantity: c.itemsSold, gifts: c.gifts }))
      : [],
  }

  return (
    <div className="page-block">
      <h1>Ventas</h1>
      <p className="page-block__hint">
        Ventas por WhatsApp (carrito, compra rápida) y en mostrador (Punto de venta). Confirma una venta pendiente
        para descontar el stock — mientras esté pendiente puedes editarla, agregar un regalo o aplicar descuentos.
      </p>

      {cutStatus === 'done' && (
        <div className="cash-cut-banner cash-cut-banner--done">
          <CheckIcon width={16} height={16} /> Corte #{cutId} realizado — este periodo ya está cerrado.
        </div>
      )}
      {cutStatus === 'pending' && (
        <div className="cash-cut-banner cash-cut-banner--pending">
          <ScissorsIcon width={16} height={16} /> Este periodo todavía no tiene corte de caja.
        </div>
      )}

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
        <div className="form-field">
          Canal
          <div className="channel-switch">
            <button
              type="button"
              className={`channel-switch__btn ${source === '' ? 'channel-switch__btn--active' : ''}`}
              onClick={() => setSource('')}
            >
              Todos
            </button>
            <button
              type="button"
              className={`channel-switch__btn ${source === 'whatsapp' ? 'channel-switch__btn--active' : ''}`}
              onClick={() => setSource('whatsapp')}
            >
              <WhatsappIcon /> WhatsApp
            </button>
            <button
              type="button"
              className={`channel-switch__btn ${source === 'pos' ? 'channel-switch__btn--active' : ''}`}
              onClick={() => setSource('pos')}
            >
              <CartIcon /> Mostrador
            </button>
          </div>
        </div>
      </div>

      {data && (
        <div ref={statsRef} className={`sales-stats ${showStatsMobile ? 'sales-stats--mobile-visible' : ''}`}>
          <div className="sales-stats__card sales-stats__card--total sales-stats__card--red">
            <span className="sales-stats__card-icon">
              <CashIcon />
            </span>
            <h3>Total vendido</h3>
            <p className="sales-stats__total-value">{formatPrice(data.summary.revenue)}</p>
          </div>
          {topProducts.length > 0 && (
            <StatSummaryCard
              label="Más vendidos"
              count={topProducts.length}
              topLabel={topProducts[0]?.productName}
              active={statView === 'top'}
              onClick={() => toggleStatView('top')}
              icon={<AwardIcon />}
              accent="amber"
            />
          )}
          {soldProducts.length > 0 && (
            <StatSummaryCard
              label="Todos los productos vendidos"
              count={soldProducts.length}
              topLabel={soldProducts[0]?.productName}
              active={statView === 'all'}
              onClick={() => toggleStatView('all')}
              icon={<PackageIcon />}
              accent="neutral"
            />
          )}
          {data.summary.byPackage.length > 0 && (
            <StatSummaryCard
              label="Paquetes más vendidos"
              count={data.summary.byPackage.length}
              topLabel={data.summary.byPackage[0]?.collectionName}
              active={statView === 'packages'}
              onClick={() => toggleStatView('packages')}
              icon={<LayersIcon />}
              accent="green"
            />
          )}
          {data.summary.byCategory.length > 0 && (
            <StatSummaryCard
              label="Por categoría"
              count={data.summary.byCategory.length}
              topLabel={data.summary.byCategory[0]?.categoryName}
              active={statView === 'category'}
              onClick={() => toggleStatView('category')}
              icon={<TagIcon />}
              accent="blue"
            />
          )}
          {giftProducts.length > 0 && (
            <StatSummaryCard
              label="Regalos"
              count={giftProducts.length}
              topLabel={giftProducts[0]?.productName}
              active={statView === 'gifts'}
              onClick={() => toggleStatView('gifts')}
              icon={<GiftIcon />}
              accent="pink"
            />
          )}
        </div>
      )}

      {statView && statRows[statView].length > 0 && (
        <div ref={statTableRef}>
          <StatTable view={statView} rows={statRows[statView]} onClose={() => setStatView(null)} />
        </div>
      )}

      {data && (
        <button
          type="button"
          className="sales-stats__mobile-fab"
          onClick={() => {
            setShowStatsMobile((v) => {
              const next = !v
              if (next) requestAnimationFrame(() => statsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
              return next
            })
          }}
        >
          <ChartIcon /> {showStatsMobile ? 'Ocultar estadísticas' : 'Estadísticas'}
        </button>
      )}

      {data && (
        <div className="status-stats" ref={statusStatsRef}>
          <button
            type="button"
            className={`status-stats__item status-stats__item--total ${status === '' ? 'status-stats__item--active' : ''}`}
            onClick={() => setStatus('')}
          >
            <strong>{data.summary.totalCount}</strong>
            <span>Todas</span>
          </button>
          <button
            type="button"
            className={`status-stats__item status-stats__item--pending ${status === 'pending' ? 'status-stats__item--active' : ''}`}
            onClick={() => setStatus((s) => (s === 'pending' ? '' : 'pending'))}
            disabled={source === 'pos'}
            title={source === 'pos' ? 'No aplica en mostrador' : undefined}
          >
            <strong>{data.summary.pendingCount}</strong>
            <span>Pendientes</span>
          </button>
          <button
            type="button"
            className={`status-stats__item status-stats__item--confirmed ${status === 'confirmed' ? 'status-stats__item--active' : ''}`}
            onClick={() => setStatus((s) => (s === 'confirmed' ? '' : 'confirmed'))}
          >
            <strong>{data.summary.confirmedCount}</strong>
            <span>Confirmadas</span>
          </button>
          <button
            type="button"
            className={`status-stats__item status-stats__item--cancelled ${status === 'cancelled' ? 'status-stats__item--active' : ''}`}
            onClick={() => setStatus((s) => (s === 'cancelled' ? '' : 'cancelled'))}
          >
            <strong>{data.summary.cancelledCount}</strong>
            <span>Canceladas</span>
          </button>
          <Link to="/devoluciones" className="status-stats__item status-stats__item--exchange">
            <strong>{exchangeCount}</strong>
            <span>Cambios</span>
          </Link>
          <Link to="/devoluciones" className="status-stats__item status-stats__item--returned">
            <strong>{returnCount}</strong>
            <span>Devoluciones</span>
          </Link>
        </div>
      )}

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}
      {data && visibleOrders.length === 0 && <p className="state-msg">No hay ventas en este rango.</p>}

      <div className="orders-list">
        {visibleOrders.map((order) => (
          <OrderCard key={order.id} order={order} returns={returnsByOrder.get(order.id) ?? []} onChanged={load} />
        ))}
      </div>
    </div>
  )
}

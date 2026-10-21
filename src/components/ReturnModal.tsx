import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Collection, Order, Product, ProductVariant, ReturnType } from '../api/types'
import Modal from './Modal'
import { SearchIcon } from './icons'
import { useToast } from '../hooks/useToast'
import LoadingState from './LoadingState'
import { formatPrice } from '../utils/currency'

/** Mirrors backend/src/controllers/returns.controller.js's own
 * productQualifiesForCollection() (itself a port of the storefront's
 * collectionMatchesProduct) — used here only to preview, before saving,
 * whether a chosen replacement keeps the original package price or breaks
 * it. The backend is the actual authority at save time; this just avoids
 * showing a price-diff preview that wouldn't match what gets charged. */
function collectionMatchesProduct(collection: Collection, product: Product): boolean {
  if (collection.products.some((cp) => cp.id === product.id)) return true
  if (collection.pricing_mode === 'wholesale' && collection.wholesale_any_product) {
    return collection.wholesale_category_id == null || collection.wholesale_category_id === product.category_id
  }
  if (collection.pricing_mode === 'combo' || collection.pricing_mode === 'unit' || collection.pricing_mode === 'bundle') {
    return collection.bundle_parts.some((part) => !part.is_specific && part.category_id === product.category_id)
  }
  return false
}

/** A small inline search-and-pick panel for choosing the replacement
 * product + variant in an exchange — mirrors Orders.tsx's GiftProductPicker. */
function ReplacementPicker({ onPick, onCancel }: { onPick: (product: Product, variant: ProductVariant) => void; onCancel: () => void }) {
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

export default function ReturnModal({
  order,
  onClose,
  onCreated,
}: {
  order: Order
  onClose: () => void
  onCreated: () => void
}) {
  const [remainingByItem, setRemainingByItem] = useState<Map<number, number> | null>(null)
  const [orderItemId, setOrderItemId] = useState<number | null>(null)
  const [type, setType] = useState<ReturnType>('return')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [replacement, setReplacement] = useState<{ product: Product; variant: ProductVariant } | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packageCollection, setPackageCollection] = useState<Collection | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    api
      .getReturns({ orderId: order.id })
      .then((returns) => {
        const map = new Map<number, number>()
        for (const item of order.items) map.set(item.id, item.quantity)
        for (const r of returns) map.set(r.order_item_id, (map.get(r.order_item_id) ?? 0) - r.quantity)
        setRemainingByItem(map)
        const firstAvailable = order.items.find((i) => (map.get(i.id) ?? 0) > 0)
        setOrderItemId(firstAvailable?.id ?? null)
      })
      .catch(() => setRemainingByItem(new Map(order.items.map((i) => [i.id, i.quantity]))))
  }, [order])

  const selectedItem = order.items.find((i) => i.id === orderItemId) ?? null
  const remaining = orderItemId != null ? remainingByItem?.get(orderItemId) ?? 0 : 0

  // The original line came from a package deal — fetch it so a same-
  // package replacement can be recognized as keeping the same price
  // instead of previewing a diff based on its own regular price.
  useEffect(() => {
    if (!selectedItem?.collection_id) {
      setPackageCollection(null)
      return
    }
    api
      .getCollection(selectedItem.collection_id)
      .then(setPackageCollection)
      .catch(() => setPackageCollection(null))
  }, [selectedItem?.collection_id])

  const withinPackage = !!(packageCollection && replacement && collectionMatchesProduct(packageCollection, replacement.product))
  const refundedAmount = selectedItem
    ? Math.max(0, Number(selectedItem.unit_price) - Number(selectedItem.discount_amount)) * quantity
    : 0
  // Positive = the customer owes more for the pricier replacement;
  // negative = they're owed a refund for a cheaper one — mirrors exactly
  // what the backend will snapshot as refunded_amount/charged_amount. A
  // same-package swap keeps the amount already paid, whatever the
  // replacement's own regular price is.
  const priceDiff = !selectedItem
    ? 0
    : withinPackage
      ? 0
      : (replacement ? Number(replacement.product.price) : 0) * quantity - refundedAmount

  async function handleSubmit() {
    if (!selectedItem) return
    if (quantity < 1 || quantity > remaining) {
      setError(`La cantidad debe ser entre 1 y ${remaining}`)
      return
    }
    if (type === 'exchange' && !replacement) {
      setError('Elige el producto de reemplazo')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createReturn({
        orderId: order.id,
        orderItemId: selectedItem.id,
        type,
        quantity,
        reason: reason.trim() || null,
        newProductId: replacement?.product.id,
        newVariantId: replacement?.variant.id,
      })
      toast(type === 'return' ? 'Devolución registrada con éxito' : 'Cambio registrado con éxito')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setSaving(false)
    }
  }

  const availableItems = order.items.filter((i) => (remainingByItem?.get(i.id) ?? 0) > 0)

  return (
    <Modal title={`Devolución / Cambio — Venta #${order.id}`} onClose={onClose}>
      {!remainingByItem ? (
        <LoadingState />
      ) : availableItems.length === 0 ? (
        <p className="state-msg">Ya no quedan unidades de esta venta sin devolver o cambiar.</p>
      ) : (
        <>
          <label className="form-field">
            Producto
            <select value={orderItemId ?? ''} onChange={(e) => setOrderItemId(Number(e.target.value))}>
              {availableItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product_name}
                  {i.size ? ` — ${i.size}` : ''}
                  {i.color_name ? `, ${i.color_name}` : ''} ({remainingByItem.get(i.id)} disponible
                  {remainingByItem.get(i.id) === 1 ? '' : 's'})
                  {i.collection_name ? ` · Paquete: ${i.collection_name}` : ''}
                </option>
              ))}
            </select>
          </label>

          {type === 'exchange' && selectedItem?.collection_name && (
            <p className="form-field__note">
              Este producto es parte del paquete "{selectedItem.collection_name}" — si eliges un reemplazo del mismo
              paquete (misma categoría), se mantiene el precio ya pagado. Si eliges algo fuera del paquete, se cobra
              al precio actual.
            </p>
          )}

          <div className="form-grid">
            <label className="form-field">
              Tipo
              <select value={type} onChange={(e) => setType(e.target.value as ReturnType)}>
                <option value="return">Devolución</option>
                <option value="exchange">Cambio</option>
              </select>
            </label>
            <label className="form-field">
              Cantidad
              <input
                type="number"
                min={1}
                max={remaining}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(remaining, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          {type === 'exchange' && (
            <div className="form-field">
              Producto de reemplazo
              {replacement ? (
                <>
                  <div className="gift-picker__product" style={{ marginTop: 6 }}>
                    {replacement.product.main_image_url ? (
                      <img src={replacement.product.main_image_url} alt="" />
                    ) : (
                      <div className="gift-picker__thumb" />
                    )}
                    <span className="gift-picker__name">
                      {replacement.product.name} — {replacement.variant.size}, {replacement.variant.color_name} ·{' '}
                      {formatPrice(replacement.product.price)}
                    </span>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplacement(null)}>
                      Quitar
                    </button>
                  </div>
                  {selectedItem && (
                    <p
                      className={`form-field__note ${
                        priceDiff < 0 ? 'form-field__note--refund' : priceDiff > 0 ? 'form-field__note--charge' : ''
                      }`}
                    >
                      {withinPackage
                        ? 'Dentro del mismo paquete — se mantiene el precio ya pagado, sin diferencia.'
                        : Math.abs(priceDiff) < 0.01
                          ? 'Mismo precio — sin diferencia.'
                          : priceDiff > 0
                            ? `El cliente debe pagar ${formatPrice(priceDiff)} más.`
                            : `Se le debe reembolsar ${formatPrice(-priceDiff)}.`}
                    </p>
                  )}
                </>
              ) : showPicker ? (
                <ReplacementPicker
                  onPick={(product, variant) => {
                    setReplacement({ product, variant })
                    setShowPicker(false)
                  }}
                  onCancel={() => setShowPicker(false)}
                />
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 6 }} onClick={() => setShowPicker(true)}>
                  Elegir producto…
                </button>
              )}
            </div>
          )}

          <label className="form-field">
            Motivo (opcional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. No le quedó la talla" />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando…' : type === 'return' ? 'Registrar devolución' : 'Registrar cambio'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

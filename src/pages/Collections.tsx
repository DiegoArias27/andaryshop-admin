import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import type {
  BannerElement,
  Brand,
  Category,
  Collection,
  CollectionBundlePartInput,
  CollectionComboTierInput,
  CollectionInput,
  CollectionPricingMode,
  DiscountType,
  Product,
} from '../api/types'
import ImageUploader from '../components/ImageUploader'
import ImagePreview from '../components/ImagePreview'
import ToggleSwitch from '../components/ToggleSwitch'
import BannerEditor, { COLLECTION_DEVICE_RATIOS, seedBannerElements } from '../components/BannerEditor'
import { CheckSquareIcon, DragHandleIcon, SquareIcon } from '../components/icons'
import ImageLightbox from '../components/ImageLightbox'
import { formatPrice } from '../utils/currency'
import { getDiscountedPrice } from '../utils/discount'
import { toDateStr } from '../utils/dates'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'
import Modal from '../components/Modal'

function formatUnit(value: number): string {
  return value.toFixed(2)
}

function partLabel(p: Collection['bundle_parts'][number]): string {
  return `${p.required_qty} ${p.category_name}`
}

/** True when every product this collection needs is matched dynamically
 * (wholesale's whole-category wildcard, or a combo/unit/bundle where every
 * part is "cualquier producto", non-gift) — nothing for the admin to
 * curate, so "0 producto(s)" would misleadingly read as "not set up yet". */
function needsNoCuration(c: Collection): boolean {
  if (c.pricing_mode === 'wholesale' && c.wholesale_any_product) return true
  if (c.bundle_parts.length > 0) {
    return c.bundle_parts.every((p) => !p.is_specific && !p.is_gift)
  }
  return false
}

function comboTierLabel(c: Collection, tier: Collection['combo_tiers'][number]): string {
  const tierParts = c.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
  const paid = tierParts.filter((p) => !p.is_gift)
  const gifts = tierParts.filter((p) => p.is_gift)
  const paidText = paid.map(partLabel).join(' + ')
  const priceText = ` a ${formatPrice(tier.price)}`
  const giftText = gifts.length > 0 ? ` (+ ${gifts.map((p) => `${partLabel(p)} de regalo`).join(' + ')})` : ''
  return `${paidText}${priceText}${giftText}`
}

// A combo with more than one tier (variant) lists each one — with just one,
// stays a single plain label like before tiers existed.
function comboLabel(c: Collection): string {
  if (c.combo_tiers.length === 0) return ''
  if (c.combo_tiers.length === 1) return comboTierLabel(c, c.combo_tiers[0])
  return c.combo_tiers.map((tier, i) => `Variante ${i + 1}: ${comboTierLabel(c, tier)}`).join(' · ')
}

/** The compact "Cualquier producto de X" summary line shown on the
 * collections list, for a collection that needs no curation at all —
 * names the actual category (or categories) instead of staying generic. */
function curationSummary(c: Collection, categories: Category[]): string | null {
  if (c.pricing_mode === 'wholesale' && c.wholesale_any_product) {
    if (c.wholesale_category_id == null) return 'Cualquier producto de la tienda'
    const name = categories.find((cat) => cat.id === c.wholesale_category_id)?.name
    return `Cualquier producto${name ? ` de ${name}` : ''}`
  }
  if (needsNoCuration(c)) {
    const names = [...new Set(c.bundle_parts.map((p) => p.category_name))]
    return `Cualquier producto de ${names.join(' y ')}`
  }
  return null
}

/** The combo/bundle parts editor's product scope control: a plain 2-option
 * toggle between "any product in the category" (matched dynamically, no
 * curation) and "one specific product" — which is chosen later, in
 * "Gestionar productos" below, not here (that section already shows exactly
 * which products are still missing for each "específico" part). */
function PartScopeToggle({ isSpecific, onChange }: { isSpecific: boolean; onChange: (isSpecific: boolean) => void }) {
  return (
    <div className="specific-product-picker">
      <div className="specific-product-picker__mode">
        <button
          type="button"
          className={`specific-product-picker__mode-btn ${!isSpecific ? 'specific-product-picker__mode-btn--active' : ''}`}
          onClick={() => onChange(false)}
        >
          Cualquier producto de esta categoría
        </button>
        <button
          type="button"
          className={`specific-product-picker__mode-btn ${isSpecific ? 'specific-product-picker__mode-btn--active' : ''}`}
          onClick={() => onChange(true)}
        >
          Producto específico
        </button>
      </div>
      {isSpecific && (
        <p className="page-block__hint specific-product-picker__note">
          El producto se agrega después, en "Gestionar productos".
        </p>
      )}
    </div>
  )
}

/** One category/specific-product row shared by the combo parts editor (with
 * a per-part quantity), the bundle parts editor (quantity + its own price,
 * so each part acts as an independent tier), and the unit parts editor
 * (neither — a flat per-unit price already applies everywhere). */
function PartRow({
  part,
  categories,
  showQty,
  showPrice,
  showGift,
  onUpdate,
  onRemove,
}: {
  part: PartDraft
  categories: Category[]
  showQty: boolean
  showPrice: boolean
  showGift: boolean
  onUpdate: (changes: Partial<PartDraft>) => void
  onRemove: () => void
}) {
  return (
    <div className="combo-parts__row">
      <select value={part.categoryId} onChange={(e) => onUpdate({ categoryId: e.target.value })}>
        <option value="">Categoría…</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
      {part.categoryId ? (
        <PartScopeToggle isSpecific={part.isSpecific} onChange={(isSpecific) => onUpdate({ isSpecific })} />
      ) : (
        <span className="page-block__hint">Elige una categoría primero</span>
      )}
      {showQty && (
        <input
          type="number"
          min="1"
          value={part.requiredQty}
          onChange={(e) => onUpdate({ requiredQty: e.target.value })}
          placeholder="Cantidad"
        />
      )}
      {showPrice && (
        <input
          type="number"
          step="0.01"
          min="0"
          value={part.price}
          onChange={(e) => onUpdate({ price: e.target.value })}
          placeholder="Precio (MXN)"
        />
      )}
      {showGift && (
        <label className="filter-check-pill">
          <input type="checkbox" checked={part.isGift} onChange={(e) => onUpdate({ isGift: e.target.checked })} />
          <span>Es regalo</span>
        </label>
      )}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove}>
        Quitar
      </button>
    </div>
  )
}

function computeDiscountPrice(price: number, type: DiscountType, value: number): number {
  let discounted: number
  if (type === 'percent') discounted = price * (1 - value / 100)
  else if (type === 'fixed_price') discounted = value
  else discounted = price - value
  return Math.max(0, discounted)
}

interface PartDraft {
  key: string
  categoryId: string
  isSpecific: boolean
  requiredQty: string
  /** Only used for pricing_mode 'bundle' — this part's own tier price. */
  price: string
  isGift: boolean
}

let partKeySeq = 0
function newPartKey() {
  partKeySeq += 1
  return `part-${partKeySeq}`
}

function newPartDraft(): PartDraft {
  return { key: newPartKey(), categoryId: '', isSpecific: false, requiredQty: '1', price: '', isGift: false }
}

/** One priced variant of a 'combo' collection — its own total price and its
 * own set of category quotas (parts), independent of the collection's other
 * tiers. See CollectionComboTier. */
interface ComboTierDraft {
  key: string
  price: string
  parts: PartDraft[]
}

let comboTierKeySeq = 0
function newComboTierKey() {
  comboTierKeySeq += 1
  return `tier-${comboTierKeySeq}`
}

function draftFromCollection(c?: Collection) {
  return {
    name: c?.name ?? '',
    adminTag: c?.admin_tag ?? '',
    description: c?.description ?? '',
    bannerImageUrl: c?.banner_image_url ?? (null as string | null),
    layoutElements: (c?.layout_json ?? []) as BannerElement[],
    imageFocusX: c?.image_focus_x ?? 50,
    imageFocusY: c?.image_focus_y ?? 50,
    promoText: c?.promo_text ?? '',
    limitedTime: !!c?.limited_time,
    limitedTimeStartsAt: c?.limited_time_starts_at ? toDateStr(new Date(c.limited_time_starts_at)) : '',
    limitedTimeEndsAt: c?.limited_time_ends_at ? toDateStr(new Date(c.limited_time_ends_at)) : '',
    pricingMode: (c?.pricing_mode ?? 'none') as CollectionPricingMode,
    unitPrice: c?.unit_price ?? '',
    unitMinQty: c?.unit_min_qty ? String(c.unit_min_qty) : '',
    bundleQty: c?.bundle_qty ? String(c.bundle_qty) : '',
    bundlePrice: c?.bundle_price ?? '',
    wholesaleCategoryId: c?.wholesale_category_id ? String(c.wholesale_category_id) : '',
    wholesaleAnyProduct: !!c?.wholesale_any_product,
    allowAddAllToCart: !!c?.allow_add_all_to_cart,
    // Combo parts live under comboTiers instead (each part belongs to
    // exactly one tier) — excluded here so they're not edited in two places.
    parts: (c?.bundle_parts ?? [])
      .filter((p) => p.combo_tier_id == null)
      .map(
        (p): PartDraft => ({
          key: newPartKey(),
          categoryId: String(p.category_id),
          isSpecific: !!p.is_specific,
          requiredQty: String(p.required_qty),
          price: p.price ?? '',
          isGift: !!p.is_gift,
        })
      ),
    comboTiers: (c?.combo_tiers ?? []).map(
      (tier): ComboTierDraft => ({
        key: newComboTierKey(),
        price: tier.price,
        parts: (c?.bundle_parts ?? [])
          .filter((p) => p.combo_tier_id === tier.id)
          .map(
            (p): PartDraft => ({
              key: newPartKey(),
              categoryId: String(p.category_id),
              isSpecific: !!p.is_specific,
              requiredQty: String(p.required_qty),
              price: '',
              isGift: !!p.is_gift,
            })
          ),
      })
    ),
  }
}

function CollectionForm({
  initial,
  categories,
  collections,
  onSubmit,
  onCancel,
}: {
  initial?: Collection
  categories: Category[]
  /** Populates the banner editor's "El botón lleva a" select for kind
   * 'button' elements linking to another collection's section. */
  collections: Collection[]
  onSubmit: (data: CollectionInput) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState(() => draftFromCollection(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBannerEditor, setShowBannerEditor] = useState(false)

  function handleToggleBannerEditor() {
    setShowBannerEditor((v) => {
      const next = !v
      // Seed the editor from the collection's plain fields the first time
      // it's opened, so switching to it doesn't start from a blank canvas.
      if (next && draft.layoutElements.length === 0) {
        setDraft((d) => ({
          ...d,
          layoutElements: seedBannerElements({
            badgeText: '',
            title: d.name,
            subtitle: d.promoText,
            ctaText: '',
            collectionSlug: null,
          }),
        }))
      }
      return next
    })
  }

  function addPart() {
    setDraft((d) => ({ ...d, parts: [...d.parts, newPartDraft()] }))
  }

  function updatePart(key: string, changes: Partial<PartDraft>) {
    setDraft((d) => ({ ...d, parts: d.parts.map((p) => (p.key === key ? { ...p, ...changes } : p)) }))
  }

  function removePart(key: string) {
    setDraft((d) => ({ ...d, parts: d.parts.filter((p) => p.key !== key) }))
  }

  function addComboTier() {
    setDraft((d) => ({ ...d, comboTiers: [...d.comboTiers, { key: newComboTierKey(), price: '', parts: [] }] }))
  }

  function removeComboTier(tierKey: string) {
    setDraft((d) => ({ ...d, comboTiers: d.comboTiers.filter((t) => t.key !== tierKey) }))
  }

  function updateComboTierPrice(tierKey: string, price: string) {
    setDraft((d) => ({ ...d, comboTiers: d.comboTiers.map((t) => (t.key === tierKey ? { ...t, price } : t)) }))
  }

  function addComboTierPart(tierKey: string) {
    setDraft((d) => ({
      ...d,
      comboTiers: d.comboTiers.map((t) => (t.key === tierKey ? { ...t, parts: [...t.parts, newPartDraft()] } : t)),
    }))
  }

  function updateComboTierPart(tierKey: string, partKey: string, changes: Partial<PartDraft>) {
    setDraft((d) => ({
      ...d,
      comboTiers: d.comboTiers.map((t) =>
        t.key === tierKey ? { ...t, parts: t.parts.map((p) => (p.key === partKey ? { ...p, ...changes } : p)) } : t
      ),
    }))
  }

  function removeComboTierPart(tierKey: string, partKey: string) {
    setDraft((d) => ({
      ...d,
      comboTiers: d.comboTiers.map((t) => (t.key === tierKey ? { ...t, parts: t.parts.filter((p) => p.key !== partKey) } : t)),
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    if (draft.pricingMode === 'combo') {
      const validTiers = draft.comboTiers.filter(
        (t) => t.price && t.parts.some((p) => p.categoryId && Number(p.requiredQty) > 0)
      )
      if (validTiers.length === 0) {
        setError('Agrega al menos una variante con precio y una categoría al paquete combinado.')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const bundleParts: CollectionBundlePartInput[] | undefined =
        draft.pricingMode === 'bundle'
          ? draft.parts
              .filter((p) => p.categoryId)
              .map((p) => ({
                categoryId: Number(p.categoryId),
                isSpecific: p.isSpecific,
                requiredQty: Number(p.requiredQty) > 0 ? Number(p.requiredQty) : 1,
                price: p.price ? Number(p.price) : null,
                isGift: p.isGift,
              }))
          : draft.pricingMode === 'unit'
            ? draft.parts
                .filter((p) => p.categoryId)
                .map((p) => ({
                  categoryId: Number(p.categoryId),
                  isSpecific: p.isSpecific,
                  requiredQty: 1,
                  isGift: p.isGift,
                }))
            : initial
              ? []
              : undefined
      const comboTiers: CollectionComboTierInput[] | undefined =
        draft.pricingMode === 'combo'
          ? draft.comboTiers
              .filter((t) => t.price && t.parts.some((p) => p.categoryId && Number(p.requiredQty) > 0))
              .map((t) => ({
                price: Number(t.price),
                parts: t.parts
                  .filter((p) => p.categoryId && Number(p.requiredQty) > 0)
                  .map((p) => ({
                    categoryId: Number(p.categoryId),
                    isSpecific: p.isSpecific,
                    requiredQty: Number(p.requiredQty),
                    isGift: p.isGift,
                  })),
              }))
          : initial
            ? []
            : undefined
      await onSubmit({
        name: draft.name.trim(),
        adminTag: draft.adminTag.trim() || null,
        description: draft.description,
        bannerImageUrl: draft.bannerImageUrl,
        layoutJson: draft.layoutElements.length > 0 ? draft.layoutElements : null,
        imageFocusX: draft.imageFocusX,
        imageFocusY: draft.imageFocusY,
        isActive: initial ? !!initial.is_active : true,
        showOnHome: initial ? !!initial.show_on_home : true,
        limitedTime: draft.limitedTime,
        // Stored as the very start/end of the picked day, so "hasta el 20"
        // reads as still valid through all of the 20th, not expiring at
        // midnight that same morning.
        limitedTimeStartsAt: draft.limitedTime && draft.limitedTimeStartsAt ? `${draft.limitedTimeStartsAt} 00:00:00` : null,
        limitedTimeEndsAt: draft.limitedTime && draft.limitedTimeEndsAt ? `${draft.limitedTimeEndsAt} 23:59:59` : null,
        sortOrder: initial?.sort_order ?? 0,
        pricingMode: draft.pricingMode,
        unitPrice: draft.pricingMode === 'unit' && draft.unitPrice ? Number(draft.unitPrice) : null,
        unitMinQty: draft.pricingMode === 'unit' && draft.unitMinQty ? Number(draft.unitMinQty) : null,
        // A bundle with per-category parts defines its price(s) entirely
        // through those parts (see bundleParts below) — the flat fields are
        // for the simpler "no categories, just N units for $X" case only.
        // Combo never uses these — every tier carries its own price instead
        // (see comboTiers below).
        bundleQty: draft.pricingMode === 'bundle' && draft.parts.length === 0 && draft.bundleQty ? Number(draft.bundleQty) : null,
        bundlePrice:
          draft.pricingMode === 'bundle' && draft.parts.length === 0 && draft.bundlePrice ? Number(draft.bundlePrice) : null,
        wholesaleCategoryId: draft.pricingMode === 'wholesale' && draft.wholesaleCategoryId ? Number(draft.wholesaleCategoryId) : null,
        wholesaleAnyProduct: draft.pricingMode === 'wholesale' && draft.wholesaleAnyProduct,
        allowAddAllToCart: draft.pricingMode === 'none' && draft.allowAddAllToCart,
        promoText: draft.promoText || null,
        bundleParts,
        comboTiers,
      })
      if (!initial) setDraft(draftFromCollection())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la colección')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="form-field">
        Nombre
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Ej. Colección Verano"
          required
        />
      </label>
      <label className="form-field">
        Etiqueta interna (opcional)
        <input
          value={draft.adminTag}
          onChange={(e) => setDraft((d) => ({ ...d, adminTag: e.target.value }))}
          placeholder="Ej. Verano 2026 — solo para diferenciar internamente"
        />
        <span className="page-block__hint">
          Solo para uso interno, no se muestra a los clientes. Úsala si necesitas repetir el mismo título en dos
          colecciones distintas.
        </span>
      </label>
      <label className="form-field">
        Descripción
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
      </label>
      <label className="form-field">
        Texto promocional del banner (opcional)
        <input
          value={draft.promoText}
          onChange={(e) => setDraft((d) => ({ ...d, promoText: e.target.value }))}
          placeholder='Ej. "Desde $500 MXN c/u" o "20 playeras a $2000 MXN"'
          disabled={draft.layoutElements.length > 0}
        />
        {draft.layoutElements.length > 0 && (
          <span className="page-block__hint">
            Este banner ya tiene un diseño personalizado (más abajo) — edita el subtítulo ahí en vez de aquí; este
            texto solo se usaría si quitas todos los elementos del editor.
          </span>
        )}
      </label>

      <label className="filter-check-pill">
        <input
          type="checkbox"
          checked={draft.limitedTime}
          onChange={(e) => setDraft((d) => ({ ...d, limitedTime: e.target.checked }))}
        />
        <span>Tiempo limitado</span>
      </label>
      {draft.limitedTime && (
        <div className="form-grid" style={{ marginTop: 8 }}>
          <label className="form-field">
            Desde (opcional)
            <input
              type="date"
              value={draft.limitedTimeStartsAt}
              onChange={(e) => setDraft((d) => ({ ...d, limitedTimeStartsAt: e.target.value }))}
            />
          </label>
          <label className="form-field">
            Hasta (opcional)
            <input
              type="date"
              value={draft.limitedTimeEndsAt}
              onChange={(e) => setDraft((d) => ({ ...d, limitedTimeEndsAt: e.target.value }))}
            />
          </label>
        </div>
      )}
      <p className="page-block__hint">
        Sin fechas, en la tienda solo se muestra la etiqueta "Tiempo limitado". Con fecha "Hasta", además aparece un
        temporizador en vivo cuando falten 3 días o menos.
      </p>

      <label className="form-field">
        Tipo de colección
        <select
          value={draft.pricingMode}
          onChange={(e) => {
            const pricingMode = e.target.value as CollectionPricingMode
            setDraft((d) => ({
              ...d,
              pricingMode,
              // Start with one empty variant so there's something to fill in
              // right away, instead of an empty section behind another click.
              comboTiers: pricingMode === 'combo' && d.comboTiers.length === 0 ? [{ key: newComboTierKey(), price: '', parts: [] }] : d.comboTiers,
            }))
          }}
        >
          <option value="none">Sin precio especial (usa el precio normal de cada producto)</option>
          <option value="unit">Precio unitario fijo (ej. "a partir de 5 piezas, $X c/u")</option>
          <option value="bundle">Paquete (N unidades por $X)</option>
          <option value="wholesale">Oferta de mayoreo (precio según la tabla de mayoreo)</option>
          <option value="combo">Paquete combinado (ej. 2 playeras + 2 gorras + 1 de regalo)</option>
        </select>
      </label>

      {draft.pricingMode === 'none' && (
        <label className="filter-check-pill">
          <input
            type="checkbox"
            checked={draft.allowAddAllToCart}
            onChange={(e) => setDraft((d) => ({ ...d, allowAddAllToCart: e.target.checked }))}
          />
          <span>Mostrar botón "Añadir todo al carrito"</span>
        </label>
      )}
      {draft.pricingMode === 'none' && draft.allowAddAllToCart && (
        <p className="page-block__hint">
          Añade de un click un producto (talla/color disponible) de cada artículo agregado en "Gestionar productos"
          de esta colección. Úsalo solo en paquetes curados con artículos específicos (ej. "Outfit de verano"), no en
          vitrinas generales como "Lo más nuevo".
        </p>
      )}

      {draft.pricingMode === 'unit' && (
        <div className="form-grid">
          <label className="form-field">
            Precio por unidad (MXN)
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.unitPrice}
              onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
              placeholder="0.00"
            />
          </label>
          <label className="form-field">
            Cantidad mínima (opcional)
            <input
              type="number"
              min="1"
              value={draft.unitMinQty}
              onChange={(e) => setDraft((d) => ({ ...d, unitMinQty: e.target.value }))}
              placeholder="Ej. 5 — vacío aplica siempre"
            />
          </label>
        </div>
      )}

      {draft.pricingMode === 'bundle' && draft.parts.length === 0 && (
        <div className="form-grid">
          <label className="form-field">
            Unidades del paquete
            <input
              type="number"
              min="1"
              value={draft.bundleQty}
              onChange={(e) => setDraft((d) => ({ ...d, bundleQty: e.target.value }))}
              placeholder="Ej. 20"
            />
          </label>
          <label className="form-field">
            Precio del paquete (MXN)
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.bundlePrice}
              onChange={(e) => setDraft((d) => ({ ...d, bundlePrice: e.target.value }))}
              placeholder="Ej. 2000"
            />
          </label>
        </div>
      )}
      {draft.pricingMode === 'bundle' && draft.parts.length > 0 && (
        <p className="page-block__hint">
          El precio total se define por cada categoría agregada abajo, no aquí.
        </p>
      )}

      {draft.pricingMode === 'wholesale' && (
        <div className="form-field">
          <label className="form-field">
            Categoría de mayoreo
            <select
              value={draft.wholesaleCategoryId}
              onChange={(e) => setDraft((d) => ({ ...d, wholesaleCategoryId: e.target.value }))}
            >
              <option value="">Todas las categorías (tabla general)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-check-pill">
            <input
              type="checkbox"
              checked={draft.wholesaleAnyProduct}
              onChange={(e) => setDraft((d) => ({ ...d, wholesaleAnyProduct: e.target.checked }))}
            />
            <span>
              {draft.wholesaleCategoryId
                ? `Cualquier producto de ${categories.find((c) => String(c.id) === draft.wholesaleCategoryId)?.name ?? 'esta categoría'}`
                : 'Cualquier producto de la tienda (todas las categorías)'}
            </span>
          </label>
          <p className="page-block__hint">
            {draft.wholesaleAnyProduct
              ? 'No necesitas agregar productos a mano en "Gestionar productos" — cuentan todos los que ya existan (y los que agregues después) en el alcance elegido arriba.'
              : 'Solo cuentan los productos que agregues manualmente a esta colección en "Gestionar productos".'}{' '}
            El precio por unidad se calcula automáticamente según los rangos de la tabla de Mayoreo de esa categoría,
            aplicados sobre la cantidad total que el cliente junte, sin importar qué productos mezcle.
          </p>
        </div>
      )}

      {draft.pricingMode === 'combo' && (
        <div className="combo-parts">
          <p className="page-block__hint">
            Define una o más variantes del paquete combinado, cada una con su propio precio total y sus propias
            categorías. Con una sola variante, el cliente ve los productos directo; con dos o más, elige primero
            entre tarjetas de variante (como en Mayoreo), por ejemplo "2 Playeras + 2 Gorras — $1380" y "3 Playeras
            + 3 Gorras — $1970". Marca "Es regalo" para las piezas que van gratis una vez completado el resto de
            esa variante.
          </p>

          {draft.comboTiers.map((tier, tierIndex) => (
            <div key={tier.key} className="combo-tier">
              <div className="combo-tier__header">
                <span className="combo-tier__title">Variante {tierIndex + 1}</span>
                <label className="form-field combo-tier__price">
                  Precio total (MXN)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.price}
                    onChange={(e) => updateComboTierPrice(tier.key, e.target.value)}
                    placeholder="Ej. 1380"
                  />
                </label>
                {draft.comboTiers.length > 1 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeComboTier(tier.key)}>
                    Quitar variante
                  </button>
                )}
              </div>
              {tier.parts.map((part) => (
                <PartRow
                  key={part.key}
                  part={part}
                  categories={categories}
                  showQty
                  showPrice={false}
                  showGift
                  onUpdate={(changes) => updateComboTierPart(tier.key, part.key, changes)}
                  onRemove={() => removeComboTierPart(tier.key, part.key)}
                />
              ))}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => addComboTierPart(tier.key)}>
                + Agregar categoría a esta variante
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={addComboTier}>
            + Agregar variante del paquete
          </button>
        </div>
      )}

      {draft.pricingMode === 'bundle' && (
        <div className="combo-parts">
          <p className="page-block__hint">
            Opcional: agrega categorías con su propia cantidad y precio para armar rangos, como en Mayoreo (ej.
            "Gorras — 2 unidades por $800" y "Gorras — 3 unidades por $1000"). Si solo agregas una categoría, el
            cliente verá directo los productos de esa categoría, sin pantalla de selección de rango. Si no agregas
            ninguna fila, se usa el precio de paquete fijo definido arriba. Marca "Es regalo" para que, dentro de esa
            cantidad, esa pieza sea gratis.
          </p>

          {draft.parts.map((part) => (
            <PartRow
              key={part.key}
              part={part}
              categories={categories}
              showQty
              showPrice
              showGift
              onUpdate={(changes) => updatePart(part.key, changes)}
              onRemove={() => removePart(part.key)}
            />
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={addPart}>
            + Agregar categoría al paquete
          </button>
        </div>
      )}

      {draft.pricingMode === 'unit' && (
        <div className="combo-parts">
          <p className="page-block__hint">
            Opcional: limita qué categorías o productos específicos cuentan para este paquete — la cantidad total ya
            se definió arriba, así que no se repite aquí. Si no agregas ninguna fila, cualquier producto que agregues
            manualmente en "Gestionar productos" cuenta normalmente. Marca "Es regalo" para que, dentro de esa
            cantidad total, esa pieza sea gratis.
          </p>

          {draft.parts.map((part) => (
            <PartRow
              key={part.key}
              part={part}
              categories={categories}
              showQty={false}
              showPrice={false}
              showGift
              onUpdate={(changes) => updatePart(part.key, changes)}
              onRemove={() => removePart(part.key)}
            />
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={addPart}>
            + Agregar categoría al paquete
          </button>
        </div>
      )}

      {draft.bannerImageUrl && (
        <ImagePreview
          imageUrl={draft.bannerImageUrl}
          onCropped={(url) => setDraft((d) => ({ ...d, bannerImageUrl: url }))}
          allowCrop={false}
        />
      )}
      <ImageUploader
        label={draft.bannerImageUrl ? 'Cambiar banner' : 'Arrastra el banner aquí'}
        sizeHint="Recomendado: 1600×700px o más, horizontal"
        onUploaded={(url) => setDraft((d) => ({ ...d, bannerImageUrl: url }))}
      />

      {draft.bannerImageUrl && (
        <>
          <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }} onClick={handleToggleBannerEditor}>
            {showBannerEditor ? 'Cerrar editor de banner' : 'Editar banner'}
          </button>
          {showBannerEditor && (
            <BannerEditor
              imageUrl={draft.bannerImageUrl}
              elements={draft.layoutElements}
              onChange={(layoutElements) => setDraft((d) => ({ ...d, layoutElements }))}
              collections={collections}
              categories={categories}
              onImageChange={(url) => setDraft((d) => ({ ...d, bannerImageUrl: url }))}
              imageFocus={{ x: draft.imageFocusX, y: draft.imageFocusY }}
              onImageFocusChange={(focus) => setDraft((d) => ({ ...d, imageFocusX: focus.x, imageFocusY: focus.y }))}
              deviceRatios={COLLECTION_DEVICE_RATIOS}
            />
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions" style={{ marginTop: 16 }}>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn--accent" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : '+ Crear colección'}
        </button>
      </div>
    </form>
  )
}

function ProductPicker({
  allProducts,
  categories,
  brands,
  excludeIds,
  initialCategoryId,
  onAdd,
}: {
  allProducts: Product[]
  categories: Category[]
  brands: Brand[]
  excludeIds: Set<number>
  initialCategoryId?: string
  onAdd: (items: { productId: number; discountPrice: number | null }[]) => void
}) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '')
  const [brandId, setBrandId] = useState('')
  const [onlyDiscounted, setOnlyDiscounted] = useState(false)
  const [onlyNew, setOnlyNew] = useState(false)
  const [onlyBestseller, setOnlyBestseller] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [discountType, setDiscountType] = useState<DiscountType | ''>('')
  const [discountValue, setDiscountValue] = useState('')

  const available = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allProducts.filter((p) => {
      if (excludeIds.has(p.id)) return false
      if (categoryId && String(p.category_id) !== categoryId) return false
      if (brandId && String(p.brand_id) !== brandId) return false
      if (onlyDiscounted && !p.discount_type) return false
      if (onlyNew && !p.is_new) return false
      if (onlyBestseller && !p.is_bestseller) return false
      if (!term) return true
      const haystack = [p.name, p.brand_name ?? '', ...p.variants.map((v) => v.barcode)].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [allProducts, excludeIds, search, categoryId, brandId, onlyDiscounted, onlyNew, onlyBestseller])

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const allSelected = available.length > 0 && available.every((p) => selected.includes(p.id))

  function toggleSelectAll() {
    setSelected(allSelected ? [] : available.map((p) => p.id))
  }

  function handleAdd() {
    if (selected.length === 0) return
    const value = Number(discountValue)
    const items = selected.map((productId) => {
      if (!discountType || !discountValue || Number.isNaN(value)) {
        return { productId, discountPrice: null }
      }
      const product = allProducts.find((p) => p.id === productId)
      const price = product ? parseFloat(product.price) : 0
      return { productId, discountPrice: computeDiscountPrice(price, discountType, value) }
    })
    onAdd(items)
    setSelected([])
    setDiscountType('')
    setDiscountValue('')
  }

  return (
    <div className="collection-picker">
      <div className="collection-picker__filters">
        <div className="search-field collection-picker__search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código de barras…"
          />
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Todas las marcas</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="collection-picker__checks">
        <label className="filter-check-pill">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          <span>Nuevo</span>
        </label>
        <label className="filter-check-pill">
          <input type="checkbox" checked={onlyBestseller} onChange={(e) => setOnlyBestseller(e.target.checked)} />
          <span>Más vendido</span>
        </label>
        <label className="filter-check-pill">
          <input type="checkbox" checked={onlyDiscounted} onChange={(e) => setOnlyDiscounted(e.target.checked)} />
          <span>Con descuento</span>
        </label>
      </div>

      <div className="collection-picker__list">
        {available.length > 0 && (
          <label className="collection-picker__select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>{allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}</span>
          </label>
        )}
        {available.map((p) => {
          const isSelected = selected.includes(p.id)
          const liveValue = Number(discountValue)
          const livePreview =
            isSelected && discountType && discountValue && !Number.isNaN(liveValue)
              ? computeDiscountPrice(parseFloat(p.price), discountType, liveValue)
              : null
          const discounted = livePreview ?? getDiscountedPrice(p)
          return (
            <label key={p.id} className="collection-picker__row">
              <input type="checkbox" checked={isSelected} onChange={() => toggle(p.id)} />
              {p.main_image_url ? <img src={p.main_image_url} alt="" /> : <div className="collection-picker__thumb" />}
              <span className="collection-picker__info">
                <strong>{p.name}</strong>
                <span>
                  {p.brand_name ?? 'Sin marca'} · {p.variants.map((v) => v.barcode).join(', ') || 'Sin SKU'}
                </span>
              </span>
              <span className="collection-picker__price">
                {discounted !== null ? (
                  <>
                    <span className={livePreview !== null ? 'collection-picker__price-live' : 'admin-table__price-discounted'}>
                      {formatPrice(discounted)}
                    </span>
                    <span className="admin-table__price-was">{formatPrice(p.price)}</span>
                  </>
                ) : (
                  formatPrice(p.price)
                )}
              </span>
            </label>
          )
        })}
        {available.length === 0 && <p className="state-msg">Ningún producto coincide con la búsqueda.</p>}
      </div>

      {selected.length > 0 && (
        <div className="collection-picker__apply">
          <span>{selected.length} seleccionado(s)</span>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType | '')}>
            <option value="">Sin descuento en esta colección</option>
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed_price">Precio fijo</option>
            <option value="amount_off">Monto a restar</option>
          </select>
          {discountType && (
            <input
              type="number"
              step="0.01"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percent' ? 'Ej. 20' : '0.00'}
            />
          )}
          <button type="button" className="btn btn--accent btn--sm" onClick={handleAdd}>
            + Agregar a la colección
          </button>
        </div>
      )}
    </div>
  )
}

function DiscountCell({
  product,
  collection,
  disabled,
  currentOverride,
  onUpdate,
}: {
  product: Product
  collection: Collection
  disabled: boolean
  /** undefined = no unsaved change, use the product's saved price; null = staged clear. */
  currentOverride: number | null | undefined
  onUpdate: (discountPrice: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState<DiscountType | ''>('')
  const [value, setValue] = useState('')

  const retailPrice = parseFloat(product.price)
  const numericValue = Number(value)
  const preview =
    type && value && !Number.isNaN(numericValue) ? computeDiscountPrice(retailPrice, type, numericValue) : null
  const current =
    currentOverride !== undefined ? currentOverride : product.collection_discount_price ? Number(product.collection_discount_price) : null
  // Shown only when there's no collection-level override — the product's own
  // discount is what will actually apply in that case (never applies while
  // a collection override exists, so it's hidden once `current` is set).
  const ownDiscountPrice = current === null ? getDiscountedPrice(product) : null

  function startEditing() {
    if (current !== null) {
      // Only the resulting price is stored, not the type/value that produced
      // it — prefill as a fixed price so the admin sees exactly what's
      // currently applied instead of blank fields.
      setType('fixed_price')
      setValue(formatUnit(current))
    } else {
      setType('')
      setValue('')
    }
    setEditing(true)
  }

  function handleApply() {
    if (preview === null) return
    onUpdate(preview)
    setEditing(false)
  }

  function handleClear() {
    onUpdate(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="discount-cell">
        {current !== null ? (
          <span className="discount-cell__current">{formatPrice(current)}</span>
        ) : collection.pricing_mode === 'unit' && collection.unit_price ? (
          <span className="discount-cell__empty">{formatPrice(collection.unit_price)} (por defecto)</span>
        ) : ownDiscountPrice !== null ? (
          <span className="discount-cell__empty">
            {formatPrice(ownDiscountPrice)} <span className="tag-wholesale">Descuento del producto</span>
          </span>
        ) : (
          <span className="discount-cell__empty">Precio normal</span>
        )}
        {!disabled && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={startEditing}>
            Editar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="discount-cell discount-cell--editing">
      <select
        value={type}
        onChange={(e) => {
          // Changing the type must never keep the old value around — it was
          // computed under the previous type (or prefilled from the current
          // resulting price) and would silently be reinterpreted, e.g. a
          // prefilled "$17" becomes "17%" and can raise the price instead of
          // lowering it.
          setType(e.target.value as DiscountType | '')
          setValue('')
        }}
      >
        <option value="">Tipo de descuento…</option>
        <option value="percent">Porcentaje (%)</option>
        <option value="fixed_price">Precio fijo</option>
        <option value="amount_off">Monto a restar</option>
      </select>
      {type && (
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === 'percent' ? 'Ej. 20' : '0.00'}
          autoFocus
        />
      )}
      {preview !== null && <span className="discount-cell__preview">→ {formatPrice(preview)}</span>}
      <button type="button" className="btn btn--accent btn--sm" onClick={handleApply} disabled={preview === null}>
        Aplicar
      </button>
      {current !== null && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleClear}>
          Quitar
        </button>
      )}
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
        Cancelar
      </button>
    </div>
  )
}

/** Guidance checklist for a 'combo' collection: how many products of each
 * part's category are already assigned vs required, with a shortcut to
 * filter the picker below to exactly that category. */
function ComboProgress({
  collection,
  wholesaleCategoryName,
  onFilterCategory,
}: {
  collection: Collection
  /** Resolved name of wholesale_category_id, when this is a wholesale
   * wildcard collection with no bundle_parts of its own. */
  wholesaleCategoryName?: string | null
  onFilterCategory: (categoryId: string) => void
}) {
  const wholesaleWildcard = collection.pricing_mode === 'wholesale' && collection.wholesale_any_product
  if (collection.bundle_parts.length === 0 && !wholesaleWildcard) return null

  return (
    <div className="combo-progress">
      {wholesaleWildcard && (
        <div className="combo-progress__row combo-progress__row--info">
          <span>Todos los productos {wholesaleCategoryName ? `de ${wholesaleCategoryName}` : 'de la tienda'} incluidos.</span>
        </div>
      )}
      {collection.bundle_parts.map((part) => {
        // "Cualquier producto" (not specific, not a gift) parts match ANY
        // product in the category at checkout time — there's nothing to
        // curate, so no progress count or filter button applies. Specific
        // and gift parts both need the admin to actually add a product
        // here, so they keep the tracking + action button.
        const needsCuration = part.is_specific || part.is_gift

        if (!needsCuration) {
          return (
            <div key={part.id} className="combo-progress__row combo-progress__row--info">
              <span>Todos los productos de {part.category_name} incluidos.</span>
            </div>
          )
        }

        const have = collection.products.filter((p) => p.category_id === part.category_id).length
        const need = part.required_qty
        const done = have >= need

        return (
          <div key={part.id} className={`combo-progress__row ${done ? 'combo-progress__row--done' : ''}`}>
            <span>
              {part.is_gift ? 'Ahora escoge el regalo — ' : ''}
              {part.category_name}: {have}/{need} producto(s) agregado(s)
              {done ? ' ✓' : ` — te faltan ${need - have}`}
            </span>
            {!done && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onFilterCategory(String(part.category_id))}
              >
                {part.is_gift ? 'Añadir regalo' : `Filtrar por ${part.category_name}`}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AssignedProducts({
  collection,
  onRemove,
  onReorder,
  onUpdateDiscount,
}: {
  collection: Collection
  onRemove: (productId: number) => Promise<void>
  onReorder: (orderedIds: number[]) => Promise<void>
  onUpdateDiscount: (productId: number, discountPrice: number | null) => Promise<void>
}) {
  // Only the id order is kept locally (for drag-reordering — always
  // available now, no "activar edición" gate); the product data itself is
  // always looked up fresh from `collection.products` below, so a discount
  // saved elsewhere never gets stuck showing a stale value.
  const [orderIds, setOrderIds] = useState(() => collection.products.map((p) => p.id))
  useEffect(() => {
    setOrderIds(collection.products.map((p) => p.id))
  }, [collection.products])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [removingSelection, setRemovingSelection] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const { toast } = useToast()
  const confirmDialog = useConfirm()

  function toggleSelected(productId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const productById = new Map(collection.products.map((p) => [p.id, p]))
  const baselineIds = collection.products.map((p) => p.id)
  const orderChanged = orderIds.join(',') !== baselineIds.join(',')

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const reordered = [...orderIds]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    setDragIndex(index)
    setOrderIds(reordered)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  function handleCancelOrder() {
    setOrderIds(baselineIds)
    setDragIndex(null)
  }

  async function handleSaveOrder() {
    setReordering(true)
    setError(null)
    try {
      await onReorder(orderIds)
      toast('Orden de productos actualizado con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el orden')
    } finally {
      setReordering(false)
    }
  }

  async function handleRemove(product: Product) {
    const ok = await confirmDialog({
      title: `¿Quitar "${product.name}" de esta colección?`,
      confirmLabel: 'Quitar',
      danger: true,
    })
    if (!ok) return
    try {
      await onRemove(product.id)
      toast(`"${product.name}" se quitó de la colección`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al quitar el producto', 'error')
    }
  }

  async function handleBulkRemove() {
    const ok = await confirmDialog({
      title: `¿Quitar ${selectedIds.size} producto(s) de esta colección?`,
      confirmLabel: 'Quitar',
      danger: true,
    })
    if (!ok) return
    setRemovingSelection(true)
    try {
      // Sequential, same as handleAddProducts's own loop — there's no bulk
      // endpoint for this, and the collection only needs to end up correct,
      // not fast (this is at most a few dozen products).
      for (const id of selectedIds) await onRemove(id)
      toast(`${selectedIds.size} producto(s) quitado(s) de la colección`)
      setSelectedIds(new Set())
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al quitar los productos', 'error')
    } finally {
      setRemovingSelection(false)
    }
  }

  const visibleOrder = orderIds.map((id) => productById.get(id)).filter((p): p is Product => !!p)
  const viewerImages = visibleOrder
    .filter((p): p is Product & { main_image_url: string } => !!p.main_image_url)
    .map((p) => ({ url: p.main_image_url, label: p.name }))

  if (visibleOrder.length === 0) return <p className="state-msg">Sin productos asignados.</p>

  return (
    <div className="assigned-products">
      {orderChanged && (
        <div className="assigned-products__header">
          <div className="variants-editor__edit-actions">
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleCancelOrder} disabled={reordering}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={handleSaveOrder} disabled={reordering}>
              {reordering ? 'Guardando…' : 'Guardar orden'}
            </button>
          </div>
        </div>
      )}
      <p className="page-block__hint">Arrastra para cambiar el orden en el catálogo.</p>

      {error && <p className="form-error">{error}</p>}

      {selectedIds.size > 0 && (
        <div className="bulk-toolbar">
          <span>{selectedIds.size} seleccionado(s)</span>
          <button type="button" className="btn btn--danger btn--sm" disabled={removingSelection} onClick={handleBulkRemove}>
            {removingSelection ? 'Quitando…' : 'Quitar seleccionados'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedIds(new Set())}>
            Cancelar selección
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="admin-table assigned-products-table">
        <thead>
          <tr>
            <th>
              <button
                type="button"
                className="icon-btn icon-btn--ghost"
                onClick={() =>
                  setSelectedIds(
                    visibleOrder.every((p) => selectedIds.has(p.id)) ? new Set() : new Set(visibleOrder.map((p) => p.id))
                  )
                }
                aria-label="Seleccionar todos"
              >
                {visibleOrder.length > 0 && visibleOrder.every((p) => selectedIds.has(p.id)) ? (
                  <CheckSquareIcon />
                ) : (
                  <SquareIcon />
                )}
              </button>
            </th>
            <th></th>
            <th></th>
            <th>Producto</th>
            <th>Precio normal</th>
            <th>Precio en esta colección</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleOrder.map((p, index) => (
            <tr key={p.id} className={dragIndex === index ? 'assigned-products-table__row--dragging' : ''} onDragOver={(e) => handleDragOver(e, index)}>
              <td>
                <button
                  type="button"
                  className="icon-btn icon-btn--ghost"
                  onClick={() => toggleSelected(p.id)}
                  aria-label={`Seleccionar ${p.name}`}
                >
                  {selectedIds.has(p.id) ? <CheckSquareIcon /> : <SquareIcon />}
                </button>
              </td>
              <td>
                <span className="image-thumbs__handle" draggable onDragStart={() => setDragIndex(index)} onDragEnd={handleDragEnd}>
                  <DragHandleIcon />
                </span>
              </td>
              <td>
                {p.main_image_url ? (
                  <button
                    type="button"
                    className="admin-table__thumb-btn"
                    onClick={() => setViewerIndex(viewerImages.findIndex((img) => img.url === p.main_image_url))}
                    aria-label="Ver imagen en grande"
                  >
                    <img src={p.main_image_url} alt="" className="admin-table__thumb" />
                  </button>
                ) : (
                  <div className="admin-table__thumb admin-table__thumb--empty" />
                )}
              </td>
              <td>{p.name}</td>
              <td>{formatPrice(p.price)}</td>
              <td>
                <DiscountCell
                  product={p}
                  collection={collection}
                  disabled={false}
                  currentOverride={undefined}
                  onUpdate={(price) => onUpdateDiscount(p.id, price)}
                />
              </td>
              <td>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleRemove(p)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {viewerIndex !== null && viewerImages.length > 0 && (
        <ImageLightbox images={viewerImages} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  )
}

export default function Collections() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<{ collectionId: number; categoryId: string } | null>(null)
  const confirm = useConfirm()
  const { toast } = useToast()
  const location = useLocation()
  const scrolledRef = useRef(false)

  function load() {
    Promise.all([api.getCollections(), api.getProducts(), api.getCategories(), api.getBrands()])
      .then(([collectionsData, productsData, categoriesData, brandsData]) => {
        setCollections(collectionsData)
        setAllProducts(productsData)
        setCategories(categoriesData)
        setBrands(brandsData)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(load, [])

  useEffect(() => {
    if (scrolledRef.current || loading || collections.length === 0) return
    const match = location.hash.match(/^#collection-(\d+)$/)
    scrolledRef.current = true
    if (!match) return
    const id = Number(match[1])
    requestAnimationFrame(() => {
      const el = document.getElementById(`collection-${id}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(id)
      window.setTimeout(() => setHighlightId(null), 2200)
    })
  }, [collections, loading, location.hash])

  async function handleCreate(data: CollectionInput) {
    const created = await api.createCollection(data)
    setCollections((prev) => [...prev, created])
    setShowCreateForm(false)
    toast(`Colección "${created.name}" creada con éxito`)
  }

  async function handleUpdate(collection: Collection, data: CollectionInput) {
    const updated = await api.updateCollection(collection.id, data)
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
    setEditingId(null)
    toast(`Colección "${updated.name}" actualizada con éxito`)
  }

  async function handleToggleActive(collection: Collection, isActive: boolean) {
    const updated = await api.updateCollection(collection.id, { isActive })
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
  }

  async function handleDelete(id: number, name: string) {
    const ok = await confirm({
      title: `¿Eliminar la colección "${name}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteCollection(id)
    setCollections((prev) => prev.filter((c) => c.id !== id))
    toast(`Colección "${name}" se eliminó con éxito`)
  }

  async function handleAddProducts(
    collection: Collection,
    items: { productId: number; discountPrice: number | null }[]
  ) {
    let updated = collection
    for (const { productId, discountPrice } of items) {
      updated = await api.addCollectionProduct(collection.id, productId, discountPrice)
    }
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
  }

  async function handleRemoveProduct(collection: Collection, productId: number) {
    const updated = await api.removeCollectionProduct(collection.id, productId)
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
  }

  async function handleReorderProducts(collection: Collection, orderedIds: number[]) {
    const updated = await api.reorderCollectionProducts(collection.id, orderedIds)
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
  }

  async function handleUpdateProductDiscount(collection: Collection, productId: number, discountPrice: number | null) {
    const updated = await api.updateCollectionProductDiscount(collection.id, productId, discountPrice)
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? updated : c)))
  }

  return (
    <div className="page-block">
      <div className="page-block__header">
        <div>
          <h1>Colecciones</h1>
          <p className="page-block__hint">
            Crea secciones personalizadas para el inicio de la tienda, con su propio banner, precios y productos
            elegidos a mano.
          </p>
        </div>
        {!showCreateForm && (
          <button type="button" className="btn btn--accent" onClick={() => setShowCreateForm(true)}>
            + Crear colección
          </button>
        )}
      </div>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && showCreateForm && (
        <div className="card" style={{ maxWidth: 620 }}>
          <div className="page-block__header">
            <h2>Nueva colección</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowCreateForm(false)}>
              Cancelar
            </button>
          </div>
          <CollectionForm categories={categories} collections={collections} onSubmit={handleCreate} />
        </div>
      )}

      {!loading && !showCreateForm && (
        <>
          <p className="page-block__hint">
            El orden y qué colecciones aparecen en Inicio o Paquetes se decide en Banners → "Orden de Inicio"/"Orden
            de Paquetes", no aquí.
          </p>

          <div className="collections-list">
          {collections.map((c) => {
            const expanded = expandedId === c.id
            const editing = editingId === c.id
            const assignedIds = new Set(c.products.map((p) => p.id))

            return (
              <div
                key={c.id}
                id={`collection-${c.id}`}
                className={`card collection-card ${highlightId === c.id ? 'collection-card--highlight' : ''}`}
              >
                <div className="collection-card__header">
                  {c.banner_image_url ? (
                    <img src={c.banner_image_url} alt="" className="collection-card__banner" />
                  ) : (
                    <div className="collection-card__banner collection-card__banner--empty" />
                  )}
                  <div className="collection-card__info">
                    <strong>{c.name}</strong>
                    {c.admin_tag && <span className="tag tag--muted" style={{ marginLeft: 6 }}>{c.admin_tag}</span>}
                    <p>
                      {curationSummary(c, categories) ?? `${c.products.length} producto(s)`}
                      {c.pricing_mode === 'unit' && c.unit_price && (
                        <>
                          {' · '}
                          {c.unit_min_qty ? `desde ${c.unit_min_qty} uds. a ` : ''}
                          {formatPrice(c.unit_price)} c/u
                        </>
                      )}
                      {c.pricing_mode === 'bundle' &&
                        c.bundle_qty &&
                        c.bundle_price &&
                        ` · ${c.bundle_qty} x ${formatPrice(c.bundle_price)}`}
                      {c.pricing_mode === 'wholesale' && ' · Precio de mayoreo según cantidad'}
                      {c.pricing_mode === 'combo' && c.combo_tiers.length > 0 && ` · ${comboLabel(c)}`}
                    </p>
                  </div>
                  <ToggleSwitch label="Activa" checked={!!c.is_active} onChange={(v) => handleToggleActive(c, v)} />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setEditingId(c.id)
                      setExpandedId(null)
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedId(expanded ? null : c.id)
                      setEditingId(null)
                    }}
                  >
                    {expanded ? 'Cerrar' : 'Gestionar productos'}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(c.id, c.name)}>
                    Eliminar
                  </button>
                </div>

                {editing && (
                  <Modal title={`Editar "${c.name}"`} onClose={() => setEditingId(null)} maxWidth={900}>
                    <CollectionForm
                      initial={c}
                      categories={categories}
                      collections={collections}
                      onSubmit={(data) => handleUpdate(c, data)}
                      onCancel={() => setEditingId(null)}
                    />
                  </Modal>
                )}

                {expanded && (
                  <div className="collection-card__products" onClick={(e) => e.stopPropagation()}>
                    {c.pricing_mode === 'bundle' && c.bundle_qty && c.bundle_price && (
                      <p className="collection-bundle-summary">
                        Paquete: {c.bundle_qty} piezas por {formatPrice(c.bundle_price)} (
                        {formatPrice(formatUnit(Number(c.bundle_price) / c.bundle_qty))} c/u)
                      </p>
                    )}
                    {c.pricing_mode === 'wholesale' && (
                      <p className="collection-bundle-summary">
                        Precio de mayoreo: se calcula con la tabla de Mayoreo → Todas las categorías, según la
                        cantidad total que el cliente elija de esta colección.
                      </p>
                    )}
                    {c.pricing_mode === 'combo' && c.combo_tiers.length > 0 && (
                      <p className="collection-bundle-summary">Paquete combinado: {comboLabel(c)}</p>
                    )}
                    <ComboProgress
                      collection={c}
                      wholesaleCategoryName={categories.find((cat) => cat.id === c.wholesale_category_id)?.name}
                      onFilterCategory={(categoryId) => setPickerCategoryFilter({ collectionId: c.id, categoryId })}
                    />
                    {needsNoCuration(c) ? (
                      <p className="page-block__hint">
                        No hay nada que agregar a mano — se incluyen automáticamente según lo configurado arriba.
                      </p>
                    ) : (
                      <>
                        <p className="page-block__hint">Arrastra para cambiar el orden en el catálogo.</p>
                        <AssignedProducts
                          key={c.products.map((p) => p.id).join(',')}
                          collection={c}
                          onRemove={(productId) => handleRemoveProduct(c, productId)}
                          onReorder={(orderedIds) => handleReorderProducts(c, orderedIds)}
                          onUpdateDiscount={(productId, discountPrice) => handleUpdateProductDiscount(c, productId, discountPrice)}
                        />

                        <ProductPicker
                          key={`${c.products.map((p) => p.id).join(',')}-${pickerCategoryFilter?.collectionId === c.id ? pickerCategoryFilter.categoryId : ''}`}
                          allProducts={allProducts}
                          categories={categories}
                          brands={brands}
                          excludeIds={assignedIds}
                          initialCategoryId={pickerCategoryFilter?.collectionId === c.id ? pickerCategoryFilter.categoryId : undefined}
                          onAdd={(items) => handleAddProducts(c, items)}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {collections.length === 0 && <p className="state-msg">Aún no hay colecciones.</p>}
          </div>
        </>
      )}
    </div>
  )
}

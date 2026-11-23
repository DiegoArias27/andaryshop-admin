import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Brand, Category, DiscountType, Product, ProductImage, Tag, WholesaleTier } from '../api/types'
import GalleryManager from '../components/GalleryManager'
import ToggleSwitch from '../components/ToggleSwitch'
import VariantsEditor, { type VariantsEditorHandle } from '../components/VariantsEditor'
import { getProductPriceInfo } from '../utils/discount'
import { formatPrice } from '../utils/currency'
import { useToast } from '../hooks/useToast'
import FormSkeleton from '../components/FormSkeleton'
import { BackIcon, ChevronRightIcon } from '../components/icons'

const LAST_CATEGORY_KEY = 'andary-admin-last-category'

// Category names are plural everywhere they're really a catalog section
// ("Sudaderas", "Playeras") — fine for nav/filters, but wrong in a product
// name built from it ("Sudadera Boss", not "Sudaderas Boss"). Handles the
// common Spanish plural patterns for clothing categories; a handful of
// invariant words (tenis, lunes…) are listed explicitly since nothing
// about their spelling alone tells singular from plural.
const INVARIANT_CATEGORY_WORDS = new Set(['tenis', 'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes'])
const STRESSED_N_SUFFIXES: [string, string][] = [
  ['anes', 'án'],
  ['enes', 'én'],
  ['ines', 'ín'],
  ['ones', 'ón'],
  ['unes', 'ún'],
]

function singularizeCategoryName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  if (INVARIANT_CATEGORY_WORDS.has(lower)) return trimmed

  for (const [suffix, replacement] of STRESSED_N_SUFFIXES) {
    if (lower.endsWith(suffix)) return trimmed.slice(0, -suffix.length) + replacement
  }

  const lastChar = lower[lower.length - 1]
  const beforeLast = lower[lower.length - 2] ?? ''
  if (lastChar === 's' && /[aeiouáéíóú]/.test(beforeLast)) {
    return trimmed.slice(0, -1)
  }

  return trimmed
}

const emptyForm = {
  name: '',
  description: '',
  price: '',
  brandId: '',
  categoryId: '',
  mainImageUrl: null as string | null,
  isNew: false,
  isFeatured: false,
  // Starts hidden, matching the "Borrador" badge shown while creating —
  // without this a brand-new product (no sizes, no photos yet) is live in
  // the storefront the instant it's created. The admin turns it on from
  // Visibilidad once it's actually ready to sell.
  isActive: false,
  discountType: '' as '' | DiscountType,
  discountValue: '',
}

type FormState = typeof emptyForm

/** What "Agregar otro producto igual" (see the button near the bottom of an
 * existing product) carries over to a fresh /productos/nuevo — everything
 * except name (regenerated from category+brand, see buildAutoName) and
 * anything tied to this specific item (tallas, fotos, isActive). */
type DuplicatePrefill = Partial<
  Pick<FormState, 'categoryId' | 'brandId' | 'price' | 'description' | 'discountType' | 'discountValue' | 'isNew' | 'isFeatured'>
>

const SECTION_FIELDS = {
  // categoryId isn't here anymore — it saves itself immediately from the
  // switches above Imágenes now (see handleCategoryChange), same
  // click-and-done idea as the rest of this page.
  basic: ['name', 'description', 'price', 'brandId'],
  discount: ['discountType', 'discountValue'],
  visibility: ['isNew', 'isFeatured', 'isActive'],
} as const

type SectionKey = keyof typeof SECTION_FIELDS

const SECTION_LABELS: Record<SectionKey, string> = {
  basic: 'Información básica',
  discount: 'Descuento',
  visibility: 'Visibilidad',
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const k of keys) result[k] = obj[k]
  return result
}

function toApiPayload(f: FormState) {
  return {
    name: f.name,
    description: f.description,
    price: Number(f.price),
    brandId: f.brandId ? Number(f.brandId) : null,
    categoryId: f.categoryId ? Number(f.categoryId) : null,
    isNew: f.isNew,
    isFeatured: f.isFeatured,
    isActive: f.isActive,
    discountType: f.discountType || null,
    discountValue: f.discountType && f.discountValue ? Number(f.discountValue) : null,
  }
}

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>()
  const isNewProduct = !id
  const navigate = useNavigate()
  const location = useLocation()
  const variantsRef = useRef<VariantsEditorHandle>(null)
  const variantsSectionRef = useRef<HTMLDivElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [productTagIds, setProductTagIds] = useState<Set<number>>(new Set())
  const [newTagName, setNewTagName] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [refsLoaded, setRefsLoaded] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [savedForm, setSavedForm] = useState<FormState>(emptyForm)
  const [images, setImages] = useState<ProductImage[]>([])
  // Kept separate from product.variants (which only ever reflects what the
  // page loaded with) and updated live via VariantsEditor's onVariantsChange
  // — same reasoning as `images` above/GalleryManager's onCommitted, just
  // for colors: without this, a color added after the page loaded never
  // showed up as a taggable option on a photo until a full reload.
  const [variants, setVariants] = useState<Product['variants']>([])
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(!isNewProduct)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fields are always editable now (no more "activar edición") — each
  // section shows its own Guardar/Cancelar bar automatically once it's
  // dirty, tracked independently so saving one section never blocks or
  // clears another that's also mid-edit.
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null)
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionKey, string>>>({})
  const [variantsEditing, setVariantsEditing] = useState(false)
  const { toast } = useToast()

  // A fresh draft (just created from a category switch or "Agregar otro
  // producto igual") keeps its auto-suggested name/price live until the
  // admin actually types over one by hand. An existing product being
  // reopened later never does — its name/price were already deliberately
  // set, even if they happen to match the pattern, and tweaking the brand
  // to fix something unrelated shouldn't silently rewrite them.
  const justCreated = !!(location.state as { justCreated?: boolean } | null)?.justCreated
  const [nameManuallyEdited, setNameManuallyEdited] = useState(!justCreated)
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(!justCreated)

  useEffect(() => {
    Promise.all([api.getCategories(), api.getBrands(), api.getWholesaleTiers(), api.getTags()])
      .then(([categoriesData, brandsData, tiersData, tagsData]) => {
        setCategories(categoriesData)
        setBrands(brandsData)
        setWholesaleTiers(tiersData)
        setTags(tagsData)
        setRefsLoaded(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isNewProduct || !id) return
    let ignore = false

    api
      .getProduct(Number(id))
      .then((data) => {
        if (ignore) return
        setProduct(data)
        const loaded: FormState = {
          name: data.name,
          description: data.description ?? '',
          price: data.price,
          brandId: data.brand_id ? String(data.brand_id) : '',
          categoryId: data.category_id ? String(data.category_id) : '',
          mainImageUrl: data.main_image_url,
          isNew: !!data.is_new,
          isFeatured: !!data.is_featured,
          isActive: !!data.is_active,
          discountType: data.discount_type ?? '',
          discountValue: data.discount_value ?? '',
        }
        setForm(loaded)
        setSavedForm(loaded)
        setImages(data.images)
        setVariants(data.variants)
        setProductTagIds(new Set(data.tags.map((t) => t.id)))
        setLoading(false)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [id, isNewProduct])

  // A low/out-of-stock notification links straight to #variantes (see
  // notificationLink.ts) — jumps to Tallas e Inventario once it's actually
  // rendered, instead of just landing at the top on Información Básica.
  useEffect(() => {
    if (loading || location.hash !== '#variantes') return
    const frame = requestAnimationFrame(() => {
      variantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [loading, location.hash])

  const productColors = useMemo(() => {
    const seen = new Set<string>()
    variants.forEach((v) => seen.add(v.color_name))
    return [...seen]
  }, [variants])

  const priceInfo = product ? getProductPriceInfo(product) : null
  const lockedByCollection = priceInfo?.type === 'discount' && priceInfo.collectionName !== null

  const discountedPricePreview = useMemo(() => {
    const price = Number(form.price)
    const value = Number(form.discountValue)
    if (!form.discountType || !form.price || !form.discountValue || Number.isNaN(price) || Number.isNaN(value)) {
      return null
    }
    let discounted: number
    if (form.discountType === 'percent') discounted = price * (1 - value / 100)
    else if (form.discountType === 'fixed_price') discounted = value
    else discounted = price - value
    return Math.max(0, discounted)
  }, [form.price, form.discountType, form.discountValue])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function isSectionDirty(section: SectionKey) {
    return SECTION_FIELDS[section].some((key) => form[key] !== savedForm[key])
  }

  function handleCancelSection(section: SectionKey) {
    setForm((prev) => ({ ...prev, ...pick(savedForm, SECTION_FIELDS[section]) }))
    setSectionErrors((prev) => ({ ...prev, [section]: undefined }))
  }

  async function handleSaveSection(section: SectionKey) {
    if (isNewProduct || !id) return
    setSavingSection(section)
    setSectionErrors((prev) => ({ ...prev, [section]: undefined }))
    try {
      const merged: FormState = { ...savedForm, ...pick(form, SECTION_FIELDS[section]) }
      await api.updateProduct(Number(id), toApiPayload(merged))
      setSavedForm(merged)
      toast(`${SECTION_LABELS[section]} actualizado con éxito`)
    } catch (err) {
      setSectionErrors((prev) => ({ ...prev, [section]: err instanceof Error ? err.message : 'Error al guardar' }))
    } finally {
      setSavingSection(null)
    }
  }

  // Información Básica has no Guardar/Cancelar bar of its own (see
  // SectionCard's hideActions below) — each field saves itself on blur
  // instead, same idea as a variant's stock field. Guards against a no-op
  // save firing on every single blur regardless of whether anything
  // actually changed (tabbing through fields without touching them).
  function saveBasicIfChanged() {
    if (isNewProduct || !isSectionDirty('basic')) return
    handleSaveSection('basic')
  }

  // The switches above Imágenes are the ONLY way to change an existing
  // product's category now (Información Básica no longer has a Categoría
  // field) — a click saves immediately, same idea as everything else on
  // this page that doesn't need its own separate Guardar step. Merges onto
  // savedForm (not form) so it can never accidentally push some OTHER
  // section's still-unsaved typed text along with it.
  async function handleCategoryChange(categoryId: string) {
    if (isNewProduct || !id) return
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, categoryId)
    } catch {
      // ignore
    }
    const merged: FormState = { ...savedForm, categoryId }
    try {
      await api.updateProduct(Number(id), toApiPayload(merged))
      setForm((prev) => ({ ...prev, categoryId }))
      setSavedForm(merged)
      toast('Categoría actualizada con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar la categoría', 'error')
    }
  }

  async function handleToggleTag(tagId: number) {
    if (!id) return
    const next = new Set(productTagIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setSavingTags(true)
    try {
      await api.setProductTags(Number(id), [...next])
      setProductTagIds(next)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar las etiquetas', 'error')
    } finally {
      setSavingTags(false)
    }
  }

  async function handleAddNewTag() {
    const name = newTagName.trim()
    if (!name || !id) return
    setSavingTags(true)
    try {
      const created = await api.createTag(name)
      setTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
      const next = new Set(productTagIds)
      next.add(created.id)
      await api.setProductTags(Number(id), [...next])
      setProductTagIds(next)
      setNewTagName('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al crear la etiqueta', 'error')
    } finally {
      setSavingTags(false)
    }
  }

  function buildAutoName(categoryId: string, brandId: string): string {
    const cat = categories.find((c) => String(c.id) === categoryId)
    const br = brands.find((b) => String(b.id) === brandId)
    return [cat && singularizeCategoryName(cat.name), br?.name].filter(Boolean).join(' ')
  }

  // The retail price is almost always just the cheapest (first) wholesale
  // tier — a category's own tiers take priority, falling back to the
  // "Todas las categorías" group the same way Wholesale.tsx's own pricing
  // already does, so the suggestion here never contradicts what the
  // storefront actually charges at quantity 1.
  function suggestedPrice(categoryId: string): string {
    const catId = categoryId ? Number(categoryId) : null
    const ownTiers = wholesaleTiers.filter((t) => t.category_id === catId)
    const pool = ownTiers.length > 0 ? ownTiers : wholesaleTiers.filter((t) => t.category_id === null)
    if (pool.length === 0) return ''
    const cheapest = [...pool].sort((a, b) => a.min_qty - b.min_qty)[0]
    return cheapest.price_per_unit
  }

  // Creates the product right away instead of waiting for a full "basics"
  // form — picking a category (see the switches below) or duplicating an
  // existing product is already enough to start: name and price are
  // auto-filled from it, and Visibilidad, Descuento, Tallas e Inventario e
  // Imágenes all become usable immediately after, exactly like any other
  // existing product (see the unified layout below).
  async function createDraft(overrides: DuplicatePrefill = {}) {
    setSaving(true)
    setError(null)
    try {
      const categoryId = overrides.categoryId ?? ''
      const brandId = overrides.brandId ?? ''
      const base: FormState = {
        ...emptyForm,
        ...overrides,
        // Falls back to a placeholder on the rare "producto igual" of a
        // product that never had a category or brand set — the backend
        // rejects a blank name outright, and an empty draft is still better
        // than a failed creation with no form left to fix it from.
        name: buildAutoName(categoryId, brandId) || 'Producto nuevo',
        price: overrides.price ?? suggestedPrice(categoryId),
        // Always starts hidden regardless of what's duplicated — see
        // emptyForm's isActive comment above.
        isActive: false,
      }
      const created = await api.createProduct({ ...toApiPayload(base), mainImageUrl: null })
      if (categoryId) {
        try {
          localStorage.setItem(LAST_CATEGORY_KEY, categoryId)
        } catch {
          // Private browsing / storage disabled — the switches still work,
          // just won't remember the choice for next time.
        }
      }
      navigate(`/productos/${created.id}`, { replace: true, state: { justCreated: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el producto')
      setSaving(false)
    }
  }

  // "Agregar otro producto igual" (bottom of an existing product) lands
  // here with its prefill in router state — creates the duplicate
  // immediately, no extra tap needed, since choosing that button was
  // already the deliberate action. Absent that, a REMEMBERED category
  // (see LAST_CATEGORY_KEY) also creates immediately — a week's drop is
  // almost always one category after another, so requiring a tap on the
  // same switch every single time was pure friction. The switches below
  // only matter the very first time, or once the remembered category
  // stops being the right guess (picking a different one there — or
  // changing Categoría in Información Básica afterward — updates it).
  useEffect(() => {
    if (!isNewProduct || !refsLoaded) return
    const prefill = (location.state as { prefill?: DuplicatePrefill } | null)?.prefill
    if (prefill) {
      createDraft(prefill)
      return
    }
    let lastCategoryId: string | null = null
    try {
      lastCategoryId = localStorage.getItem(LAST_CATEGORY_KEY)
    } catch {
      // ignore
    }
    if (lastCategoryId && categories.some((c) => String(c.id) === lastCategoryId)) {
      createDraft({ categoryId: lastCategoryId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewProduct, refsLoaded])

  function handleDuplicate() {
    navigate('/productos/nuevo', {
      state: {
        prefill: {
          categoryId: form.categoryId,
          brandId: form.brandId,
          price: form.price,
          description: form.description,
          discountType: form.discountType,
          discountValue: form.discountValue,
          isNew: form.isNew,
          isFeatured: form.isFeatured,
        } satisfies DuplicatePrefill,
      },
    })
  }

  // Keeps the name/price tracking category+brand for as long as the admin
  // hasn't typed over either by hand — see the nameManuallyEdited/
  // priceManuallyEdited comment above. Only runs once a product actually
  // exists; createDraft above handles the very first value directly.
  useEffect(() => {
    if (isNewProduct || nameManuallyEdited) return
    const suggested = buildAutoName(form.categoryId, form.brandId)
    if (suggested && suggested !== form.name) updateField('name', suggested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewProduct, form.categoryId, form.brandId, categories, brands, nameManuallyEdited])

  useEffect(() => {
    if (isNewProduct || priceManuallyEdited) return
    const suggested = suggestedPrice(form.categoryId)
    if (suggested && suggested !== form.price) updateField('price', suggested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewProduct, form.categoryId, wholesaleTiers, priceManuallyEdited])

  // Name/description/price/visibility/discount are saved independently
  // per-section above — this button's only remaining job for an existing
  // product is committing variant changes. Stays on the page afterward
  // (doesn't navigate away) — Imágenes comes right after Tallas now, and
  // tagging a photo by color needs that color to already exist.
  async function handleSaveVariants() {
    setSaving(true)
    setError(null)
    try {
      await variantsRef.current?.commit()
      toast('Tallas e inventario actualizados con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-block">
        <h1>Editar Producto</h1>
        <FormSkeleton fields={7} />
      </div>
    )
  }

  const basicFields = (
    <div className="form-grid">
      <label className="form-field">
        Marca
        <select
          value={form.brandId}
          onChange={(e) => updateField('brandId', e.target.value)}
          onBlur={saveBasicIfChanged}
          disabled={savingSection === 'basic'}
        >
          <option value="">Sin marca</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field">
        Nombre del producto
        <input
          value={form.name}
          onChange={(e) => {
            setNameManuallyEdited(true)
            updateField('name', e.target.value)
          }}
          onBlur={saveBasicIfChanged}
          placeholder="Ej. Chaqueta Aviador"
          disabled={savingSection === 'basic'}
          required
        />
        {!nameManuallyEdited && <span className="page-block__hint">Se completa solo con categoría + marca</span>}
      </label>

      <label className="form-field">
        Precio (MXN)
        <input
          type="number" inputMode="decimal"
          step="0.01"
          min="0"
          value={form.price}
          onChange={(e) => {
            setPriceManuallyEdited(true)
            updateField('price', e.target.value)
          }}
          onBlur={saveBasicIfChanged}
          placeholder="0.00"
          disabled={savingSection === 'basic'}
          required
        />
        {!priceManuallyEdited && <span className="page-block__hint">Sugerido del primer rango de mayoreo</span>}
      </label>

    </div>
  )

  const descriptionField = (
    <label className="form-field">
      Descripción
      <textarea
        rows={5}
        value={form.description}
        onChange={(e) => updateField('description', e.target.value)}
        onBlur={saveBasicIfChanged}
        placeholder="Describe el producto, materiales, corte…"
        disabled={savingSection === 'basic'}
      />
    </label>
  )

  const visibilityFields = (
    <>
      <ToggleSwitch
        label="Nuevo"
        hint="Marcar como novedad"
        checked={form.isNew}
        onChange={(v) => updateField('isNew', v)}
        disabled={savingSection === 'visibility'}
      />
      <ToggleSwitch
        label="Activo en tienda"
        hint="Visible para clientes"
        checked={form.isActive}
        onChange={(v) => updateField('isActive', v)}
        disabled={savingSection === 'visibility'}
      />
      {product && (
        <div className="bestseller-status">
          <span className={`tag ${product.is_bestseller ? 'tag--bestseller' : 'tag--muted'}`}>
            {product.is_bestseller ? '🔥 Más vendido' : 'Aún no es de los más vendidos'}
          </span>
          <p className="page-block__hint">
            Se activa solo por ventas reales — no se edita a mano. En la tienda predomina sobre "Nuevo" cuando ambos
            aplican.
          </p>
        </div>
      )}

      <div className="product-tags">
        <h3 className="product-tags__title">Etiquetas</h3>
        <div className="products-toolbar__checks">
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`filter-check-pill ${productTagIds.has(t.id) ? 'filter-check-pill--active' : ''}`}
              onClick={() => handleToggleTag(t.id)}
              disabled={savingTags}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="product-tags__add">
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nueva etiqueta"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddNewTag()
              }
            }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleAddNewTag}
            disabled={!newTagName.trim() || savingTags}
          >
            + Añadir nueva etiqueta
          </button>
        </div>
      </div>
    </>
  )

  const discountFields = (
    <>
      {lockedByCollection && priceInfo?.type === 'discount' && (
        <div className="discount-priority-banner">
          <span className="badge-pill">Prioridad</span>
          <div>
            <p className="page-block__hint" style={{ margin: 0 }}>
              Descuento activo desde la colección{' '}
              {priceInfo.collectionId ? (
                <Link to={`/colecciones#collection-${priceInfo.collectionId}`} className="text-link">
                  <strong>{priceInfo.collectionName}</strong>
                </Link>
              ) : (
                <strong>{priceInfo.collectionName}</strong>
              )}{' '}
              — es el precio que ve el cliente ahora mismo. Se edita desde Colecciones.
            </p>
            <p className="discount-preview">
              <strong>{formatPrice(priceInfo.price)}</strong>{' '}
              <span className="discount-preview__was">{formatPrice(product?.price ?? '0')}</span>
            </p>
          </div>
        </div>
      )}
      {priceInfo?.type === 'bundle' && (
        <p className="page-block__hint">
          Este producto también forma parte del paquete{' '}
          <Link to={`/colecciones#collection-${priceInfo.collectionId}`} className="text-link">
            <strong>{priceInfo.collectionName}</strong>
          </Link>{' '}
          (se edita desde Colecciones).
        </p>
      )}
      <p className="page-block__hint">
        {lockedByCollection
          ? 'Descuento propio del producto — solo se aplica si el descuento de colección de arriba se quita.'
          : 'Precio de oferta visible en toda la tienda para este producto.'}
      </p>
      <div className="form-grid">
        <label className="form-field">
          Tipo
          <select
            value={form.discountType}
            onChange={(e) => updateField('discountType', e.target.value as FormState['discountType'])}
            disabled={savingSection === 'discount'}
          >
            <option value="">Sin descuento</option>
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed_price">Precio fijo</option>
            <option value="amount_off">Monto a restar</option>
          </select>
        </label>
        {form.discountType && (
          <label className="form-field">
            Valor
            <input
              type="number" inputMode="decimal"
              step="0.01"
              min="0"
              value={form.discountValue}
              onChange={(e) => updateField('discountValue', e.target.value)}
              placeholder={form.discountType === 'percent' ? 'Ej. 20' : '0.00'}
              disabled={savingSection === 'discount'}
            />
          </label>
        )}
      </div>
      {discountedPricePreview !== null && (
        <p className="discount-preview">
          Precio con descuento: <strong>{formatPrice(discountedPricePreview)}</strong>{' '}
          <span className="discount-preview__was">{formatPrice(Number(form.price) || 0)}</span>
        </p>
      )}
    </>
  )

  let lastCategoryId: string | null = null
  try {
    lastCategoryId = localStorage.getItem(LAST_CATEGORY_KEY)
  } catch {
    // ignore
  }
  const hasValidLastCategory = !!lastCategoryId && categories.some((c) => String(c.id) === lastCategoryId)

  // Avoids a flash of the category switches right before createDraft's own
  // effect fires — either a duplicate's prefill, or a remembered category
  // auto-creating on its own (see that effect above) — since in both cases
  // this screen is never really meant to be interacted with, just a brief
  // stop en route.
  const pendingDuplicate = isNewProduct && !!(location.state as { prefill?: DuplicatePrefill } | null)?.prefill
  const pendingAutoCreate = isNewProduct && !pendingDuplicate && hasValidLastCategory

  // The last-used category floats to the front of the switches — picking
  // the same one again (the common case: a week's drop is usually all one
  // category) is then the very first button, not a search through the row.
  let orderedCategories = categories
  if (isNewProduct && hasValidLastCategory) {
    const idx = categories.findIndex((c) => String(c.id) === lastCategoryId)
    if (idx > 0) {
      orderedCategories = [...categories]
      const [match] = orderedCategories.splice(idx, 1)
      orderedCategories.unshift(match)
    }
  }

  return (
    <div className="page-block">
      <button
        type="button"
        className="icon-btn back-link"
        onClick={() => navigate('/productos')}
        aria-label="Volver"
      >
        <BackIcon />
      </button>

      <div className="editor-header">
        <div>
          <h1>{isNewProduct ? 'Nuevo Producto' : 'Editar Producto'}</h1>
        </div>
        {isNewProduct && <span className="badge-pill">Borrador</span>}
      </div>

      {isNewProduct ? (
        <div className="card">
          <h2>Categoría</h2>
          {saving || pendingDuplicate || pendingAutoCreate ? (
            <p className="state-msg">Creando producto…</p>
          ) : (
            <>
              <div className="products-toolbar__checks">
                {orderedCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="filter-check-pill"
                    disabled={!refsLoaded}
                    onClick={() => createDraft({ categoryId: String(c.id) })}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {refsLoaded && categories.length === 0 && (
                <p className="state-msg">Aún no hay categorías — crea una primero en Categorías.</p>
              )}
              {error && <p className="form-error">{error}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="editor-main">
          {product && (
            <div className="card">
              <h2>Categoría</h2>
              <div className="products-toolbar__checks">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`filter-check-pill ${String(c.id) === form.categoryId ? 'filter-check-pill--active' : ''}`}
                    onClick={() => handleCategoryChange(String(c.id))}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product && (
            <div className="card">
              <GalleryManager
                productId={product.id}
                productName={product.name}
                images={images}
                colors={productColors}
                onCommitted={setImages}
              />
            </div>
          )}

          {product && (
            <div className="card variants-editor" ref={variantsSectionRef}>
              <VariantsEditor
                ref={variantsRef}
                productId={product.id}
                initialVariants={variants}
                onDirtyChange={setVariantsEditing}
                onVariantsChange={setVariants}
              />
            </div>
          )}

          <SectionCard
            title="Información Básica"
            hideActions
            dirty={isSectionDirty('basic')}
            saving={savingSection === 'basic'}
            error={sectionErrors.basic}
          >
            {basicFields}
            {descriptionField}
          </SectionCard>

          <SectionCard
            title="Descuento"
            hint={!!product?.collections.length && `Colecciones: ${product.collections.map((c) => c.name).join(', ')}`}
            dirty={isSectionDirty('discount')}
            saving={savingSection === 'discount'}
            error={sectionErrors.discount}
            onCancel={() => handleCancelSection('discount')}
            onSave={() => handleSaveSection('discount')}
          >
            {discountFields}
          </SectionCard>

          <SectionCard
            title="Visibilidad"
            badge={!form.isActive && <span className="variants-editor__empty-hint">Oculto en tienda</span>}
            dirty={isSectionDirty('visibility')}
            saving={savingSection === 'visibility'}
            error={sectionErrors.visibility}
            onCancel={() => handleCancelSection('visibility')}
            onSave={() => handleSaveSection('visibility')}
          >
            {visibilityFields}
          </SectionCard>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/productos')}>
          {isNewProduct ? 'Cancelar' : 'Volver'}
        </button>
        {!isNewProduct && (
          <button type="button" className="btn btn--ghost" onClick={handleDuplicate}>
            + Agregar otro producto igual
          </button>
        )}
        {!isNewProduct &&
          variantsEditing && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => variantsRef.current?.cancel()}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn--accent" onClick={handleSaveVariants} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar tallas e inventario'}
              </button>
            </>
          )}
      </div>
    </div>
  )
}

/** A card whose fields are always editable — no more "activar edición" gate.
 * Its own Guardar/Cancelar bar only appears once `dirty` is true. Starts
 * collapsed (less to scroll past across 5 of these) and reopens itself the
 * moment it actually has unsaved changes to show. */
function SectionCard({
  title,
  hint,
  badge,
  dirty,
  saving,
  error,
  onCancel,
  onSave,
  // Información Básica passes this — its fields save themselves on blur
  // (see saveBasicIfChanged) instead of through a Guardar/Cancelar bar, so
  // there's nothing for this header to show beyond a brief "Guardando…".
  hideActions,
  children,
}: {
  title: string
  hint?: string | false
  badge?: ReactNode
  dirty: boolean
  saving: boolean
  error?: string
  onCancel?: () => void
  onSave?: () => void
  hideActions?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (dirty) setOpen(true)
  }, [dirty])

  return (
    <div className="card">
      <div
        className="editable-card__header collapsible-card__toggle"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <span className="collapsible-card__toggle-label">
          <ChevronRightIcon className={`collapsible-card__chevron ${open ? 'collapsible-card__chevron--open' : ''}`} />
          <h2>{title}</h2>
        </span>
        {hideActions ? (
          saving && <span className="variants-editor__empty-hint">Guardando…</span>
        ) : dirty ? (
          <div className="variants-editor__edit-actions" onClick={(e) => e.stopPropagation()}>
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        ) : (
          badge
        )}
      </div>
      {open && (
        <>
          {hint && <p className="page-block__hint">{hint}</p>}
          {children}
          {error && <p className="form-error">{error}</p>}
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Brand, Category, DiscountType, Product, ProductImage } from '../api/types'
import GalleryManager from '../components/GalleryManager'
import ToggleSwitch from '../components/ToggleSwitch'
import VariantsEditor, { type VariantsEditorHandle } from '../components/VariantsEditor'
import { getProductPriceInfo } from '../utils/discount'
import { formatPrice } from '../utils/currency'
import { useToast } from '../hooks/useToast'
import FormSkeleton from '../components/FormSkeleton'
import { BackIcon } from '../components/icons'

const emptyForm = {
  name: '',
  description: '',
  price: '',
  brandId: '',
  categoryId: '',
  mainImageUrl: null as string | null,
  isNew: false,
  isFeatured: false,
  isActive: true,
  discountType: '' as '' | DiscountType,
  discountValue: '',
}

type FormState = typeof emptyForm

const SECTION_FIELDS = {
  basic: ['name', 'description', 'price', 'brandId', 'categoryId'],
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

  useEffect(() => {
    api
      .getCategories()
      .then(setCategories)
      .catch(() => {})
    api
      .getBrands()
      .then(setBrands)
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

  // Creates the product from just the basics — Visibilidad, Descuento,
  // Tallas e Inventario and Imágenes all become editable right after,
  // exactly like an existing product (see the unified layout below). Tallas
  // comes before Imágenes there on purpose: a photo can only be tagged by
  // color once that color actually exists (see GalleryManager).
  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // No photo yet — Imágenes only becomes available below once the
      // product (and its colors) exist; GalleryManager sets this once the
      // first one is added there.
      const created = await api.createProduct({ ...toApiPayload(form), mainImageUrl: null })
      toast(`Producto "${created.name}" creado con éxito`)
      navigate(`/productos/${created.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

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
        Nombre del producto
        <input
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Ej. Chaqueta Aviador"
          disabled={savingSection === 'basic'}
          required
        />
      </label>

      <label className="form-field">
        Marca
        <select
          value={form.brandId}
          onChange={(e) => updateField('brandId', e.target.value)}
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
        Precio (MXN)
        <input
          type="number" inputMode="decimal"
          step="0.01"
          min="0"
          value={form.price}
          onChange={(e) => updateField('price', e.target.value)}
          placeholder="0.00"
          disabled={savingSection === 'basic'}
          required
        />
      </label>

      <label className="form-field">
        Categoría
        <select
          value={form.categoryId}
          onChange={(e) => updateField('categoryId', e.target.value)}
          disabled={savingSection === 'basic'}
        >
          <option value="">Selecciona una categoría…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
          <p>
            {isNewProduct
              ? 'Introduce los detalles del nuevo artículo para el catálogo.'
              : `Actualiza la información de "${product?.name}".`}
          </p>
        </div>
        {isNewProduct && <span className="badge-pill">Borrador</span>}
      </div>

      <div className="editor-grid">
        <div className="editor-main">
          {isNewProduct ? (
            <div className="card">
              <h2>Información Básica</h2>
              <form id="product-form" onSubmit={handleCreateSubmit}>
                {basicFields}
                {descriptionField}
                {error && <p className="form-error">{error}</p>}
              </form>
            </div>
          ) : (
            <SectionCard
              title="Información Básica"
              dirty={isSectionDirty('basic')}
              saving={savingSection === 'basic'}
              error={sectionErrors.basic}
              onCancel={() => handleCancelSection('basic')}
              onSave={() => handleSaveSection('basic')}
            >
              {basicFields}
              {descriptionField}
            </SectionCard>
          )}

          {!isNewProduct && (
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
          )}

          {!isNewProduct && (
            <SectionCard
              title="Visibilidad"
              dirty={isSectionDirty('visibility')}
              saving={savingSection === 'visibility'}
              error={sectionErrors.visibility}
              onCancel={() => handleCancelSection('visibility')}
              onSave={() => handleSaveSection('visibility')}
            >
              {visibilityFields}
            </SectionCard>
          )}

          {/* Right after Visibilidad/Descuento and before Imágenes — on
              mobile (where this column and editor-side below stack in DOM
              order) that puts Tallas e Inventario right before Imágenes, so
              a photo's color dropdown there actually has colors to offer
              instead of the two being in the wrong order to depend on each
              other. */}
          {!isNewProduct && product && (
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
        </div>

        {!isNewProduct && product && (
          <div className="editor-side">
            <div className="card">
              <GalleryManager productId={Number(id)} images={images} colors={productColors} onCommitted={setImages} />
            </div>
          </div>
        )}
      </div>

      {isNewProduct && (
        <p className="page-block__hint">
          Visibilidad, descuento, tallas/colores/stock y fotos se agregan aquí mismo en cuanto guardes esta
          información básica.
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/productos')}>
          {isNewProduct ? 'Cancelar' : 'Volver'}
        </button>
        {isNewProduct ? (
          <button type="submit" form="product-form" className="btn btn--accent" disabled={saving}>
            {saving ? 'Guardando…' : 'Crear y continuar'}
          </button>
        ) : (
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
          )
        )}
      </div>
    </div>
  )
}

/** A card whose fields are always editable — no more "activar edición" gate.
 * Its own Guardar/Cancelar bar only appears once `dirty` is true. */
function SectionCard({
  title,
  hint,
  dirty,
  saving,
  error,
  onCancel,
  onSave,
  children,
}: {
  title: string
  hint?: string | false
  dirty: boolean
  saving: boolean
  error?: string
  onCancel: () => void
  onSave: () => void
  children: ReactNode
}) {
  return (
    <div className="card">
      <div className="editable-card__header">
        <h2>{title}</h2>
        {dirty && (
          <div className="variants-editor__edit-actions">
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
      {hint && <p className="page-block__hint">{hint}</p>}
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

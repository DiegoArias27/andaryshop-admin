import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Brand, Category, DiscountType, Product, ProductImage } from '../api/types'
import GalleryManager from '../components/GalleryManager'
import DraftGalleryManager from '../components/DraftGalleryManager'
import ToggleSwitch from '../components/ToggleSwitch'
import VariantsEditor, { type VariantsEditorHandle } from '../components/VariantsEditor'
import { getProductPriceInfo } from '../utils/discount'
import { formatPrice } from '../utils/currency'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'
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
  const variantsRef = useRef<VariantsEditorHandle>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [savedForm, setSavedForm] = useState<FormState>(emptyForm)
  const [images, setImages] = useState<ProductImage[]>([])
  // New-product-only: every image uploaded before the product exists (no
  // product_id yet to attach a gallery to) — the first one is always the
  // cover photo; the rest get attached as gallery images right after
  // creation succeeds, in the same order arranged here.
  const [draftImages, setDraftImages] = useState<string[]>([])
  // Kept in sync below so the unmount cleanup effect (which only runs once,
  // with an empty dep array) always sees the latest draft list instead of
  // the one captured when it was first set up.
  const draftImagesRef = useRef<string[]>([])
  // Flips true right before navigating away after a successful create, so
  // that same unmount doesn't turn around and delete the photos that now
  // belong to the real, just-saved product.
  const createdRef = useRef(false)
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
    draftImagesRef.current = draftImages
  }, [draftImages])

  // Covers every way of leaving the create-product form without saving —
  // the back arrow, the "Cancelar" button, browser back/forward — since all
  // of them navigate to a different route and unmount this component.
  // Anything left in draftImages at that point was uploaded but never
  // attached to a real product, so it's safe to delete.
  useEffect(() => {
    if (!isNewProduct) return
    return () => {
      if (createdRef.current) return
      for (const url of draftImagesRef.current) {
        api.deleteImage(url).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const productColors = useMemo(() => {
    const seen = new Set<string>()
    ;(product?.variants ?? []).forEach((v) => seen.add(v.color_name))
    return [...seen]
  }, [product])

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

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await api.createProduct({ ...toApiPayload(form), mainImageUrl: draftImages[0] ?? null })
      const rest = draftImages.slice(1)
      if (rest.length > 0) await api.addProductImages(created.id, rest)
      createdRef.current = true
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
  // product is committing variant changes.
  async function handleSaveVariants() {
    setSaving(true)
    setError(null)
    try {
      await variantsRef.current?.commit()
      toast('Tallas e inventario actualizados con éxito')
      navigate('/productos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

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
          type="number"
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
              type="number"
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

          {isNewProduct ? (
            <div className="card">
              <h2>Descuento</h2>
              {discountFields}
            </div>
          ) : (
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

          {isNewProduct ? (
            <div className="card">
              <h2>Visibilidad</h2>
              {visibilityFields}
            </div>
          ) : (
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
        </div>

        <div className="editor-side">
          <div className="card">
            {isNewProduct ? (
              <>
                <h2>Imágenes</h2>
                <DraftGalleryManager images={draftImages} onChange={setDraftImages} />
              </>
            ) : (
              <GalleryManager productId={Number(id)} images={images} colors={productColors} onCommitted={setImages} />
            )}
          </div>
        </div>
      </div>

      {isNewProduct && (
        <p className="page-block__hint">
          Guarda el producto primero; después podrás agregar tallas/colores/stock y más fotos.
        </p>
      )}

      {!isNewProduct && product && (
        <div className="card variants-editor" style={{ marginTop: 32, maxWidth: 1000 }}>
          <VariantsEditor
            ref={variantsRef}
            productId={product.id}
            initialVariants={product.variants}
            onDirtyChange={setVariantsEditing}
          />
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/productos')}>
          {isNewProduct ? 'Cancelar' : 'Volver'}
        </button>
        {isNewProduct ? (
          <button type="submit" form="product-form" className="btn btn--accent" disabled={saving}>
            {saving ? 'Guardando…' : 'Crear producto'}
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

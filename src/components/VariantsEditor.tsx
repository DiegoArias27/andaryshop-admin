import { forwardRef, useEffect, useImperativeHandle, useState, type DragEvent, type FormEvent } from 'react'
import { api } from '../api/client'
import type { ProductVariant } from '../api/types'
import { CopyIcon, DragHandleIcon } from './icons'
import { useToast } from '../hooks/useToast'

interface VariantsEditorProps {
  productId: number
  initialVariants: ProductVariant[]
  /** Fires whenever there are unsaved changes to commit/cancel — lets the
   * parent show its own Guardar/Cancelar bar for this section. */
  onDirtyChange?: (dirty: boolean) => void
}

export interface VariantsEditorHandle {
  commit: () => Promise<void>
  cancel: () => void
}

const emptyDraft = { size: '', colorName: '', colorHex: '#0d0d0d', barcode: '', stock: '0' }
const LOW_STOCK_THRESHOLD = 5

let tempIdCounter = -1

function sanitizeCode(value: string, len: number): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
  return (cleaned.slice(0, len) || 'X'.repeat(len)).padEnd(len, 'X')
}

/** Same product → same base (its id), differing only in the size/color
 * suffix — so a product's variants get visibly related barcodes while every
 * talla/color combo still gets a distinct one. Falls back to a numeric
 * disambiguator on a collision (e.g. two colors sharing an initial). */
function suggestBarcode(productId: number, size: string, colorName: string, taken: Set<string>): string {
  const base = String(productId).padStart(5, '0')
  const sizeCode = sanitizeCode(size, 2)
  const colorCode = sanitizeCode(colorName, 2)
  let candidate = `${base}${sizeCode}${colorCode}`
  let n = 1
  while (taken.has(candidate)) {
    candidate = `${base}${sizeCode}${colorCode}${n}`
    n++
  }
  return candidate
}

const VariantsEditor = forwardRef<VariantsEditorHandle, VariantsEditorProps>(function VariantsEditor(
  { productId, initialVariants, onDirtyChange },
  ref
) {
  const [baseline, setBaseline] = useState<ProductVariant[]>(initialVariants)
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [barcodeManuallyEdited, setBarcodeManuallyEdited] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Suggests a barcode as soon as talla+color are both filled — same
  // product, same base, only the size/color suffix changes — without
  // clobbering anything the admin already typed by hand.
  useEffect(() => {
    if (barcodeManuallyEdited || !draft.size || !draft.colorName) return
    const taken = new Set(variants.map((v) => v.barcode))
    const suggestion = suggestBarcode(productId, draft.size, draft.colorName, taken)
    setDraft((d) => (d.barcode === suggestion ? d : { ...d, barcode: suggestion }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.size, draft.colorName, barcodeManuallyEdited])

  async function handleCopyBarcode(barcode: string) {
    try {
      await navigator.clipboard.writeText(barcode)
      toast('Código de barras copiado')
    } catch {
      toast('No se pudo copiar el código', 'error')
    }
  }

  function isDirtyRow(v: ProductVariant, original: ProductVariant | undefined) {
    if (!original) return true
    return (
      original.stock !== v.stock ||
      original.size !== v.size ||
      original.color_name !== v.color_name ||
      original.color_hex !== v.color_hex ||
      original.barcode !== v.barcode
    )
  }

  const orderChanged = variants.map((v) => v.id).join(',') !== baseline.map((v) => v.id).join(',')

  const dirty =
    orderChanged ||
    pendingDeleteIds.length > 0 ||
    variants.length !== baseline.length ||
    variants.some((v) => isDirtyRow(v, baseline.find((b) => b.id === v.id)))

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!draft.size || !draft.colorName || !draft.barcode) return
    const newVariant: ProductVariant = {
      id: tempIdCounter--,
      product_id: productId,
      size: draft.size,
      color_name: draft.colorName,
      color_hex: draft.colorHex,
      barcode: draft.barcode,
      stock: Number(draft.stock) || 0,
      sort_order: variants.length,
    }
    setVariants((prev) => [...prev, newVariant])
    setDraft(emptyDraft)
    setBarcodeManuallyEdited(false)
  }

  function updateVariantField<K extends keyof ProductVariant>(variantId: number, field: K, value: ProductVariant[K]) {
    setVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)))
  }

  // An existing row's barcode has no auto-fill effect like the "add new"
  // draft does — only guard against actually saving one blank (which would
  // also collide under the column's UNIQUE constraint the moment a second
  // row was ever left blank too).
  function handleBarcodeBlur(v: ProductVariant) {
    if (v.barcode.trim()) return
    const taken = new Set(variants.filter((x) => x.id !== v.id).map((x) => x.barcode))
    const suggestion = suggestBarcode(productId, v.size, v.color_name, taken)
    updateVariantField(v.id, 'barcode', suggestion)
  }

  function handleDelete(variantId: number) {
    if (variantId < 0) {
      setVariants((prev) => prev.filter((v) => v.id !== variantId))
      return
    }
    setVariants((prev) => prev.filter((v) => v.id !== variantId))
    setPendingDeleteIds((prev) => [...prev, variantId])
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const reordered = [...variants]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    setDragIndex(index)
    setVariants(reordered)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  function handleCancelEdits() {
    setVariants(baseline)
    setPendingDeleteIds([])
    setDraft(emptyDraft)
    setBarcodeManuallyEdited(false)
    setError(null)
  }

  useImperativeHandle(ref, () => ({
    async commit() {
      if (!dirty) return
      setError(null)
      try {
        for (const id of pendingDeleteIds) {
          await api.deleteVariant(id)
        }

        const nextVariants: ProductVariant[] = []
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i]
          if (v.id < 0) {
            const created = await api.addVariant(productId, {
              size: v.size,
              colorName: v.color_name,
              colorHex: v.color_hex,
              barcode: v.barcode,
              stock: v.stock,
              sortOrder: i,
            })
            nextVariants.push(created)
            continue
          }
          const original = baseline.find((b) => b.id === v.id)
          const rowChanged = original && isDirtyRow(v, original)
          const orderMoved = original && original.sort_order !== i
          if (rowChanged || orderMoved) {
            const updated = await api.updateVariant(v.id, {
              size: v.size,
              colorName: v.color_name,
              colorHex: v.color_hex,
              barcode: v.barcode,
              stock: v.stock,
              sortOrder: i,
            })
            nextVariants.push(updated)
          } else {
            nextVariants.push(v)
          }
        }

        setBaseline(nextVariants)
        setVariants(nextVariants)
        setPendingDeleteIds([])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar tallas e inventario')
        throw err
      }
    },
    cancel: handleCancelEdits,
  }))

  return (
    <div className="variants-editor-body">
      <div className="variants-editor__header">
        <h2>Tallas e Inventario</h2>
        {dirty && <span className="variants-editor__dirty-hint">Cambios sin guardar</span>}
      </div>

      <div className="editable-card__content">
        <div className="table-wrap">
          <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Talla</th>
              <th>Color</th>
              <th>Código de barras (SKU)</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, index) => (
              <tr
                key={v.id}
                className={[
                  dragIndex === index ? 'assigned-products-table__row--dragging' : '',
                  v.stock === 0 ? 'variants-table__row--outofstock' : '',
                  v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD ? 'variants-table__row--lowstock' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDragOver={(e) => handleDragOver(e, index)}
              >
                <td>
                  <span
                    className="image-thumbs__handle"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={handleDragEnd}
                  >
                    <DragHandleIcon />
                  </span>
                </td>
                <td>
                  <input
                    value={v.size}
                    className="variant-input variant-input--size"
                    onChange={(e) => updateVariantField(v.id, 'size', e.target.value)}
                  />
                </td>
                <td>
                  <div className="variant-color-field">
                    <input
                      type="color"
                      className="variant-color-swatch"
                      value={v.color_hex}
                      onChange={(e) => updateVariantField(v.id, 'color_hex', e.target.value)}
                    />
                    <input
                      value={v.color_name}
                      className="variant-input"
                      onChange={(e) => updateVariantField(v.id, 'color_name', e.target.value)}
                    />
                  </div>
                </td>
                <td>
                  <div className="variant-barcode-cell">
                    <input
                      value={v.barcode}
                      className="variant-input"
                      onChange={(e) => updateVariantField(v.id, 'barcode', e.target.value)}
                      onBlur={() => handleBarcodeBlur(v)}
                    />
                    <button
                      type="button"
                      className="variant-copy-btn"
                      onClick={() => handleCopyBarcode(v.barcode)}
                      aria-label="Copiar código de barras"
                      title="Copiar código de barras"
                    >
                      <CopyIcon />
                    </button>
                  </div>
                </td>
                <td>
                  <div className="variant-stock-cell">
                    <input
                      type="number"
                      min="0"
                      value={v.stock}
                      className="stock-input"
                      onChange={(e) => updateVariantField(v.id, 'stock', Number(e.target.value))}
                    />
                    {v.stock === 0 && <span className="tag tag--outofstock">Agotado</span>}
                    {v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD && (
                      <span className="tag tag--lowstock">Bajo stock</span>
                    )}
                  </div>
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(v.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {variants.length === 0 && (
              <tr>
                <td colSpan={6} className="state-msg">
                  Aún no hay variantes.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      <form className="variant-form" onSubmit={handleAdd}>
          <input
            placeholder="Talla (S, M, L…)"
            value={draft.size}
            onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))}
            required
          />
          <input
            placeholder="Color (Negro…)"
            value={draft.colorName}
            onChange={(e) => setDraft((d) => ({ ...d, colorName: e.target.value }))}
            required
          />
          <input
            type="color"
            className="variant-color-swatch"
            value={draft.colorHex}
            onChange={(e) => setDraft((d) => ({ ...d, colorHex: e.target.value }))}
          />
          <input
            placeholder="Código de barras (automático)"
            value={draft.barcode}
            onChange={(e) => {
              setBarcodeManuallyEdited(true)
              setDraft((d) => ({ ...d, barcode: e.target.value }))
            }}
            required
          />
          <input
            type="number"
            min="0"
            placeholder="Stock"
            value={draft.stock}
            onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
            required
          />
          <button type="submit" className="btn btn--primary btn--sm">
            + Agregar variante
          </button>
      </form>

      {error && <p className="form-error">{error}</p>}
    </div>
  )
})

export default VariantsEditor

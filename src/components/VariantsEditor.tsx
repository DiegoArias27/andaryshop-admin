import { forwardRef, useEffect, useImperativeHandle, useState, type DragEvent, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import type { ProductVariant } from '../api/types'
import { ChevronRightIcon, CopyIcon, DragHandleIcon } from './icons'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import NumberField from './NumberField'

interface VariantsEditorProps {
  productId: number
  initialVariants: ProductVariant[]
  /** Fires whenever there are unsaved changes to commit/cancel — lets the
   * parent show its own Guardar/Cancelar bar for this section. */
  onDirtyChange?: (dirty: boolean) => void
  /** Fires with the actually-saved variant list whenever it changes (a new
   * one added, an undo, or a batch commit) — same idea as GalleryManager's
   * onCommitted. Lets the parent keep its own color list (used to tag
   * photos by color) in sync instead of it staying frozen at whatever
   * variants existed when the page first loaded. */
  onVariantsChange?: (variants: ProductVariant[]) => void
}

export interface VariantsEditorHandle {
  commit: () => Promise<void>
  cancel: () => void
}

const emptyDraft = { size: '', colorName: '', colorHex: '#0d0d0d', barcode: '', stock: '' }
const LOW_STOCK_THRESHOLD = 5

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
  { productId, initialVariants, onDirtyChange, onVariantsChange },
  ref
) {
  const [baseline, setBaseline] = useState<ProductVariant[]>(initialVariants)
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants)
  const [draft, setDraft] = useState(emptyDraft)
  const [barcodeManuallyEdited, setBarcodeManuallyEdited] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const confirm = useConfirm()
  // Closed by default (less to scroll past) — opens itself when a low-
  // stock notification deep-links straight here (see ProductEditor.tsx's
  // #variantes scroll effect), or when there's nothing here yet: right
  // after creating a product this is empty and unmissable instead of
  // hidden behind a collapsed accordion a new admin has no reason to open.
  const location = useLocation()
  const [open, setOpen] = useState(() => location.hash === '#variantes' || initialVariants.length === 0)

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

  // Stock has its own immediate save (see handleStockBlur) and delete is
  // immediate too (see handleDelete) — neither counts toward this dirty/
  // batch flow (size, color and barcode edits, plus reordering, still do).
  function isDirtyRow(v: ProductVariant, original: ProductVariant | undefined) {
    if (!original) return true
    return (
      original.size !== v.size ||
      original.color_name !== v.color_name ||
      original.color_hex !== v.color_hex ||
      original.barcode !== v.barcode
    )
  }

  const orderChanged = variants.map((v) => v.id).join(',') !== baseline.map((v) => v.id).join(',')

  const dirty = orderChanged || variants.some((v) => isDirtyRow(v, baseline.find((b) => b.id === v.id)))

  useEffect(() => {
    onDirtyChange?.(dirty)
    if (dirty) setOpen(true)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    onVariantsChange?.(baseline)
  }, [baseline, onVariantsChange])

  // Adding a variant saves immediately instead of joining the dirty/"Guardar
  // tallas e inventario" batch like size/color/barcode edits still do — it
  // was confusing to add one and have it just sit there unsaved, easy to
  // lose by navigating away. Just a confirmation — "Deshacer" here would be
  // redundant with the row's own "Eliminar" right after adding by mistake.
  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!draft.size || !draft.colorName || !draft.barcode) return
    const submitted = draft
    setDraft(emptyDraft)
    setBarcodeManuallyEdited(false)
    try {
      const created = await api.addVariant(productId, {
        size: submitted.size,
        colorName: submitted.colorName,
        colorHex: submitted.colorHex,
        barcode: submitted.barcode,
        stock: Number(submitted.stock) || 0,
        sortOrder: variants.length,
      })
      setVariants((prev) => [...prev, created])
      setBaseline((prev) => [...prev, created])
      toast(`Variante "${created.size} · ${created.color_name}" agregada`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar la variante')
      setDraft(submitted)
      setBarcodeManuallyEdited(true)
    }
  }

  function updateVariantField<K extends keyof ProductVariant>(variantId: number, field: K, value: ProductVariant[K]) {
    setVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)))
  }

  function saveVariantFields(v: ProductVariant, overrides: Partial<ProductVariant> = {}) {
    return api.updateVariant(v.id, {
      size: overrides.size ?? v.size,
      colorName: overrides.color_name ?? v.color_name,
      colorHex: overrides.color_hex ?? v.color_hex,
      barcode: overrides.barcode ?? v.barcode,
      stock: overrides.stock ?? v.stock,
      sortOrder: overrides.sort_order ?? v.sort_order,
    })
  }

  // Stock saves immediately on blur (not part of the dirty/"Guardar tallas
  // e inventario" batch) — it's the field changed most often and on its
  // own, and "Deshacer" covers typing the wrong number by mistake.
  async function handleStockBlur(variantId: number) {
    const current = variants.find((x) => x.id === variantId)
    const original = baseline.find((x) => x.id === variantId)
    if (!current || !original || current.stock === original.stock) return
    const previousStock = original.stock
    try {
      const updated = await saveVariantFields(current)
      setVariants((prev) => prev.map((x) => (x.id === variantId ? updated : x)))
      setBaseline((prev) => prev.map((x) => (x.id === variantId ? updated : x)))
      toast(`Stock de "${updated.size} · ${updated.color_name}" actualizado a ${updated.stock}`, 'success', {
        label: 'Deshacer',
        onClick: () => handleUndoStock(variantId, previousStock),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el stock')
      setVariants((prev) => prev.map((x) => (x.id === variantId ? { ...x, stock: previousStock } : x)))
    }
  }

  async function handleUndoStock(variantId: number, previousStock: number) {
    const current = variants.find((x) => x.id === variantId) ?? baseline.find((x) => x.id === variantId)
    if (!current) return
    try {
      const updated = await saveVariantFields(current, { stock: previousStock })
      setVariants((prev) => prev.map((x) => (x.id === variantId ? updated : x)))
      setBaseline((prev) => prev.map((x) => (x.id === variantId ? updated : x)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al deshacer', 'error')
    }
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

  // Immediate (not part of the Guardar batch) — a confirm dialog first is
  // the safety net here instead of an after-the-fact "Deshacer".
  async function handleDelete(v: ProductVariant) {
    const ok = await confirm({
      title: `¿Eliminar la variante "${v.size} · ${v.color_name}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteVariant(v.id)
      setVariants((prev) => prev.filter((x) => x.id !== v.id))
      setBaseline((prev) => prev.filter((x) => x.id !== v.id))
      toast(`Variante "${v.size} · ${v.color_name}" eliminada`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al eliminar la variante', 'error')
    }
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
    setDraft(emptyDraft)
    setBarcodeManuallyEdited(false)
    setError(null)
  }

  useImperativeHandle(ref, () => ({
    async commit() {
      if (!dirty) return
      setError(null)
      try {
        const nextVariants: ProductVariant[] = []
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i]
          const original = baseline.find((b) => b.id === v.id)
          const rowChanged = original && isDirtyRow(v, original)
          const orderMoved = original && original.sort_order !== i
          if (rowChanged || orderMoved) {
            const updated = await saveVariantFields(v, { sort_order: i })
            nextVariants.push(updated)
          } else {
            nextVariants.push(v)
          }
        }

        setBaseline(nextVariants)
        setVariants(nextVariants)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar tallas e inventario')
        throw err
      }
    },
    cancel: handleCancelEdits,
  }))

  return (
    <div className="variants-editor-body">
      <div
        className="variants-editor__header collapsible-card__toggle"
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
          <h2>Tallas e Inventario</h2>
        </span>
        {variants.length === 0 ? (
          <span className="variants-editor__empty-hint">Sin tallas aún</span>
        ) : (
          dirty && <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
        )}
      </div>

      {open && (
      <>
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
                <td className="admin-table__cell--media">
                  <span
                    className="image-thumbs__handle"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={handleDragEnd}
                  >
                    <DragHandleIcon />
                  </span>
                </td>
                <td data-label="Talla">
                  <input
                    value={v.size}
                    className="variant-input variant-input--size"
                    onChange={(e) => updateVariantField(v.id, 'size', e.target.value)}
                  />
                </td>
                <td data-label="Color">
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
                <td data-label="Código de barras">
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
                <td data-label="Stock">
                  <div className="variant-stock-cell">
                    <NumberField
                      // Keyed on the SAVED stock (baseline), not the live one
                      // — reseeds the field after a save/"Deshacer" changes
                      // it externally, without remounting (and losing focus)
                      // on every keystroke, which keying on the live value
                      // would do.
                      key={`${v.id}-${baseline.find((b) => b.id === v.id)?.stock}`}
                      min={0}
                      value={v.stock}
                      className="stock-input"
                      onValueChange={(n) => updateVariantField(v.id, 'stock', n)}
                      onBlur={() => handleStockBlur(v.id)}
                      // type="number" inputs don't support .select() in
                      // Chrome (selectionStart/End are always null on them) —
                      // clearing the value outright is what actually lets a
                      // click/tap here replace the old number by typing,
                      // instead of needing to delete each digit first. Safe:
                      // NumberField's own onBlur restores the last committed
                      // value if this is left empty (clicked away without
                      // typing a new one), so nothing is lost by accident.
                      onFocus={(e) => {
                        e.target.value = ''
                      }}
                    />
                    {v.stock === 0 && <span className="tag tag--outofstock">Agotado</span>}
                    {v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD && (
                      <span className="tag tag--lowstock">Bajo stock</span>
                    )}
                  </div>
                </td>
                <td className="admin-table__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(v)}>
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
            type="number" inputMode="numeric"
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
      </>
      )}
    </div>
  )
})

export default VariantsEditor

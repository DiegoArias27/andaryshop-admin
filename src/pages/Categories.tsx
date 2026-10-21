import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Category, PackagesTile } from '../api/types'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'
import ImageUploader from '../components/ImageUploader'
import ImagePositionEditor from '../components/ImagePositionEditor'
import Modal from '../components/Modal'
import { DragHandleIcon } from '../components/icons'

const CATEGORY_TILE_RATIO = '2.2 / 1'
// Kept in sync with CATEGORY_TILE_RATIO by hand — 1100×500 is exactly 2.2:1.
// The old hint here used to say 800×500 (really a 1.6:1 shape), which never
// actually matched this tile's real 2.2:1 box.
const CATEGORY_TILE_SIZE_HINT = 'Recomendado: 1100×500px o más, horizontal'

/** The home page's fixed "Paquetes" tile (see CategoryShowcase in
 * frontend/src/pages/Catalog.tsx) isn't a real category — it's always
 * pinned last in "Comprar por categoría" — but it deserves the same photo/
 * tagline control every real category already has, presented the same way
 * (a row in the same list, "Editar" opening the same kind of modal) instead
 * of living in its own separate card below. Not draggable/deletable: it's
 * always exactly one fixed tile, always last. */
function PackagesTileRow() {
  const [tile, setTile] = useState<PackagesTile | null>(null)
  const [editing, setEditing] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [tagline, setTagline] = useState('')
  const [focusX, setFocusX] = useState(50)
  const [focusY, setFocusY] = useState(50)
  const [zoom, setZoom] = useState<number | null>(null)
  const [scrimOpacity, setScrimOpacity] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    api.getPackagesTile().then(setTile).catch(() => {})
  }, [])

  function startEditing() {
    if (!tile) return
    setImageUrl(tile.image_url)
    setTagline(tile.tagline ?? '')
    setFocusX(tile.image_focus_x)
    setFocusY(tile.image_focus_y)
    setZoom(tile.image_zoom)
    setScrimOpacity(tile.scrim_opacity)
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updatePackagesTile({
        imageUrl,
        tagline: tagline.trim() || null,
        imageFocusX: focusX,
        imageFocusY: focusY,
        imageZoom: zoom,
        scrimOpacity,
      })
      setTile(updated)
      setEditing(false)
      toast('Tile de "Paquetes" actualizado con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!tile) return null

  return (
    <>
      <li className="category-list__item category-list__item--fixed">
        <span className="image-thumbs__handle image-thumbs__handle--placeholder" aria-hidden="true" />
        {tile.image_url ? (
          <img src={tile.image_url} alt="" className="category-list__thumb" />
        ) : (
          <div className="category-list__thumb category-list__thumb--empty" />
        )}
        <div className="category-list__info">
          <span className="category-list__name">Paquetes</span>
          <span className="category-list__slug">Tile fijo · siempre al final</span>
          {tile.tagline && <span className="category-list__tagline">{tile.tagline}</span>}
        </div>
        <button className="btn btn--ghost btn--sm" onClick={startEditing}>
          Editar
        </button>
      </li>

      {editing && (
        <Modal title='Editar tile de "Paquetes"' onClose={() => setEditing(false)}>
          <p className="page-block__hint">
            La foto y la frase del tile fijo "Paquetes" en "Comprar por categoría" — sin ellas se toma una foto
            automática y la frase "Más piezas, mejor precio."
          </p>
          <div className="category-list__edit-image">
            {imageUrl ? (
              <ImagePositionEditor
                imageUrl={imageUrl}
                focusX={focusX}
                focusY={focusY}
                zoom={zoom}
                scrimOpacity={scrimOpacity}
                aspectRatio={CATEGORY_TILE_RATIO}
                onChange={(next) => {
                  setFocusX(next.focusX)
                  setFocusY(next.focusY)
                  setZoom(next.zoom)
                  setScrimOpacity(next.scrimOpacity)
                }}
              />
            ) : (
              <ImageUploader
                variant="inline"
                label="+ Agregar foto"
                sizeHint={CATEGORY_TILE_SIZE_HINT}
                onUploaded={setImageUrl}
              />
            )}
            {imageUrl && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImageUrl(null)}>
                Quitar foto
              </button>
            )}
          </div>
          <label className="form-field">
            Frase (opcional)
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Más piezas, mejor precio." />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null)
  const [newTagline, setNewTagline] = useState('')
  const [newImageFocusX, setNewImageFocusX] = useState(50)
  const [newImageFocusY, setNewImageFocusY] = useState(50)
  const [newImageZoom, setNewImageZoom] = useState<number | null>(null)
  const [newScrimOpacity, setNewScrimOpacity] = useState<number | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null)
  const [editingTagline, setEditingTagline] = useState('')
  const [editingImageFocusX, setEditingImageFocusX] = useState(50)
  const [editingImageFocusY, setEditingImageFocusY] = useState(50)
  const [editingImageZoom, setEditingImageZoom] = useState<number | null>(null)
  const [editingScrimOpacity, setEditingScrimOpacity] = useState<number | null>(null)
  const [editingShowInNav, setEditingShowInNav] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Dragging to reorder is always available — no more "activar edición"
  // step first; a "Cambios sin guardar" bar just appears once the order
  // actually differs from what's saved.
  const [orderIds, setOrderIds] = useState<number[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  const confirm = useConfirm()
  const { toast } = useToast()

  function load() {
    api
      .getCategories()
      .then((data) => {
        setCategories(data)
        setOrderIds(data.map((c) => c.id))
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(load, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      const created = await api.createCategory({
        name: name.trim(),
        imageUrl: newImageUrl,
        tagline: newTagline.trim() || null,
        imageFocusX: newImageFocusX,
        imageFocusY: newImageFocusY,
        imageZoom: newImageZoom,
        scrimOpacity: newScrimOpacity,
      })
      setCategories((prev) => [...prev, created])
      setOrderIds((prev) => [...prev, created.id])
      setName('')
      setNewImageUrl(null)
      setNewTagline('')
      setNewImageFocusX(50)
      setNewImageFocusY(50)
      setNewImageZoom(null)
      setNewScrimOpacity(null)
      toast(`Categoría "${created.name}" creada con éxito`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear categoría')
    }
  }

  function startEditing(c: Category) {
    setEditingId(c.id)
    setEditingName(c.name)
    setEditingImageUrl(c.image_url)
    setEditingTagline(c.tagline ?? '')
    setEditingImageFocusX(c.image_focus_x)
    setEditingImageFocusY(c.image_focus_y)
    setEditingImageZoom(c.image_zoom)
    setEditingScrimOpacity(c.scrim_opacity)
    setEditingShowInNav(!!c.show_in_nav)
    setEditError(null)
  }

  async function handleSaveEdit() {
    if (editingId == null || !editingName.trim()) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const updated = await api.updateCategory(editingId, {
        name: editingName.trim(),
        imageUrl: editingImageUrl,
        tagline: editingTagline.trim() || null,
        imageFocusX: editingImageFocusX,
        imageFocusY: editingImageFocusY,
        imageZoom: editingImageZoom,
        scrimOpacity: editingScrimOpacity,
        showInNav: editingShowInNav,
      })
      setCategories((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
      setEditingId(null)
      toast(`Categoría "${updated.name}" actualizada con éxito`)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(id: number, catName: string) {
    const ok = await confirm({
      title: `¿Eliminar la categoría "${catName}"?`,
      message: 'Los productos quedarán sin categoría.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteCategory(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      setOrderIds((prev) => prev.filter((oid) => oid !== id))
      toast(`Categoría "${catName}" se eliminó con éxito`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al eliminar la categoría', 'error')
    }
  }

  function handleListDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const reordered = [...orderIds]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    setDragIndex(index)
    setOrderIds(reordered)
  }

  function handleListDragEnd() {
    setDragIndex(null)
  }

  const orderChanged = orderIds.join(',') !== categories.map((c) => c.id).join(',')

  function handleCancelOrder() {
    setOrderIds(categories.map((c) => c.id))
    setDragIndex(null)
  }

  async function handleSaveOrder() {
    setReordering(true)
    try {
      const categoryById = new Map(categories.map((c) => [c.id, c]))
      const updates: Category[] = []
      for (let i = 0; i < orderIds.length; i++) {
        const existing = categoryById.get(orderIds[i])
        if (!existing || existing.sort_order === i) continue
        updates.push(await api.updateCategory(orderIds[i], { sortOrder: i }))
      }
      if (updates.length > 0) {
        setCategories((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]))
          for (const u of updates) byId.set(u.id, u)
          return orderIds.map((id) => byId.get(id)).filter((c): c is Category => !!c)
        })
      }
      toast('Orden de las categorías actualizado con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el orden', 'error')
    } finally {
      setReordering(false)
    }
  }

  const orderedCategories = orderIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is Category => !!c)

  return (
    <div className="page-block">
      <h1>Categorías</h1>
      <p className="page-block__hint">
        La foto y la frase son opcionales — se usan en el tile "Comprar por categoría" de la tienda. Sin ellas, se
        toma automáticamente una foto de algún producto de la categoría y una frase genérica.
      </p>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && (
        <>
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

          <ul className="category-list">
            {orderedCategories.map((c, index) => (
              <li
                key={c.id}
                className={`category-list__item ${dragIndex === index ? 'category-list__item--dragging' : ''}`}
                onDragOver={(e) => handleListDragOver(e, index)}
              >
                <span className="image-thumbs__handle" draggable onDragStart={() => setDragIndex(index)} onDragEnd={handleListDragEnd}>
                  <DragHandleIcon />
                </span>
                {c.image_url ? (
                  <img src={c.image_url} alt="" className="category-list__thumb" />
                ) : (
                  <div className="category-list__thumb category-list__thumb--empty" />
                )}
                <div className="category-list__info">
                  <span className="category-list__name">
                    {c.name}
                    {!c.has_stock && <span className="tag tag--outofstock">Sin stock</span>}
                  </span>
                  <span className="category-list__slug">/{c.slug}</span>
                  {c.tagline && <span className="category-list__tagline">{c.tagline}</span>}
                  {!c.has_stock && (
                    <span className="category-list__tagline">
                      Oculta automáticamente en la tienda y el Cotizador hasta que vuelva a haber stock.
                    </span>
                  )}
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => startEditing(c)}>
                  Editar
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(c.id, c.name)}>
                  Eliminar
                </button>
              </li>
            ))}
            {categories.length === 0 && <p className="state-msg">Aún no hay categorías.</p>}
            <PackagesTileRow />
          </ul>
        </>
      )}

      <form className="category-form" onSubmit={handleCreate}>
        <input placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Frase (opcional)" value={newTagline} onChange={(e) => setNewTagline(e.target.value)} />
        {newImageUrl ? (
          <ImagePositionEditor
            imageUrl={newImageUrl}
            focusX={newImageFocusX}
            focusY={newImageFocusY}
            zoom={newImageZoom}
            scrimOpacity={newScrimOpacity}
            aspectRatio={CATEGORY_TILE_RATIO}
            onChange={(next) => {
              setNewImageFocusX(next.focusX)
              setNewImageFocusY(next.focusY)
              setNewImageZoom(next.zoom)
              setNewScrimOpacity(next.scrimOpacity)
            }}
          />
        ) : (
          <ImageUploader
            variant="inline"
            label="+ Foto"
            sizeHint={CATEGORY_TILE_SIZE_HINT}
            onUploaded={setNewImageUrl}
          />
        )}
        <button type="submit" className="btn btn--primary">
          + Agregar
        </button>
      </form>

      {editingId != null && (
        <Modal title="Editar categoría" onClose={() => setEditingId(null)}>
          <div className="category-list__edit-image">
            {editingImageUrl ? (
              <ImagePositionEditor
                imageUrl={editingImageUrl}
                focusX={editingImageFocusX}
                focusY={editingImageFocusY}
                zoom={editingImageZoom}
                scrimOpacity={editingScrimOpacity}
                aspectRatio={CATEGORY_TILE_RATIO}
                onChange={(next) => {
                  setEditingImageFocusX(next.focusX)
                  setEditingImageFocusY(next.focusY)
                  setEditingImageZoom(next.zoom)
                  setEditingScrimOpacity(next.scrimOpacity)
                }}
              />
            ) : (
              <ImageUploader
                variant="inline"
                label="+ Agregar foto"
                sizeHint={CATEGORY_TILE_SIZE_HINT}
                onUploaded={setEditingImageUrl}
              />
            )}
            {editingImageUrl && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingImageUrl(null)}>
                Quitar foto
              </button>
            )}
          </div>
          <label className="form-field">
            Nombre
            <input value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
          </label>
          <label className="form-field">
            Frase (opcional)
            <input value={editingTagline} onChange={(e) => setEditingTagline(e.target.value)} />
          </label>
          <label className="filter-check-pill">
            <input type="checkbox" checked={editingShowInNav} onChange={(e) => setEditingShowInNav(e.target.checked)} />
            Mostrar en el catálogo y la navegación de la tienda
          </label>
          <p className="page-block__hint">
            Desactívalo para categorías que uses solo como agrupación de precios (Mayoreo, Cotizador) mientras no
            tengan productos reales que mostrar todavía. Una categoría sin stock se oculta sola igual, aunque esto
            esté marcado — vuelve a aparecer en cuanto haya existencias de nuevo.
          </p>
          {editError && <p className="form-error">{editError}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setEditingId(null)} disabled={savingEdit}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

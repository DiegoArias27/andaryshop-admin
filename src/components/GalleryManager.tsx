import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import type { ProductImage } from '../api/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CropIcon, DragHandleIcon, StarIcon } from './icons'
import ImageCropModal from './ImageCropModal'
import ImageUploader from './ImageUploader'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'

interface GalleryManagerProps {
  productId: number
  images: ProductImage[]
  colors: string[]
  onCommitted: (images: ProductImage[]) => void
}

const SWIPE_THRESHOLD = 40

export default function GalleryManager({ productId, images, colors, onCommitted }: GalleryManagerProps) {
  // Only reordering stages locally (a drag then a "Guardar orden" bar) —
  // color, delete, crop and upload all save immediately now, no more
  // "activar edición" gate first.
  const [orderIds, setOrderIds] = useState<number[]>(() => images.map((img) => img.id))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [cropTarget, setCropTarget] = useState<ProductImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    setOrderIds(images.map((img) => img.id))
  }, [images])

  // Lets any image anywhere in the browser's clipboard (a screenshot, a
  // copied photo from another tab/app) get added the same way a file picked
  // by hand would — listens on the window instead of a specific element so
  // it doesn't need its own focus/click first; a plain text paste elsewhere
  // on the page is untouched since nothing here matches without an image.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length === 0) return
      e.preventDefault()
      uploadPastedFiles(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function uploadPastedFiles(files: File[]) {
    for (const file of files) {
      try {
        const { url } = await api.uploadImage(file)
        await handleUploaded(url)
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error al subir la imagen pegada', 'error')
      }
    }
  }

  const imageById = new Map(images.map((img) => [img.id, img]))
  const baselineIds = images.map((img) => img.id)
  const orderChanged = orderIds.join(',') !== baselineIds.join(',')

  const visibleOrder = orderIds.map((id) => imageById.get(id)).filter((img): img is ProductImage => !!img)

  function handleCancelOrder() {
    setOrderIds(baselineIds)
    setDragIndex(null)
  }

  async function handleSaveOrder() {
    setReordering(true)
    setError(null)
    try {
      const reordered = await api.reorderProductImages(productId, orderIds)
      onCommitted(reordered)
      toast('Orden de imágenes actualizado con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el orden')
    } finally {
      setReordering(false)
    }
  }

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

  // Moves an image to the front (the cover photo) without needing to drag it
  // there — commits immediately, same as color/delete/crop below, off
  // whatever order is currently on screen (including a pending unsaved
  // drag), so nothing the admin already arranged gets lost in the process.
  async function handleMakeMain(imageId: number) {
    if (orderIds[0] === imageId) return
    const newOrder = [imageId, ...orderIds.filter((id) => id !== imageId)]
    setReordering(true)
    setError(null)
    try {
      const reordered = await api.reorderProductImages(productId, newOrder)
      onCommitted(reordered)
      toast('Imagen principal actualizada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la imagen principal')
    } finally {
      setReordering(false)
    }
  }

  async function handleColorChange(imageId: number, colorName: string) {
    try {
      const updated = await api.updateProductImage(imageId, colorName || null)
      onCommitted(images.map((img) => (img.id === imageId ? updated : img)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al actualizar el color', 'error')
    }
  }

  async function handleDelete(img: ProductImage) {
    const ok = await confirm({
      title: '¿Eliminar esta imagen?',
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteProductImage(img.id)
    onCommitted(images.filter((i) => i.id !== img.id))
    toast('Imagen eliminada con éxito')
  }

  async function handleUploaded(url: string) {
    const updated = await api.addProductImages(productId, [url])
    onCommitted(updated)
  }

  async function handleCropSave(blob: Blob) {
    if (!cropTarget) return
    const targetId = cropTarget.id
    const oldIndex = images.findIndex((img) => img.id === targetId)
    const file = new File([blob], `crop-${targetId}.jpg`, { type: 'image/jpeg' })
    const { url } = await api.uploadImage(file)
    const afterAdd = await api.addProductImages(productId, [{ url, colorName: cropTarget.color_name }])
    const newImage = afterAdd[afterAdd.length - 1]
    await api.deleteProductImage(targetId)
    const finalOrder = images.filter((img) => img.id !== targetId)
    finalOrder.splice(oldIndex, 0, newImage)
    const reordered = await api.reorderProductImages(productId, finalOrder.map((img) => img.id))
    onCommitted(reordered)
    setCropTarget(null)
    toast('Imagen recortada con éxito')
  }

  function closeViewer() {
    setViewerIndex(null)
  }

  function showPrev(e?: MouseEvent) {
    e?.stopPropagation()
    setViewerIndex((i) => (i === null ? null : (i - 1 + visibleOrder.length) % visibleOrder.length))
  }

  function showNext(e?: MouseEvent) {
    e?.stopPropagation()
    setViewerIndex((i) => (i === null ? null : (i + 1) % visibleOrder.length))
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: TouchEvent) {
    if (touchStartXRef.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartXRef.current
    touchStartXRef.current = null
    if (visibleOrder.length < 2) return
    if (dx > SWIPE_THRESHOLD) showPrev()
    else if (dx < -SWIPE_THRESHOLD) showNext()
  }

  useEffect(() => {
    if (viewerIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeViewer()
      else if (e.key === 'ArrowLeft') showPrev()
      else if (e.key === 'ArrowRight') showNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex, visibleOrder.length])

  return (
    <>
      <div className="editable-card__header">
        <h2>Imágenes</h2>
        {orderChanged && (
          <div className="variants-editor__edit-actions">
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleCancelOrder} disabled={reordering}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={handleSaveOrder} disabled={reordering}>
              {reordering ? 'Guardando…' : 'Guardar orden'}
            </button>
          </div>
        )}
      </div>

      <p className="page-block__hint">
        Arrastra para reordenar, o toca la estrella para hacer principal esa foto sin arrastrar — la primera foto
        (marcada "Principal") es la portada del producto en la tienda. También puedes pegar una imagen copiada
        (Ctrl+V). Asigna un color si la foto es solo de esa variante; si un color no tiene fotos propias, se le
        mostrarán las marcadas como "General".
      </p>

      {error && <p className="form-error">{error}</p>}

      {visibleOrder.length > 0 && (
        <div className="gallery-manager">
          {visibleOrder.map((img, index) => (
            <div
              key={img.id}
              className={`gallery-manager__item ${dragIndex === index ? 'gallery-manager__item--dragging' : ''}`}
              onDragOver={(e) => handleDragOver(e, index)}
            >
              <span
                className="gallery-manager__handle"
                aria-hidden
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={handleDragEnd}
              >
                <DragHandleIcon />
              </span>
              <button
                type="button"
                className="gallery-manager__thumb"
                onClick={(e) => {
                  e.stopPropagation()
                  setViewerIndex(index)
                }}
                aria-label="Ver imagen en grande"
              >
                <img src={img.image_url} alt="" />
                {index === 0 && <span className="gallery-manager__main-badge">Principal</span>}
              </button>
              <select
                value={img.color_name ?? ''}
                onChange={(e) => handleColorChange(img.id, e.target.value)}
                aria-label="Color asociado"
              >
                <option value="">General (todos los colores)</option>
                {colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {index !== 0 && (
                <button
                  type="button"
                  className="gallery-manager__make-main"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMakeMain(img.id)
                  }}
                  disabled={reordering}
                  aria-label="Hacer imagen principal"
                  title="Hacer imagen principal"
                >
                  <StarIcon />
                </button>
              )}
              <button
                type="button"
                className="gallery-manager__crop"
                onClick={(e) => {
                  e.stopPropagation()
                  setCropTarget(img)
                }}
                aria-label="Recortar imagen"
                title="Recortar imagen"
              >
                <CropIcon />
              </button>
              <button type="button" className="gallery-manager__remove" onClick={() => handleDelete(img)} aria-label="Eliminar">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <ImageUploader
          variant="inline"
          sizeHint="Recomendado: 1200×1600px (relación 3:4)"
          onUploaded={handleUploaded}
          multiple
        />
      </div>

      {viewerIndex !== null &&
        createPortal(
          <div
            className="image-viewer-overlay"
            onClick={closeViewer}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              type="button"
              className="icon-btn image-viewer-overlay__close"
              onClick={closeViewer}
              aria-label="Cerrar"
            >
              <CloseIcon />
            </button>
            {visibleOrder.length > 1 && (
              <button
                type="button"
                className="image-viewer-overlay__nav image-viewer-overlay__nav--prev"
                onClick={showPrev}
                aria-label="Foto anterior"
              >
                <ChevronLeftIcon />
              </button>
            )}
            <img src={visibleOrder[viewerIndex].image_url} alt="" onClick={(e) => e.stopPropagation()} />
            {visibleOrder.length > 1 && (
              <button
                type="button"
                className="image-viewer-overlay__nav image-viewer-overlay__nav--next"
                onClick={showNext}
                aria-label="Foto siguiente"
              >
                <ChevronRightIcon />
              </button>
            )}
            {visibleOrder.length > 1 && (
              <span className="image-viewer-overlay__counter">
                {viewerIndex + 1} / {visibleOrder.length}
              </span>
            )}
          </div>,
          document.body
        )}

      {cropTarget && (
        <ImageCropModal imageUrl={cropTarget.image_url} onCancel={() => setCropTarget(null)} onSave={handleCropSave} />
      )}
    </>
  )
}

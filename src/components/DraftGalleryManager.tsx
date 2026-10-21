import { useEffect, useState, type DragEvent } from 'react'
import { api } from '../api/client'
import { CropIcon, DragHandleIcon, StarIcon } from './icons'
import ImageCropModal from './ImageCropModal'
import ImageLightbox from './ImageLightbox'
import ImageUploader from './ImageUploader'
import { useToast } from '../hooks/useToast'

interface DraftGalleryManagerProps {
  images: string[]
  /** Same shape as a useState setter — reorder/remove/make-main act on the
   * current array directly (safe, driven by a synchronous click), but a
   * paste/multi-upload batch always goes through the functional-update form
   * so each file's addition lands on top of the previous one instead of a
   * stale array captured when the batch started. */
  onChange: (update: string[] | ((prev: string[]) => string[])) => void
}

/** Mirrors GalleryManager's reorder/crop/paste/make-main gallery editing for
 * a product that doesn't exist yet — everything here operates on plain
 * uploaded-but-unattached URLs (no product_id to attach a real gallery row
 * to), committing to the backend only as an upload-per-photo; order, main
 * pick and removals are pure local-array edits sent to the server for real
 * once the product itself is created. */
export default function DraftGalleryManager({ images, onChange }: DraftGalleryManagerProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const { toast } = useToast()

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
        onChange((prev) => [...prev, url])
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error al subir la imagen pegada', 'error')
      }
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const reordered = [...images]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    setDragIndex(index)
    onChange(reordered)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  function handleMakeMain(index: number) {
    if (index === 0) return
    const reordered = [...images]
    const [moved] = reordered.splice(index, 1)
    reordered.unshift(moved)
    onChange(reordered)
  }

  function handleRemove(index: number) {
    const removedUrl = images[index]
    onChange(images.filter((_, i) => i !== index))
    // Best-effort — nothing else references this URL yet (the product isn't
    // saved), so it's safe to try deleting right away; a failure here just
    // leaves it for the next orphan sweep instead of blocking the UI.
    api.deleteImage(removedUrl).catch(() => {})
  }

  async function handleCropSave(blob: Blob) {
    if (!cropTarget) return
    const targetUrl = cropTarget
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const { url } = await api.uploadImage(file)
    onChange((prev) => {
      const idx = prev.indexOf(targetUrl)
      if (idx === -1) return [...prev, url]
      const next = [...prev]
      next[idx] = url
      return next
    })
    // The pre-crop original is now replaced in the array — clean it up the
    // same way GalleryManager's crop does for an existing product.
    api.deleteImage(targetUrl).catch(() => {})
    setCropTarget(null)
    toast('Imagen recortada con éxito')
  }

  return (
    <>
      <p className="page-block__hint">
        Arrastra para reordenar, o toca la estrella para hacer principal esa foto sin arrastrar — la primera foto
        (marcada "Principal") es la portada del producto en la tienda. También puedes pegar una imagen copiada
        (Ctrl+V).
      </p>

      {images.length > 0 && (
        <div className="gallery-manager">
          {images.map((url, index) => (
            <div
              key={`${url}-${index}`}
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
                <img src={url} alt="" />
                {index === 0 && <span className="gallery-manager__main-badge">Principal</span>}
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  className="gallery-manager__make-main"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMakeMain(index)
                  }}
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
                  setCropTarget(url)
                }}
                aria-label="Recortar imagen"
                title="Recortar imagen"
              >
                <CropIcon />
              </button>
              <button type="button" className="gallery-manager__remove" onClick={() => handleRemove(index)} aria-label="Eliminar">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <ImageUploader
          variant="inline"
          label={images.length > 0 ? 'Agregar más fotos' : undefined}
          sizeHint="Recomendado: 1200×1600px (relación 3:4)"
          onUploaded={(url) => onChange((prev) => [...prev, url])}
          multiple
        />
      </div>

      {viewerIndex !== null && (
        <ImageLightbox images={images.map((url) => ({ url }))} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}

      {cropTarget && <ImageCropModal imageUrl={cropTarget} onCancel={() => setCropTarget(null)} onSave={handleCropSave} />}
    </>
  )
}

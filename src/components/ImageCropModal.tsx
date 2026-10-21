import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

const MIN_CROP = 40

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

interface ImageCropModalProps {
  imageUrl: string
  onCancel: () => void
  onSave: (blob: Blob) => Promise<void>
}

export default function ImageCropModal({ imageUrl, onCancel, onSave }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [crop, setCrop] = useState<Rect | null>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const dragStartRef = useRef<{ x: number; y: number; crop: Rect } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const { width, height } = img.getBoundingClientRect()
    setDisplaySize({ width, height })
    const cropWidth = width * 0.8
    const cropHeight = height * 0.8
    setCrop({ x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight })
  }

  function startDrag(e: ReactPointerEvent, mode: DragMode) {
    if (!crop) return
    e.preventDefault()
    e.stopPropagation()
    setDragMode(mode)
    dragStartRef.current = { x: e.clientX, y: e.clientY, crop: { ...crop } }
  }

  // Global listeners (rather than per-element pointer capture) so the drag
  // keeps tracking correctly even if the cursor briefly leaves the handle —
  // the mouse button state is what matters, not which element is under it.
  useEffect(() => {
    if (!dragMode) return

    function onMove(e: PointerEvent) {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const start = dragStartRef.current.crop
      const { width: dispWidth, height: dispHeight } = displaySize

      if (dragMode === 'move') {
        setCrop({
          ...start,
          x: clamp(start.x + dx, 0, dispWidth - start.width),
          y: clamp(start.y + dy, 0, dispHeight - start.height),
        })
        return
      }

      let { x, y, width, height } = start
      if (dragMode === 'se' || dragMode === 'ne') {
        width = clamp(start.width + dx, MIN_CROP, dispWidth - start.x)
      }
      if (dragMode === 'sw' || dragMode === 'nw') {
        const newX = clamp(start.x + dx, 0, start.x + start.width - MIN_CROP)
        width = start.width + (start.x - newX)
        x = newX
      }
      if (dragMode === 'se' || dragMode === 'sw') {
        height = clamp(start.height + dy, MIN_CROP, dispHeight - start.y)
      }
      if (dragMode === 'ne' || dragMode === 'nw') {
        const newY = clamp(start.y + dy, 0, start.y + start.height - MIN_CROP)
        height = start.height + (start.y - newY)
        y = newY
      }
      setCrop({ x, y, width, height })
    }

    function onUp() {
      setDragMode(null)
      dragStartRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragMode, displaySize])

  async function handleSave() {
    const img = imgRef.current
    if (!img || !crop) return
    setSaving(true)
    setError(null)
    try {
      const scaleX = img.naturalWidth / img.width
      const scaleY = img.naturalHeight / img.height
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(crop.width * scaleX))
      canvas.height = Math.max(1, Math.round(crop.height * scaleY))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo preparar el recorte')
      ctx.drawImage(
        img,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      )
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/jpeg', 0.92)
      )
      await onSave(blob)
    } catch {
      setError('No se pudo recortar esta imagen (puede estar en un servidor que no lo permite). Intenta con otra foto.')
    } finally {
      setSaving(false)
    }
  }

  const handles: DragMode[] = ['nw', 'ne', 'sw', 'se']

  return createPortal(
    <div className="crop-modal-overlay">
      <div className="crop-modal">
        <div className="crop-modal__header">
          <h2>Recortar imagen</h2>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>

        <div className="crop-modal__stage">
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            crossOrigin="anonymous"
            onLoad={handleImageLoad}
            className="crop-modal__image"
            draggable={false}
          />
          {crop && (
            <div
              className="crop-modal__box"
              style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
              onPointerDown={(e) => startDrag(e, 'move')}
            >
              {handles.map((h) => (
                <span
                  key={h}
                  className={`crop-modal__handle crop-modal__handle--${h}`}
                  onPointerDown={(e) => startDrag(e, h)}
                />
              ))}
            </div>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="crop-modal__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn--accent btn--sm" onClick={handleSave} disabled={saving || !crop}>
            {saving ? 'Guardando…' : 'Guardar recorte'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

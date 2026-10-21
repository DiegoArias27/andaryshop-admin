import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons'

export interface LightboxImage {
  url: string
  /** Shown under the counter — e.g. which product/line this photo belongs
   * to, so browsing a sale/return's several items stays legible. Omit for a
   * single, self-explanatory image (nothing to disambiguate). */
  label?: string
}

/** A full-screen "ver en grande" viewer shared by Punto de venta, Ventas and
 * Devoluciones — one big image, thumbnails underneath for the other photos
 * in this same context (hovering one previews it, same as clicking), and
 * left/right arrows (onscreen or ← →) to move between them. Renders nothing
 * useful with a single image beyond the big view itself — arrows/thumbs/
 * counter only show up once there's actually something to browse to. */
export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: LightboxImage[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), images.length - 1))
  const hasMultiple = images.length > 1

  function showPrev() {
    setIndex((i) => (i - 1 + images.length) % images.length)
  }

  function showNext() {
    setIndex((i) => (i + 1) % images.length)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (hasMultiple && e.key === 'ArrowLeft') showPrev()
      else if (hasMultiple && e.key === 'ArrowRight') showNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMultiple, images.length])

  const current = images[index]
  if (!current) return null

  return createPortal(
    <div className="image-viewer-overlay" onClick={onClose}>
      <button type="button" className="icon-btn image-viewer-overlay__close" onClick={onClose} aria-label="Cerrar">
        <CloseIcon />
      </button>

      <div className="image-lightbox__stage" onClick={(e) => e.stopPropagation()}>
        <div className="image-lightbox__main">
          {hasMultiple && (
            <button type="button" className="image-viewer-overlay__nav image-viewer-overlay__nav--prev" onClick={showPrev} aria-label="Foto anterior">
              <ChevronLeftIcon />
            </button>
          )}
          <img src={current.url} alt="" />
          {hasMultiple && (
            <button type="button" className="image-viewer-overlay__nav image-viewer-overlay__nav--next" onClick={showNext} aria-label="Foto siguiente">
              <ChevronRightIcon />
            </button>
          )}
        </div>

        {hasMultiple && (
          <div className="image-lightbox__thumbs">
            {images.map((img, i) => (
              <img
                key={`${img.url}-${i}`}
                src={img.url}
                alt=""
                className={`image-lightbox__thumb ${i === index ? 'image-lightbox__thumb--active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>

      {hasMultiple && (
        <span className="image-viewer-overlay__counter">
          {index + 1} / {images.length}
          {current.label ? ` · ${current.label}` : ''}
        </span>
      )}
    </div>,
    document.body
  )
}

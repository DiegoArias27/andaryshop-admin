import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import type { MediaItem } from '../api/types'
import { CloseIcon } from './icons'
import LoadingState from './LoadingState'

/** Lets the admin reuse a photo already uploaded somewhere else instead of
 * uploading a duplicate copy — every ImageUploader shares this same catalog
 * (see media_library on the backend, populated automatically on upload). */
export default function MediaLibraryModal({
  onSelect,
  onCancel,
}: {
  onSelect: (url: string) => void
  onCancel: () => void
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getMediaLibrary()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar la galería'))
  }, [])

  return createPortal(
    <div className="confirm-overlay media-library-overlay" onClick={onCancel}>
      <div className="media-library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-library-modal__header">
          <h2>Elegir de la galería</h2>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {!items && !error && <LoadingState />}
        {items && items.length === 0 && <p className="state-msg">Aún no hay imágenes subidas.</p>}
        {items && items.length > 0 && (
          <div className="media-library-modal__grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="media-library-modal__item"
                onClick={() => onSelect(item.url)}
              >
                <img src={item.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

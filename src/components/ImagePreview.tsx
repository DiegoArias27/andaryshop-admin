import { useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import { CloseIcon, CropIcon } from './icons'
import ImageCropModal from './ImageCropModal'

interface ImagePreviewProps {
  imageUrl: string
  onCropped: (url: string) => void
  allowCrop?: boolean
  /** Where the photo is anchored (CSS object-position, percent) — matches
   * the banner editor's own image_focus_x/y so a thumbnail crops the same
   * spot the real banner does, instead of always defaulting to dead-center
   * (which can look "zoomed in" on the wrong area for an off-center photo). */
  imageFocus?: { x: number; y: number }
}

/** Wraps a single uploaded banner/hero image with a click-to-view lightbox
 * and a "Recortar" action — used for one-off images (hero slides, collection
 * banners) that aren't part of a reorderable gallery. Viewing always works;
 * pass allowCrop={false} to hide the crop action for a locked/read-only row. */
export default function ImagePreview({ imageUrl, onCropped, allowCrop = true, imageFocus }: ImagePreviewProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [cropping, setCropping] = useState(false)

  async function handleCropSave(blob: Blob) {
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const { url } = await api.uploadImage(file)
    onCropped(url)
    setCropping(false)
  }

  return (
    <div className="main-image-preview">
      <button
        type="button"
        className="main-image-preview__view"
        onClick={() => setViewerOpen(true)}
        aria-label="Ver imagen en grande"
      >
        <img
          src={imageUrl}
          alt=""
          style={imageFocus ? { objectPosition: `${imageFocus.x}% ${imageFocus.y}%` } : undefined}
        />
      </button>
      {allowCrop && (
        <button type="button" className="main-image-preview__crop" onClick={() => setCropping(true)}>
          <CropIcon /> Recortar
        </button>
      )}

      {viewerOpen &&
        createPortal(
          <div className="image-viewer-overlay" onClick={() => setViewerOpen(false)}>
            <button
              type="button"
              className="icon-btn image-viewer-overlay__close"
              onClick={() => setViewerOpen(false)}
              aria-label="Cerrar"
            >
              <CloseIcon />
            </button>
            <img src={imageUrl} alt="" onClick={(e) => e.stopPropagation()} />
          </div>,
          document.body
        )}

      {cropping && <ImageCropModal imageUrl={imageUrl} onCancel={() => setCropping(false)} onSave={handleCropSave} />}
    </div>
  )
}

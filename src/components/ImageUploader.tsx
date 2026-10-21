import { useState, type ChangeEvent, type DragEvent } from 'react'
import { api } from '../api/client'
import { ImageIcon, UploadCloudIcon } from './icons'
import MediaLibraryModal from './MediaLibraryModal'

interface ImageUploaderProps {
  /** May return a promise — when it does, each file's upload waits for the
   * previous one's onUploaded to finish before starting the next, so a
   * caller that does a read-modify-write (like GalleryManager's "fetch
   * current images, append, save") doesn't race itself across files. */
  onUploaded: (url: string) => void | Promise<void>
  variant?: 'block' | 'inline'
  label?: string
  hint?: string
  /** Recommended pixel dimensions/aspect ratio for this specific spot (e.g.
   * "Recomendado: 1600×700px, horizontal") — shown so the admin doesn't have
   * to guess and end up with a photo that gets cropped oddly once it's
   * actually placed on the site. Omit where any size works fine. */
  sizeHint?: string
  disabled?: boolean
  /** Lets the file picker/drop accept several images in one go — each one
   * still goes through the same `onUploaded(url)` callback, called once per
   * file (uploaded one at a time, in order) instead of needing a separate
   * pick for every photo. Off by default so single-image spots (a category
   * tile, a banner) keep picking exactly one. */
  multiple?: boolean
}

export default function ImageUploader({
  onUploaded,
  variant = 'block',
  label,
  hint = 'o haz clic para explorar',
  sizeHint,
  disabled = false,
  multiple = false,
}: ImageUploaderProps) {
  // Different sensible default per variant (a short button caption inline,
  // a full invitation in the block dropzone) — callers only need to pass
  // `label` when they want something else entirely.
  const effectiveLabel = label ?? (variant === 'inline' ? '+ Agregar foto' : 'Arrastra imágenes aquí')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  function handlePick(url: string) {
    setPickerOpen(false)
    onUploaded(url)
  }

  /** Uploads every file one at a time (not in parallel — keeps upload order
   * predictable, which matters when the caller uses it as the gallery's
   * sort order) and calls onUploaded after each one succeeds, so the
   * gallery/list fills in progressively instead of waiting for all of them. */
  async function uploadFiles(files: File[]) {
    setUploading(true)
    setError(null)
    setProgress(files.length > 1 ? { done: 0, total: files.length } : null)
    try {
      for (let i = 0; i < files.length; i++) {
        const { url } = await api.uploadImage(files[i])
        await onUploaded(url)
        setProgress(files.length > 1 ? { done: i + 1, total: files.length } : null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) uploadFiles(files)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) uploadFiles(files)
  }

  const statusLabel = progress ? `Subiendo ${progress.done}/${progress.total}…` : 'Subiendo…'

  if (variant === 'inline') {
    return (
      <div className="image-uploader image-uploader--inline">
        <label className={`btn btn--ghost btn--sm ${disabled ? 'btn--disabled' : ''}`}>
          {uploading ? statusLabel : effectiveLabel}
          <input type="file" accept="image/*" multiple={multiple} onChange={handleChange} disabled={uploading || disabled} hidden />
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
        >
          <ImageIcon width={14} height={14} /> Galería
        </button>
        {sizeHint && <span className="image-uploader__size-hint">{sizeHint}</span>}
        {error && <p className="form-error">{error}</p>}
        {pickerOpen && <MediaLibraryModal onSelect={handlePick} onCancel={() => setPickerOpen(false)} />}
      </div>
    )
  }

  return (
    <div>
      <label
        className={`dropzone ${dragActive ? 'dropzone--active' : ''} ${disabled ? 'dropzone--disabled' : ''}`}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          if (disabled) return
          handleDrop(e)
        }}
      >
        <span className="dropzone__icon">
          <UploadCloudIcon />
        </span>
        <span>
          <span className="dropzone__title">{uploading ? statusLabel : effectiveLabel}</span>
          <span className="dropzone__hint">{hint}</span>
        </span>
        <input type="file" accept="image/*" multiple={multiple} onChange={handleChange} disabled={uploading || disabled} />
      </label>
      <div className="image-uploader__footer">
        <button
          type="button"
          className="btn btn--ghost btn--sm image-uploader__gallery-btn"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
        >
          <ImageIcon width={14} height={14} /> Elegir de la galería
        </button>
        {sizeHint && <span className="image-uploader__size-hint">{sizeHint}</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {pickerOpen && <MediaLibraryModal onSelect={handlePick} onCancel={() => setPickerOpen(false)} />}
    </div>
  )
}

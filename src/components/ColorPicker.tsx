import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRightIcon, CloseIcon, PipetteIcon } from './icons'

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

interface ColorPickerProps {
  value: string
  /** Fires on every change, including a live preview while dragging the
   * native picker — for display only, not a save signal. */
  onChange: (hex: string) => void
  /** Fires only once a color is actually FINALIZED — the native picker
   * closing, or a photo sample taken — never on an in-progress drag.
   * Callers that autosave (VariantsEditor's existing rows) hook this
   * instead of onChange, and get the hex value directly rather than having
   * to re-read it back out of state a render later. */
  onCommit?: (hex: string) => void
  /** The product's own photo, if one exists yet — lets the admin sample the
   * garment's actual color straight off it instead of eyeballing a shade in
   * the native picker. Omit (new product, no photos uploaded) and only the
   * native swatch (+ "Colores guardados", if there are any) show. */
  photoUrl?: string | null
  /** "Colores guardados" — every color already in use by some product in
   * the store, offered through a dropdown right next to the swatch so
   * reusing one doesn't need a whole separate picker of its own. Each one
   * shows its actual name in the list, and picking one reports hex AND name
   * together through onPickNamed below, since onChange/onCommit only ever
   * carry a hex. */
  extraSwatches?: { hex: string; name: string }[]
  onPickNamed?: (hex: string, name: string) => void
}

/** A plain <input type="color"> plus two things the native picker doesn't
 * give you: when this product has a photo, a "tomar de la foto" sampler
 * that reads a single pixel's color straight off it via canvas (a much more
 * direct way to match a garment's actual color than freehand in a picker),
 * and a "Colores guardados" dropdown of every color already in use
 * somewhere in the store, to reuse one in a click instead of hunting for
 * the exact same tone again. */
export default function ColorPicker({ value, onChange, onCommit, photoUrl, extraSwatches = [], onPickNamed }: ColorPickerProps) {
  const [sampling, setSampling] = useState(false)
  const [sampleError, setSampleError] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  function commit(hex: string) {
    onChange(hex)
    onCommit?.(hex)
  }

  function commitNamed(hex: string, name: string) {
    commit(hex)
    onPickNamed?.(hex, name)
    setDropdownOpen(false)
  }

  useEffect(() => {
    if (!dropdownOpen) return
    function handleDocumentMouseDown(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [dropdownOpen])

  useEffect(() => {
    if (!sampling || !photoUrl) return
    setSampleError(false)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
    }
    img.onerror = () => setSampleError(true)
    img.src = photoUrl
  }, [sampling, photoUrl])

  function handleCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width)))
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height)))
    try {
      const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data
      commit(toHex(r, g, b))
      setSampling(false)
    } catch {
      // Tainted canvas (the photo's host didn't send a CORS header for
      // this origin) — can't read pixels back out. Shouldn't happen for
      // our own R2 bucket, but fails quietly rather than throwing.
      setSampleError(true)
    }
  }

  return (
    <div className="color-picker">
      <input
        type="color"
        className="variant-color-swatch"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      {photoUrl && (
        <button
          type="button"
          className="icon-btn color-picker__sample-btn"
          onClick={() => setSampling(true)}
          aria-label="Tomar color de la foto"
          title="Tomar color de la foto"
        >
          <PipetteIcon width={14} height={14} />
        </button>
      )}
      {extraSwatches.length > 0 && (
        <div className="color-picker__dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="color-picker__dropdown-btn"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            Colores guardados
            <ChevronRightIcon width={14} height={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
          {dropdownOpen && (
            <ul className="color-picker__dropdown-list">
              {extraSwatches.map((c) => (
                <li key={`${c.hex}-${c.name}`}>
                  <button type="button" onClick={() => commitNamed(c.hex, c.name)}>
                    <span className="color-picker__dropdown-swatch" style={{ background: c.hex }} />
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sampling &&
        photoUrl &&
        createPortal(
          <div className="color-picker__overlay" onClick={() => setSampling(false)}>
            <div className="color-picker__sampler" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="icon-btn color-picker__sampler-close"
                onClick={() => setSampling(false)}
                aria-label="Cerrar"
              >
                <CloseIcon />
              </button>
              <p className="color-picker__sampler-hint">
                {sampleError ? 'No se pudo cargar la foto para tomar el color.' : 'Toca la prenda en la foto para tomar su color'}
              </p>
              <canvas ref={canvasRef} className="color-picker__canvas" onClick={handleCanvasClick} />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

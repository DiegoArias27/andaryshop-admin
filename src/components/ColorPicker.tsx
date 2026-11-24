import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, PipetteIcon } from './icons'

const RECENT_COLORS_KEY = 'andary-admin-recent-colors'
const MAX_RECENT = 12

function loadRecentColors(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

function rememberColor(hex: string): string[] {
  try {
    const next = [hex, ...loadRecentColors().filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next))
    return next
  } catch {
    return loadRecentColors()
  }
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

interface ColorPickerProps {
  value: string
  /** Fires on every change, including a live preview while dragging the
   * native picker — for display only, not a save signal. */
  onChange: (hex: string) => void
  /** Fires only once a color is actually FINALIZED — the native picker
   * closing, a recent swatch clicked, or a photo sample taken — never on
   * an in-progress drag. Callers that autosave (VariantsEditor's existing
   * rows) hook this instead of onChange, and get the hex value directly
   * rather than having to re-read it back out of state a render later. */
  onCommit?: (hex: string) => void
  /** The product's own photo, if one exists yet — lets the admin sample the
   * garment's actual color straight off it instead of eyeballing a shade in
   * the native picker. Omit (new product, no photos uploaded) and only the
   * native swatch + recent-colors row show. */
  photoUrl?: string | null
  /** Hides the recent-colors row — used for each already-saved variant row
   * in the table, where a dozen extra swatches per row added more table
   * height than it was worth; the "add new" draft form keeps the full row,
   * since picking a fresh color from scratch is exactly where reusing a
   * recent one matters most. */
  compact?: boolean
  /** Named swatches to show alongside the plain (hex-only) recent-colors
   * row — e.g. every color already in use by some product in the store,
   * so reusing one of those doesn't need a whole separate picker of its
   * own. Shown with the color's actual name (as a tooltip), not just its
   * hex, and reported through onPickNamed below instead of onCommit so the
   * name travels along with the hex. */
  extraSwatches?: { hex: string; name: string }[]
  /** Fires when one of extraSwatches is clicked — hex AND name together,
   * since onChange/onCommit above only ever carry a hex. */
  onPickNamed?: (hex: string, name: string) => void
}

/** A plain <input type="color"> plus two things the native picker doesn't
 * give you: a row of recently-used colors (shared across every product,
 * localStorage-backed) to reuse a shade in one click instead of hunting
 * for the exact same tone again, and — when this product has a photo — a
 * "tomar de la foto" sampler that reads a single pixel's color straight
 * off it via canvas, which is a much more direct way to match a garment's
 * actual color than freehand in a picker. */
export default function ColorPicker({ value, onChange, onCommit, photoUrl, compact, extraSwatches = [], onPickNamed }: ColorPickerProps) {
  const [recent, setRecent] = useState<string[]>(loadRecentColors)
  const [sampling, setSampling] = useState(false)
  const [sampleError, setSampleError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function commit(hex: string) {
    onChange(hex)
    setRecent(rememberColor(hex))
    onCommit?.(hex)
  }

  function commitNamed(hex: string, name: string) {
    commit(hex)
    onPickNamed?.(hex, name)
  }

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
      {!compact && (extraSwatches.length > 0 || recent.length > 0) && (
        <div className="color-picker__recent">
          {extraSwatches.map((c) => (
            <button
              key={`extra-${c.hex}-${c.name}`}
              type="button"
              className="color-picker__swatch"
              style={{ background: c.hex }}
              onClick={() => commitNamed(c.hex, c.name)}
              aria-label={`Usar color ${c.name}`}
              title={c.name}
            />
          ))}
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              className="color-picker__swatch"
              style={{ background: c }}
              onClick={() => commit(c)}
              aria-label={`Usar color ${c}`}
              title={c}
            />
          ))}
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

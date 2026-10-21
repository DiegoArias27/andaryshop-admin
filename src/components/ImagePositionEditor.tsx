/** A lightweight editor for just an image's position/size within its box —
 * for spots that show a single photo as a background (category tiles, the
 * "Arma tu paquete" banner) but don't need the full BannerEditor (no text or
 * buttons to place, just "move it" or "shrink it"). Mirrors BannerEditor's
 * own H/V position sliders, plus a size slider standing in for
 * background-size (null = cover, filling the box; a number = an explicit
 * percent, letting the photo shrink to reveal the box's own background
 * color around it). */
export default function ImagePositionEditor({
  imageUrl,
  focusX,
  focusY,
  zoom,
  scrimOpacity,
  onChange,
  aspectRatio,
  backgroundColor = '#1c1c1e',
}: {
  imageUrl: string
  focusX: number
  focusY: number
  zoom: number | null
  /** null (default) = the tile's own fixed dark gradient over the photo
   * (see .category-showcase__scrim in frontend's index.css) — a 0-150
   * number scales that gradient's opacity, same idea as banners'
   * scrim_opacity. Omit entirely (together with onChange never getting a
   * scrimOpacity field) for a spot with no scrim/text-legibility concern of
   * its own. */
  scrimOpacity?: number | null
  onChange: (next: { focusX: number; focusY: number; zoom: number | null; scrimOpacity: number | null }) => void
  /** CSS aspect-ratio value matching how this image actually renders on the
   * site (e.g. "2.2 / 1" for a category tile), so the preview here isn't
   * misleading. */
  aspectRatio: string
  backgroundColor?: string
}) {
  const hasScrim = scrimOpacity !== undefined
  const isDefault = focusX === 50 && focusY === 50 && zoom == null && (!hasScrim || scrimOpacity == null)

  return (
    <div className="image-position-editor">
      <div
        className="image-position-editor__preview"
        style={{
          position: 'relative',
          aspectRatio,
          backgroundColor,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: zoom != null ? `${zoom}%` : 'cover',
          backgroundPosition: `${focusX}% ${focusY}%`,
        }}
      >
        {hasScrim && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, rgba(0, 0, 0, ${(0.1 * ((scrimOpacity ?? 100) / 100)).toFixed(2)}) 0%, rgba(0, 0, 0, ${(0.8 * ((scrimOpacity ?? 100) / 100)).toFixed(2)}) 100%)`,
            }}
          />
        )}
      </div>
      <div className="image-position-editor__controls">
        <label className="banner-editor__toolbar-num" title="Horizontal">
          H
          <input
            type="range"
            min="0"
            max="100"
            value={focusX}
            onChange={(e) => onChange({ focusX: Number(e.target.value), focusY, zoom, scrimOpacity: scrimOpacity ?? null })}
          />
        </label>
        <label className="banner-editor__toolbar-num" title="Vertical">
          V
          <input
            type="range"
            min="0"
            max="100"
            value={focusY}
            onChange={(e) => onChange({ focusX, focusY: Number(e.target.value), zoom, scrimOpacity: scrimOpacity ?? null })}
          />
        </label>
        <label className="banner-editor__toolbar-num" title="Tamaño de la foto dentro del cuadro">
          Tamaño
          <input
            type="range"
            min="30"
            max="150"
            value={zoom ?? 100}
            onChange={(e) => onChange({ focusX, focusY, zoom: Number(e.target.value), scrimOpacity: scrimOpacity ?? null })}
          />
        </label>
        {hasScrim && (
          <label className="banner-editor__toolbar-num" title="Qué tan oscurecida se ve la foto (para que el texto encima se lea bien) — bájalo si se ve muy tenue/opaca">
            Oscurecer
            <input
              type="range"
              min="0"
              max="150"
              value={scrimOpacity ?? 100}
              onChange={(e) => onChange({ focusX, focusY, zoom, scrimOpacity: Number(e.target.value) })}
            />
          </label>
        )}
        {!isDefault && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange({ focusX: 50, focusY: 50, zoom: null, scrimOpacity: null })}
          >
            Restablecer
          </button>
        )}
      </div>
      <p className="page-block__hint">
        Arrastra H/V para mover la foto dentro del cuadro; baja "Tamaño" para que se vea más chica (se ve el fondo
        alrededor) o súbelo para acercarla.
        {hasScrim && ' "Oscurecer" controla el degradado oscuro para que el texto encima se lea bien.'}
      </p>
    </div>
  )
}

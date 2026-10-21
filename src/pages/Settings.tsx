import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AppSettings } from '../api/types'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'

type DraftSettings = {
  labelWidthMm: string
  labelHeightMm: string
  lowStockThreshold: string
  bestsellerMinQty: string
  bestsellerLimit: string
}

function toDraft(s: AppSettings): DraftSettings {
  return {
    labelWidthMm: String(s.label_width_mm),
    labelHeightMm: String(s.label_height_mm),
    lowStockThreshold: String(s.low_stock_threshold),
    bestsellerMinQty: String(s.bestseller_min_qty),
    bestsellerLimit: String(s.bestseller_limit),
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [draft, setDraft] = useState<DraftSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setDraft(toDraft(s))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar la configuración'))
  }, [])

  const dirty = !!settings && !!draft && JSON.stringify(toDraft(settings)) !== JSON.stringify(draft)

  function updateField(key: keyof DraftSettings, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateSettings({
        labelWidthMm: Number(draft.labelWidthMm),
        labelHeightMm: Number(draft.labelHeightMm),
        lowStockThreshold: Number(draft.lowStockThreshold),
        bestsellerMinQty: Number(draft.bestsellerMinQty),
        bestsellerLimit: Number(draft.bestsellerLimit),
      })
      setSettings(updated)
      setDraft(toDraft(updated))
      toast('Configuración guardada con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (settings) setDraft(toDraft(settings))
  }

  if (!settings || !draft) {
    return (
      <div className="page-block">
        <h1>Configuración</h1>
        {error ? <p className="state-msg state-msg--error">{error}</p> : <LoadingState />}
      </div>
    )
  }

  return (
    <div className="page-block">
      <h1>Configuración</h1>
      <p className="page-block__hint">
        Valores que antes estaban fijos en el código y ahora se pueden ajustar aquí, sin necesitar un cambio de
        código.
      </p>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Etiquetas</h2>
        <p className="page-block__hint">Tamaño de las etiquetas impresas desde Punto de venta.</p>
        <div className="form-grid">
          <label className="form-field">
            Ancho (mm)
            <input
              type="number"
              min="1"
              value={draft.labelWidthMm}
              onChange={(e) => updateField('labelWidthMm', e.target.value)}
            />
          </label>
          <label className="form-field">
            Alto (mm)
            <input
              type="number"
              min="1"
              value={draft.labelHeightMm}
              onChange={(e) => updateField('labelHeightMm', e.target.value)}
            />
          </label>
        </div>

        <h2 style={{ marginTop: 24 }}>Inventario</h2>
        <p className="page-block__hint">
          A partir de qué cantidad de stock un producto se marca como "Bajo stock" en Productos y Punto de venta, y
          dispara una notificación.
        </p>
        <div className="form-grid">
          <label className="form-field">
            Mínimo de bajo stock
            <input
              type="number"
              min="1"
              value={draft.lowStockThreshold}
              onChange={(e) => updateField('lowStockThreshold', e.target.value)}
            />
          </label>
        </div>

        <h2 style={{ marginTop: 24 }}>Más vendido</h2>
        <p className="page-block__hint">
          Cuántas piezas vendidas (confirmadas, sin contar regalos) hacen falta para que un producto lleve el
          distintivo "Más vendido", y cuántos productos como máximo lo pueden llevar a la vez.
        </p>
        <div className="form-grid">
          <label className="form-field">
            Mínimo vendido
            <input
              type="number"
              min="1"
              value={draft.bestsellerMinQty}
              onChange={(e) => updateField('bestsellerMinQty', e.target.value)}
            />
          </label>
          <label className="form-field">
            Máximo de productos
            <input
              type="number"
              min="1"
              value={draft.bestsellerLimit}
              onChange={(e) => updateField('bestsellerLimit', e.target.value)}
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        {dirty && (
          <div className="variants-editor__edit-actions" style={{ marginTop: 20 }}>
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

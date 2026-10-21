import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Category, WholesaleTier } from '../api/types'
import Modal from '../components/Modal'
import { formatPrice } from '../utils/currency'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'

const emptyDraft = { categoryId: '', minQty: '', maxQty: '', pricePerUnit: '', isFeatured: false }
const ALL_CATEGORIES_LABEL = 'Todas las categorías'

function sortTiers(list: WholesaleTier[]) {
  return [...list].sort((a, b) => a.min_qty - b.min_qty)
}

/** Merges a just-saved (or just-created) tier into the list, mirroring the
 * backend's own exclusivity side effect (wholesale.controller.js unsets any
 * other tier in the same category_id group the moment one is marked
 * is_featured) — without this, a newly-featured tier's local state would be
 * right but every OTHER tier the server also silently unmarked would still
 * show its stale, pre-edit ★ until the next full page reload. */
function applyTierUpdate(list: WholesaleTier[], updated: WholesaleTier): WholesaleTier[] {
  const unsetOthers = (t: WholesaleTier) =>
    updated.is_featured && t.id !== updated.id && t.category_id === updated.category_id ? { ...t, is_featured: 0 } : t
  const exists = list.some((t) => t.id === updated.id)
  const next = exists ? list.map((t) => (t.id === updated.id ? updated : unsetOthers(t))) : [...list.map(unsetOthers), updated]
  return next
}

export default function Wholesale() {
  const [tiers, setTiers] = useState<WholesaleTier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [creating, setCreating] = useState(false)

  const [editingTier, setEditingTier] = useState<WholesaleTier | null>(null)
  const [editDraft, setEditDraft] = useState(emptyDraft)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    Promise.all([api.getWholesaleTiers(), api.getCategories()])
      .then(([tiersData, categoriesData]) => {
        setTiers(tiersData)
        setCategories(categoriesData)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!draft.minQty || !draft.pricePerUnit) return
    setCreating(true)
    setError(null)
    try {
      const created = await api.createWholesaleTier({
        categoryId: draft.categoryId ? Number(draft.categoryId) : null,
        minQty: Number(draft.minQty),
        maxQty: draft.maxQty ? Number(draft.maxQty) : null,
        pricePerUnit: Number(draft.pricePerUnit),
        sortOrder: tiers.length,
        isFeatured: draft.isFeatured,
      })
      setTiers((prev) => sortTiers(applyTierUpdate(prev, created)))
      setDraft((d) => ({ ...emptyDraft, categoryId: d.categoryId }))
      toast('Rango agregado con éxito')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar el rango')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(t: WholesaleTier) {
    setEditingTier(t)
    setEditDraft({
      categoryId: t.category_id ? String(t.category_id) : '',
      minQty: String(t.min_qty),
      maxQty: t.max_qty ? String(t.max_qty) : '',
      pricePerUnit: t.price_per_unit,
      isFeatured: !!t.is_featured,
    })
    setEditError(null)
  }

  async function handleSaveEdit() {
    if (!editingTier) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const updated = await api.updateWholesaleTier(editingTier.id, {
        categoryId: editDraft.categoryId ? Number(editDraft.categoryId) : null,
        minQty: Number(editDraft.minQty) || 0,
        maxQty: editDraft.maxQty ? Number(editDraft.maxQty) : null,
        pricePerUnit: Number(editDraft.pricePerUnit) || 0,
        isFeatured: editDraft.isFeatured,
      })
      setTiers((prev) => sortTiers(applyTierUpdate(prev, updated)))
      setEditingTier(null)
      toast('Rango actualizado con éxito')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(t: WholesaleTier) {
    const ok = await confirm({
      title: '¿Eliminar este rango de mayoreo?',
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteWholesaleTier(t.id)
    setTiers((prev) => prev.filter((x) => x.id !== t.id))
    toast('Rango eliminado con éxito')
  }

  const groups = useMemo(() => {
    const map = new Map<number | null, WholesaleTier[]>()
    for (const t of tiers) {
      const key = t.category_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    const entries = [...map.entries()]
    entries.sort((a, b) => {
      if (a[0] === null) return 1
      if (b[0] === null) return -1
      const nameA = categories.find((c) => c.id === a[0])?.name ?? ''
      const nameB = categories.find((c) => c.id === b[0])?.name ?? ''
      return nameA.localeCompare(nameB)
    })
    return entries
  }, [tiers, categories])

  return (
    <div className="page-block">
      <h1>Mayoreo</h1>
      <p className="page-block__hint">
        Cuando un cliente agrega varias unidades del mismo producto al carrito, se aplica automáticamente el precio
        por unidad del rango correspondiente. Cada categoría puede tener sus propios rangos; los que se dejan en
        "{ALL_CATEGORIES_LABEL}" aplican a cualquier categoría que no tenga rangos propios.
      </p>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && (
        <div className="card">
          <h2>Rangos de mayoreo</h2>
          {groups.length === 0 && <p className="state-msg">Aún no hay rangos de mayoreo configurados.</p>}

          {groups.map(([categoryId, groupTiers]) => (
            <div key={categoryId ?? 'all'} className="wholesale-group">
              <h3 className="wholesale-group__title">
                {categoryId === null ? ALL_CATEGORIES_LABEL : categories.find((c) => c.id === categoryId)?.name ?? '—'}
              </h3>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Cantidad mínima</th>
                      <th>Cantidad máxima</th>
                      <th>Precio por unidad</th>
                      <th>Más elegido</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupTiers.map((t) => (
                      <tr key={t.id}>
                        <td>{t.min_qty}</td>
                        <td>{t.max_qty ?? 'Sin límite'}</td>
                        <td>{formatPrice(t.price_per_unit)}</td>
                        <td>{!!t.is_featured && '★'}</td>
                        <td>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEdit(t)}>
                            Editar
                          </button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(t)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <form className="variant-form wholesale-tier-form" onSubmit={handleAdd} style={{ marginTop: 16 }}>
            <select value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}>
              <option value="">{ALL_CATEGORIES_LABEL}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              placeholder="Cantidad mínima"
              value={draft.minQty}
              onChange={(e) => setDraft((d) => ({ ...d, minQty: e.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              placeholder="Cantidad máxima (opcional)"
              value={draft.maxQty}
              onChange={(e) => setDraft((d) => ({ ...d, maxQty: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio por unidad"
              value={draft.pricePerUnit}
              onChange={(e) => setDraft((d) => ({ ...d, pricePerUnit: e.target.value }))}
              required
            />
            <label className="filter-check-pill">
              <input
                type="checkbox"
                checked={draft.isFeatured}
                onChange={(e) => setDraft((d) => ({ ...d, isFeatured: e.target.checked }))}
              />
              <span>Más elegido</span>
            </label>
            <button type="submit" className="btn btn--primary btn--sm" disabled={creating}>
              {creating ? 'Guardando…' : '+ Agregar rango'}
            </button>
          </form>
        </div>
      )}

      {editingTier && (
        <Modal title="Editar rango de mayoreo" onClose={() => setEditingTier(null)}>
          <label className="form-field">
            Categoría
            <select value={editDraft.categoryId} onChange={(e) => setEditDraft((d) => ({ ...d, categoryId: e.target.value }))}>
              <option value="">{ALL_CATEGORIES_LABEL}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="form-field">
              Cantidad mínima
              <input
                type="number"
                min="1"
                value={editDraft.minQty}
                onChange={(e) => setEditDraft((d) => ({ ...d, minQty: e.target.value }))}
              />
            </label>
            <label className="form-field">
              Cantidad máxima (opcional)
              <input
                type="number"
                min="1"
                placeholder="Sin límite"
                value={editDraft.maxQty}
                onChange={(e) => setEditDraft((d) => ({ ...d, maxQty: e.target.value }))}
              />
            </label>
          </div>
          <label className="form-field">
            Precio por unidad
            <input
              type="number"
              step="0.01"
              min="0"
              value={editDraft.pricePerUnit}
              onChange={(e) => setEditDraft((d) => ({ ...d, pricePerUnit: e.target.value }))}
            />
          </label>
          <label className="filter-check-pill">
            <input
              type="checkbox"
              checked={editDraft.isFeatured}
              onChange={(e) => setEditDraft((d) => ({ ...d, isFeatured: e.target.checked }))}
            />
            <span>Marcar como "Más elegido"</span>
          </label>
          <p className="page-block__hint">
            Si lo dejas sin marcar, el rango "Más elegido" se elige automáticamente según las ventas reales.
          </p>
          {editError && <p className="form-error">{editError}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setEditingTier(null)} disabled={savingEdit}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

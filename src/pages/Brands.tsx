import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Brand } from '../api/types'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    api
      .getBrands()
      .then((data) => {
        setBrands(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      const created = await api.createBrand(name.trim())
      setBrands((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      toast(`Marca "${created.name}" creada con éxito`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear marca')
    }
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return
    try {
      const updated = await api.updateBrand(id, editingName.trim())
      setBrands((prev) => prev.map((b) => (b.id === id ? updated : b)))
      setEditingId(null)
      toast(`Marca renombrada a "${updated.name}" con éxito`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al renombrar')
    }
  }

  async function handleDelete(id: number, brandName: string) {
    const ok = await confirm({
      title: `¿Eliminar la marca "${brandName}"?`,
      message: 'Los productos quedarán sin marca.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteBrand(id)
    setBrands((prev) => prev.filter((b) => b.id !== id))
    toast(`Marca "${brandName}" se eliminó con éxito`)
  }

  return (
    <div className="page-block">
      <h1>Marcas</h1>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && (
        <ul className="category-list">
          {brands.map((b) => (
            <li key={b.id} className="category-list__item">
              {editingId === b.id ? (
                <>
                  <input
                    className="category-list__input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                  />
                  <button className="btn btn--ghost btn--sm" onClick={() => handleRename(b.id)}>
                    Guardar
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="category-list__name">{b.name}</span>
                  <span className="category-list__slug">/{b.slug}</span>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setEditingId(b.id)
                      setEditingName(b.name)
                    }}
                  >
                    Editar
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(b.id, b.name)}>
                    Eliminar
                  </button>
                </>
              )}
            </li>
          ))}
          {brands.length === 0 && <p className="state-msg">Aún no hay marcas.</p>}
        </ul>
      )}

      <form className="category-form" onSubmit={handleCreate}>
        <input placeholder="Nueva marca" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn--primary">
          + Agregar
        </button>
      </form>
    </div>
  )
}

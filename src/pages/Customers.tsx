import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Customer } from '../api/types'
import { formatPrice } from '../utils/currency'
import { useToast } from '../hooks/useToast'
import LoadingState from '../components/LoadingState'
import { SearchIcon } from '../components/icons'

function CustomerRow({ customer, onSaved }: { customer: Customer; onSaved: (c: Customer) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [discount, setDiscount] = useState(customer.discount_amount)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.updateCustomer(customer.id, { name, phone: phone.trim(), discountAmount: Number(discount) || 0 })
      onSaved(updated)
      setEditing(false)
      toast('Cliente actualizado con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 160 }} />
        ) : (
          customer.name
        )}
      </td>
      <td>{customer.email ?? '—'}</td>
      <td>
        {editing ? (
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" style={{ width: 130 }} />
        ) : (
          customer.phone ?? '—'
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            style={{ width: 90 }}
          />
        ) : Number(customer.discount_amount) > 0 ? (
          <span className="tag">-{formatPrice(customer.discount_amount)} c/u</span>
        ) : (
          <span className="page-block__hint">Sin descuento</span>
        )}
      </td>
      <td>{new Date(customer.created_at).toLocaleDateString('es-MX')}</td>
      <td>
        {editing ? (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </td>
    </tr>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newDiscount, setNewDiscount] = useState('0')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const { toast } = useToast()

  function load() {
    setLoading(true)
    api
      .getCustomers(search || undefined)
      .then((data) => {
        setCustomers(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar clientes')
        setLoading(false)
      })
  }

  useEffect(load, [search])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await api.createCustomer({
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        phone: newPhone.trim() || undefined,
        discountAmount: Number(newDiscount) || 0,
      })
      setCustomers((prev) => [created, ...prev])
      setNewEmail('')
      setNewName('')
      setNewPhone('')
      setNewDiscount('0')
      toast(`Cliente "${created.email}" agregado con éxito`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear cliente')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page-block">
      <h1>Clientes</h1>
      <p className="page-block__hint">
        Cuentas de la tienda (inician sesión con Google). Ponle un descuento por correo para que se aplique
        automáticamente en cada producto que pida — se etiqueta como "Cliente frecuente" en Ventas. Puedes agregar el
        correo aquí antes de que la persona inicie sesión por primera vez; en cuanto entre con ese correo, el
        descuento ya estará activo.
      </p>

      <div className="card" style={{ maxWidth: 560, marginBottom: 24 }}>
        <h2>Agregar cliente</h2>
        <form onSubmit={handleCreate}>
          <label className="form-field">
            Correo
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="cliente@gmail.com" required />
          </label>
          <label className="form-field">
            Nombre (opcional)
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Juan Pérez" />
          </label>
          <label className="form-field">
            Teléfono (opcional)
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Ej. 4491234567" />
          </label>
          <label className="form-field">
            Descuento por producto (MXN)
            <input type="number" min="0" step="0.01" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
          </label>
          {createError && <p className="form-error">{createError}</p>}
          <button type="submit" className="btn btn--accent" disabled={creating}>
            {creating ? 'Guardando…' : '+ Agregar cliente'}
          </button>
        </form>
      </div>

      <div className="search-field" style={{ maxWidth: 320, marginBottom: 16 }}>
        <SearchIcon />
        <input placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}
      {!loading && customers.length === 0 && <p className="state-msg">Aún no hay clientes.</p>}

      {!loading && customers.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Descuento</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  onSaved={(updated) => setCustomers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

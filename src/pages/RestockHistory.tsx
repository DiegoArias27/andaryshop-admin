import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { StockMovement } from '../api/types'
import { QUICK_RANGE_LABELS, computeQuickRange, type QuickRange } from '../utils/dateRanges'
import LoadingState from '../components/LoadingState'
import ImageLightbox from '../components/ImageLightbox'

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_WEEK = computeQuickRange('this_week')!

export default function RestockHistory() {
  const [rows, setRows] = useState<StockMovement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(DEFAULT_WEEK.from)
  const [to, setTo] = useState(DEFAULT_WEEK.to)
  const [quickRange, setQuickRange] = useState<QuickRange>('this_week')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [viewerImage, setViewerImage] = useState<string | null>(null)

  // Debounced so typing a search term doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [qInput])

  function load() {
    setLoading(true)
    setError(null)
    api
      .getRestockHistory({
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .then((res) => {
        setRows(res.rows)
        setTotal(res.total)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar el historial')
        setLoading(false)
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to, q, page])

  function handleDateChange(setter: (v: string) => void, value: string) {
    setter(value)
    setQuickRange('custom')
    setPage(1)
  }

  function handleQuickRangeChange(range: QuickRange) {
    setQuickRange(range)
    const computed = computeQuickRange(range)
    if (computed) {
      setFrom(computed.from)
      setTo(computed.to)
    }
    setPage(1)
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-block">
      <h1>Historial de reabastecimiento</h1>
      <p className="page-block__hint">
        Cada vez que se surte inventario desde Punto de venta queda registrado aquí — qué producto, cuánto, quién lo
        hizo y cuándo.
      </p>

      <div className="orders-filters">
        <label className="form-field">
          Periodo
          <select value={quickRange} onChange={(e) => handleQuickRangeChange(e.target.value as QuickRange)}>
            {(Object.keys(QUICK_RANGE_LABELS) as QuickRange[]).map((r) => (
              <option key={r} value={r}>
                {QUICK_RANGE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Desde
          <input type="date" value={from} onChange={(e) => handleDateChange(setFrom, e.target.value)} />
        </label>
        <label className="form-field">
          Hasta
          <input type="date" value={to} onChange={(e) => handleDateChange(setTo, e.target.value)} />
        </label>
        <label className="form-field restock-history__search">
          Buscar producto o código de barras
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Ej. Gorra LA" />
        </label>
      </div>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Producto</th>
                <th>Talla / Color</th>
                <th>Cantidad</th>
                <th>Stock resultante</th>
                <th>Quién</th>
                <th>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.main_image_url ? (
                      <button
                        type="button"
                        className="admin-table__thumb-btn"
                        onClick={() => setViewerImage(m.main_image_url)}
                        aria-label="Ver imagen en grande"
                      >
                        <img src={m.main_image_url} alt="" className="admin-table__thumb" />
                      </button>
                    ) : (
                      <div className="admin-table__thumb admin-table__thumb--empty" />
                    )}
                  </td>
                  <td>{m.product_name}</td>
                  <td>
                    {m.size} · {m.color_name}
                  </td>
                  <td>+{m.delta}</td>
                  <td>{m.resulting_stock}</td>
                  <td>{m.admin_email ?? '—'}</td>
                  <td>{new Date(m.created_at).toLocaleString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="state-msg">No hay reabastecimientos con este filtro.</p>}

          {total > 0 && (
            <div className="pagination">
              <span className="pagination__info">
                {total} reabastecimiento(s) · página {page} de {pageCount}
              </span>
              <div className="pagination__controls">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {viewerImage && <ImageLightbox images={[{ url: viewerImage }]} initialIndex={0} onClose={() => setViewerImage(null)} />}
    </div>
  )
}

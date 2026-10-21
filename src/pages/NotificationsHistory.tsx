import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AppNotification } from '../api/types'
import NotificationRow from '../components/NotificationRow'
import LoadingState from '../components/LoadingState'

const PAGE_SIZE = 20

export default function NotificationsHistory() {
  const [rows, setRows] = useState<AppNotification[]>([])
  const [total, setTotal] = useState(0)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  function load() {
    setLoading(true)
    setError(null)
    api
      .getNotifications({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((data) => {
        setRows(data.rows)
        setTotal(data.total)
        setUnread(data.unread)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar notificaciones')
        setLoading(false)
      })
  }

  useEffect(load, [page])

  function handleRead(id: number) {
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
    setUnread((prev) => Math.max(0, prev - 1))
    api.markNotificationRead(id).catch(() => {})
  }

  async function handleMarkAll() {
    setRows((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnread(0)
    try {
      await api.markAllNotificationsRead()
    } catch {
      // Ignore — a reload will correct it.
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-block">
      <div className="page-block__header">
        <h1>Notificaciones</h1>
        {unread > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleMarkAll}>
            Marcar todas como leídas
          </button>
        )}
      </div>
      <p className="page-block__hint">
        Historial completo de avisos de bajo stock, agotados, cortes de caja automáticos y pedidos de WhatsApp.
      </p>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}
      {!loading && rows.length === 0 && <p className="state-msg">Aún no hay notificaciones.</p>}

      {!loading && rows.length > 0 && (
        <>
          <ul className="notification-row-list notification-row-list--page">
            {rows.map((n) => (
              <NotificationRow key={n.id} notification={n} onRead={handleRead} />
            ))}
          </ul>

          <div className="pagination">
            <span>
              {total} notificación(es) · página {page} de {totalPages}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Anterior
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  )
}

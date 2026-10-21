import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { AppNotification } from '../api/types'
import { playNotificationSound } from '../utils/sound'
import { isPushSupported, subscribeToPush } from '../utils/pushNotifications'
import NotificationRow from './NotificationRow'
import { BellIcon } from './icons'

const POLL_INTERVAL_MS = 60_000
const BELL_LIMIT = 5

/** Polls the shared notification inbox while the tab is open (refreshing the
 * badge/list and playing a short sound on anything new), and separately
 * offers a one-click opt-in to real OS push notifications for when the tab
 * is closed — see admin/src/utils/pushNotifications.ts for why those are two
 * different mechanisms with two different reach. Only shows the last 5 —
 * "Ver historial" links to the full, paginated list (NotificationsHistory).
 * Marking as read is explicit (per row, or "Marcar todas" here) instead of
 * happening automatically just from opening the panel. */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [pushStatus, setPushStatus] = useState<'idle' | 'subscribing' | 'on' | 'denied'>('idle')
  const lastSeenIdRef = useRef<number | null>(null)
  const firstLoadRef = useRef(true)

  useEffect(() => {
    if (isPushSupported() && Notification.permission === 'granted') setPushStatus('on')

    let cancelled = false
    async function poll() {
      try {
        const data = await api.getNotifications({ limit: BELL_LIMIT })
        if (cancelled) return
        const newestId = data.rows[0]?.id ?? null
        if (!firstLoadRef.current && newestId != null && newestId !== lastSeenIdRef.current) {
          playNotificationSound()
        }
        firstLoadRef.current = false
        lastSeenIdRef.current = newestId
        setRows(data.rows)
        setUnread(data.unread)
      } catch {
        // Silent — a missed poll just retries in another minute.
      }
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function handleEnablePush() {
    setPushStatus('subscribing')
    try {
      const ok = await subscribeToPush()
      setPushStatus(ok ? 'on' : 'denied')
    } catch {
      setPushStatus('denied')
    }
  }

  function markReadLocally(id: number) {
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
    setUnread((prev) => Math.max(0, prev - 1))
  }

  async function handleRead(id: number) {
    const wasUnread = rows.find((n) => n.id === id)?.read_at == null
    if (!wasUnread) return
    markReadLocally(id)
    try {
      await api.markNotificationRead(id)
    } catch {
      // Ignore — the next poll will correct the badge if this silently failed.
    }
  }

  async function handleMarkAll() {
    setRows((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnread(0)
    try {
      await api.markAllNotificationsRead()
    } catch {
      // Ignore — same as above.
    }
  }

  return (
    <div className="notifications-bell">
      {open && (
        <div className="notifications-bell__panel">
          <div className="notifications-bell__header">
            <h3>Notificaciones</h3>
            {pushStatus !== 'on' && isPushSupported() && (
              <button type="button" className="btn btn--sm btn--outline" onClick={handleEnablePush} disabled={pushStatus === 'subscribing'}>
                {pushStatus === 'subscribing' ? 'Activando…' : pushStatus === 'denied' ? 'Permiso denegado' : 'Activar avisos'}
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="notifications-bell__empty">Sin notificaciones por ahora.</p>
          ) : (
            <>
              {unread > 0 && (
                <button type="button" className="btn btn--ghost btn--sm notifications-bell__mark-all" onClick={handleMarkAll}>
                  Marcar todas como leídas
                </button>
              )}
              <ul className="notification-row-list">
                {rows.map((n) => (
                  <NotificationRow key={n.id} notification={n} onRead={handleRead} />
                ))}
              </ul>
            </>
          )}
          <Link to="/notificaciones" className="notifications-bell__history-link" onClick={() => setOpen(false)}>
            Ver historial
          </Link>
        </div>
      )}
      <button type="button" className="notifications-bell__button" onClick={() => setOpen((v) => !v)} aria-label="Notificaciones">
        <BellIcon />
        {unread > 0 && <span className="notifications-bell__badge">{unread}</span>}
      </button>
    </div>
  )
}

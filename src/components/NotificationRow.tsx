import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AppNotification } from '../api/types'
import { notificationLink } from '../utils/notificationLink'
import ImageLightbox from './ImageLightbox'
import { CheckIcon, NoStockIcon, ScissorsIcon, WarningIcon, WhatsappIcon } from './icons'

function iconFor(type: AppNotification['type']) {
  if (type === 'out_of_stock') return <NoStockIcon width={16} height={16} fill="currentColor" style={{ color: 'var(--red)' }} />
  if (type === 'cash_cut') return <ScissorsIcon width={16} height={16} style={{ color: 'var(--green)' }} />
  if (type === 'whatsapp_order') return <WhatsappIcon width={16} height={16} style={{ color: 'var(--green)' }} />
  return <WarningIcon width={16} height={16} fill="currentColor" style={{ color: 'var(--amber)' }} />
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

/** One notification row, shared by the bell's dropdown and the full history
 * page — the thumbnail (when there's a product photo) opens a lightbox
 * in-place, "marcar leída" clears the unread flag without navigating away,
 * and clicking anywhere else on the row marks it read AND takes the admin to
 * wherever that notification is about (see notificationLink). */
export default function NotificationRow({
  notification,
  onRead,
}: {
  notification: AppNotification
  onRead: (id: number) => void
}) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const unread = !notification.read_at
  const link = notificationLink(notification)

  const body = (
    <>
      {notification.product_image_url ? (
        <button
          type="button"
          className="notification-row__thumb-btn"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setViewerOpen(true)
          }}
          aria-label="Ver imagen en grande"
        >
          <img src={notification.product_image_url} alt="" />
        </button>
      ) : (
        <span className="notification-row__icon">{iconFor(notification.type)}</span>
      )}
      <div className="notification-row__body">
        <strong>{notification.title}</strong>
        <span>{notification.body}</span>
        <time>{timeAgo(notification.created_at)}</time>
      </div>
      {unread && (
        <button
          type="button"
          className="icon-btn icon-btn--ghost notification-row__read-btn"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRead(notification.id)
          }}
          aria-label="Marcar como leída"
          title="Marcar como leída"
        >
          <CheckIcon width={14} height={14} />
        </button>
      )}
    </>
  )

  return (
    <li className={`notification-row ${unread ? 'notification-row--unread' : ''}`}>
      {link ? (
        <Link to={link} className="notification-row__link" onClick={() => onRead(notification.id)}>
          {body}
        </Link>
      ) : (
        <div className="notification-row__link">{body}</div>
      )}
      {viewerOpen && notification.product_image_url && (
        <ImageLightbox
          images={[{ url: notification.product_image_url, label: notification.product_name ?? undefined }]}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </li>
  )
}

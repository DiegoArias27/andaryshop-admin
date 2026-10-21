import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'

/** A generic centered modal for an edit form — replaces the old "Activar
 * edición" lock-the-whole-section pattern: clicking "Editar" now just opens
 * this directly instead of requiring an unlock step first. Closing (the ×,
 * clicking the backdrop, or Escape) is equivalent to Cancelar. */
export default function Modal({
  title,
  onClose,
  children,
  maxWidth = 560,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}) {
  return createPortal(
    <div className="confirm-overlay edit-modal-overlay" onClick={onClose}>
      <div className="edit-modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>
        <div className="edit-modal__body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

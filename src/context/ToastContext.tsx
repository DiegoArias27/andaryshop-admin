import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastType } from './toast-context'
import { CheckIcon, CloseIcon } from '../components/icons'
import { playErrorSound, playSuccessSound } from '../utils/sound'

interface ToastEntry {
  id: number
  message: string
  type: ToastType
}

let idCounter = 0

function durationFor(message: string) {
  return Math.min(4500 + message.length * 70, 12000)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const schedule = useCallback(
    (id: number, message: string) => {
      const timer = window.setTimeout(() => dismiss(id), durationFor(message))
      timers.current.set(id, timer)
    },
    [dismiss]
  )

  const toast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = idCounter++
      setToasts((prev) => [...prev, { id, message, type }])
      schedule(id, message)
      if (type === 'error') playErrorSound()
      else playSuccessSound()
    },
    [schedule]
  )

  function handleMouseEnter(id: number) {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }

  function handleMouseLeave(id: number, message: string) {
    schedule(id, message)
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.type}`}
            role="status"
            onMouseEnter={() => handleMouseEnter(t.id)}
            onMouseLeave={() => handleMouseLeave(t.id, t.message)}
          >
            <span className="toast__icon">{t.type === 'success' ? <CheckIcon /> : <CloseIcon />}</span>
            <span className="toast__message">{t.message}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

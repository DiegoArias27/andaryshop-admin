import { createContext } from 'react'

export type ToastType = 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

import { useContext } from 'react'
import { ConfirmContext } from '../context/confirm-context'

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx.confirm
}

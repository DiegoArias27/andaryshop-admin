import { useContext } from 'react'
import { PosSessionContext } from '../context/pos-session-context'

export function usePosSession() {
  const ctx = useContext(PosSessionContext)
  if (!ctx) throw new Error('usePosSession must be used within a PosSessionProvider')
  return ctx
}

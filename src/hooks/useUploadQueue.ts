import { useContext } from 'react'
import { UploadQueueContext } from '../context/upload-queue-context'

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext)
  if (!ctx) throw new Error('useUploadQueue must be used within an UploadQueueProvider')
  return ctx
}

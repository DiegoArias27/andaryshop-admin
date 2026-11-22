import { useUploadQueue } from '../hooks/useUploadQueue'
import { UploadCloudIcon } from './icons'

/** Floating pill visible on every admin page (like HeldSalesWidget) — the
 * whole point of queuing uploads at the app root is that they survive
 * navigating away from the product page that started them, so this is what
 * tells the admin that's actually happening instead of leaving them to
 * wonder. */
export default function UploadQueueWidget() {
  const { jobs } = useUploadQueue()
  if (jobs.length === 0) return null

  const errorCount = jobs.filter((j) => j.status === 'error').length
  const uploadingCount = jobs.length - errorCount

  return (
    <div className={`upload-queue-widget ${errorCount > 0 && uploadingCount === 0 ? 'upload-queue-widget--error' : ''}`}>
      <UploadCloudIcon width={16} height={16} />
      {uploadingCount > 0
        ? `Subiendo ${uploadingCount} foto${uploadingCount > 1 ? 's' : ''}…`
        : `${errorCount} foto${errorCount > 1 ? 's' : ''} no se pudo subir`}
    </div>
  )
}

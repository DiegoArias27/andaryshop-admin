import { createContext } from 'react'
import type { ProductImage } from '../api/types'

export interface UploadJob {
  id: number
  productId: number
  productName: string
  status: 'uploading' | 'error'
}

export type EnqueueInput = {
  productId: number
  productName: string
  colorName?: string | null
} & ({ file: File } | { url: string })

export interface UploadQueueContextValue {
  jobs: UploadJob[]
  enqueue: (input: EnqueueInput) => void
  /** Lets a mounted GalleryManager for this exact product receive images as
   * they land, instead of only finding out next time it fetches the product
   * — called while the admin is still on the page. If nothing's subscribed
   * (they've navigated away) the queue shows a toast instead once it lands. */
  subscribe: (productId: number, cb: (images: ProductImage[]) => void) => () => void
}

export const UploadQueueContext = createContext<UploadQueueContextValue | null>(null)

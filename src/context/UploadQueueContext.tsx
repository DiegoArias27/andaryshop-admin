import { useCallback, useRef, useState, type ReactNode } from 'react'
import { UploadQueueContext, type EnqueueInput, type UploadJob } from './upload-queue-context'
import { api } from '../api/client'
import type { ProductImage } from '../api/types'
import { useToast } from '../hooks/useToast'

let idCounter = 0

/** Mounted once at the app root (see App.tsx) — outside any single page —
 * so a photo upload started on a product's edit page keeps going, and still
 * reaches the server correctly, even after navigating away from it. Without
 * this living above the page, GalleryManager used to drive the whole
 * upload-then-attach sequence itself, which worked fine while the admin
 * stayed put but gave no feedback at all once they left (the network calls
 * still finished, nothing told them so). */
export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const { toast } = useToast()
  // One promise chain per product, not a single global one — the backend
  // assigns each new image's position from the current MAX(sort_order), so
  // two uploads for the SAME product firing at once would both read the
  // same number and collide; different products never share anything, so
  // they're free to upload in parallel.
  const chainsRef = useRef(new Map<number, Promise<void>>())
  const subscribersRef = useRef(new Map<number, Set<(images: ProductImage[]) => void>>())

  const subscribe = useCallback((productId: number, cb: (images: ProductImage[]) => void) => {
    const set = subscribersRef.current.get(productId) ?? new Set()
    set.add(cb)
    subscribersRef.current.set(productId, set)
    return () => {
      set.delete(cb)
    }
  }, [])

  const enqueue = useCallback(
    (input: EnqueueInput) => {
      const id = idCounter++
      setJobs((prev) => [...prev, { id, productId: input.productId, productName: input.productName, status: 'uploading' }])

      const previous = chainsRef.current.get(input.productId) ?? Promise.resolve()
      const next = previous.then(async () => {
        try {
          const url = 'file' in input ? (await api.uploadImage(input.file)).url : input.url
          const updated = await api.addProductImages(input.productId, [{ url, colorName: input.colorName ?? null }])
          setJobs((prev) => prev.filter((j) => j.id !== id))
          const liveSubs = subscribersRef.current.get(input.productId)
          if (liveSubs && liveSubs.size > 0) {
            liveSubs.forEach((cb) => cb(updated))
          } else {
            // Nobody's looking at this product's gallery right now — the
            // admin moved on, so this is the only confirmation they get.
            toast(`Foto agregada a "${input.productName}" con éxito`)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al subir la imagen'
          setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: 'error' } : j)))
          toast(`"${input.productName}": ${message}`, 'error')
          window.setTimeout(() => setJobs((prev) => prev.filter((j) => j.id !== id)), 6000)
        }
      })
      chainsRef.current.set(input.productId, next)
    },
    [toast]
  )

  return <UploadQueueContext.Provider value={{ jobs, enqueue, subscribe }}>{children}</UploadQueueContext.Provider>
}

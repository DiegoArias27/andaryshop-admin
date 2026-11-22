const MAX_DIMENSION = 2000
const RECOMPRESS_THRESHOLD_BYTES = 3 * 1024 * 1024
const JPEG_QUALITY = 0.85

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** Phone cameras routinely produce 10-20MB photos — well past the
 * backend's 8MB upload cap (backend/src/middleware/upload.js) and far
 * bigger than a product photo ever needs to be (1200x1600 is this app's
 * own recommendation everywhere a photo gets uploaded). Downscales and
 * recompresses client-side before the file ever leaves the browser, so
 * picking a photo straight off a phone just works instead of failing with
 * "file too large". Left alone: SVGs (no pixels to resize), GIFs
 * (re-encoding would drop the animation) and anything already small. */
export async function shrinkImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file
  }
  if (file.size <= RECOMPRESS_THRESHOLD_BYTES) {
    return file
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file

    const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    // Can't read/decode it client-side for whatever reason — upload the
    // original rather than block the admin; worst case the backend
    // rejects it with the same "file too large" as before this fix.
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

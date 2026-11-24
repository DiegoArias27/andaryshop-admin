import { useEffect } from 'react'

/** Prevents the page behind an image viewer/modal from scrolling while
 * it's open — ported from the storefront's own hook (frontend is a
 * separate repo/project). Plain overflow:hidden isn't enough on iOS
 * Safari, which still lets a touch drag scroll/rubber-band the page
 * behind an overlay — pinning the body in place with position:fixed
 * (restoring the exact scroll position on close) is the standard
 * cross-browser workaround for that. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyPosition = body.style.position
    const previousBodyTop = body.style.top
    const previousBodyWidth = body.style.width

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'

    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
      body.style.position = previousBodyPosition
      body.style.top = previousBodyTop
      body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [active])
}

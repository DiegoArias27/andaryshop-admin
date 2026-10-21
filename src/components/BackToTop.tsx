import { useEffect, useState } from 'react'
import { ArrowUpIcon } from './icons'

const SHOW_AFTER_PX = 400

/** Appears once the page (the window itself scrolls — .admin-main has no
 * inner scroll container) has scrolled past a screenful, on every admin
 * page — long lists (Ventas, Productos) are the main reason to need it. */
export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
    >
      <ArrowUpIcon />
    </button>
  )
}

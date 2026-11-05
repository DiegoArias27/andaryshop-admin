/** Makes native HTML5 drag-and-drop (`draggable`, dragstart/dragover/
 * dragend) work on touch devices, which never fire those events at all —
 * every "arrastra para reordenar" list in the admin (Banners, Collections,
 * VariantsEditor, product images, categories, …) is built entirely on
 * native DnD, reading only closure/React state captured at dragstart (which
 * index is being dragged) — none of them touch `dataTransfer` (the only
 * place in the whole admin that does is ImageUploader's OS file drop, a
 * different gesture touch devices don't have anyway), so translating touch
 * into the same three event types makes all of them work on a phone with
 * zero changes to their own code.
 *
 * Call once, at app startup. */
export function installTouchDragPolyfill() {
  let dragEl: Element | null = null

  function findDraggable(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) return null
    return target.closest('[draggable="true"]')
  }

  function dispatch(type: string, target: EventTarget, touch: Touch) {
    target.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
      })
    )
  }

  document.addEventListener(
    'touchstart',
    (e) => {
      const el = findDraggable(e.target)
      if (!el) return
      dragEl = el
      dispatch('dragstart', el, e.touches[0])
    },
    { passive: true }
  )

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!dragEl) return
      const touch = e.touches[0]
      const over = document.elementFromPoint(touch.clientX, touch.clientY)
      if (over) dispatch('dragover', over, touch)
      // Dragging a handle is the one gesture that should override the
      // page's own scroll — see also touch-action: none on
      // [draggable="true"] in index.css, belt-and-suspenders for whichever
      // of the two a given browser actually honors first.
      e.preventDefault()
    },
    { passive: false }
  )

  function end(e: TouchEvent) {
    if (!dragEl) return
    const touch = e.changedTouches[0]
    const over = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null
    if (over && touch) dispatch('drop', over, touch)
    if (touch) dispatch('dragend', dragEl, touch)
    dragEl = null
  }

  document.addEventListener('touchend', end)
  document.addEventListener('touchcancel', end)
}

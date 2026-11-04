/** A generic placeholder for any vertical stack of bordered card rows
 * (Pedidos, Colecciones, Cortes de caja, Devoluciones) while it loads —
 * defaults to the `.orders-list`/`.order-card` classes, but takes its own
 * for a page whose real list uses a differently-named (near-identical)
 * variant, so spacing still matches the real thing. */
export default function CardListSkeleton({
  rows = 4,
  listClassName = 'orders-list',
  cardClassName = 'order-card',
}: {
  rows?: number
  listClassName?: string
  cardClassName?: string
}) {
  return (
    <div className={listClassName} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cardClassName}>
          <div className="skeleton card-list-skeleton__line card-list-skeleton__line--title" />
          <div className="skeleton card-list-skeleton__line card-list-skeleton__line--body" />
        </div>
      ))}
    </div>
  )
}

/** A generic placeholder for any `.category-list`-shaped row list (Marcas,
 * Categorías, etc.) while it loads — reuses the real list/row classes so
 * spacing matches exactly, just swaps each row's content for shimmer bars. */
export default function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="category-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="category-list__item">
          <div className="skeleton list-skeleton__line" />
        </li>
      ))}
    </ul>
  )
}

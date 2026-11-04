/** A generic placeholder for any `.admin-table`-based list while it loads —
 * reuses the real table/row/cell classes so spacing matches exactly, just
 * swaps each cell's content for a shimmering bar. `columns` only needs to
 * match the real table's column COUNT, not its exact headers. */
export default function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="admin-table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <div className="skeleton table-skeleton__bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

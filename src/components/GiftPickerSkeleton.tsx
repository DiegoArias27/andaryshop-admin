/** Mirrors the real .gift-picker__product row shape while products load —
 * shared by ReturnModal and Orders' POS product picker, which both use the
 * same .gift-picker markup. */
export default function GiftPickerSkeleton() {
  return (
    <div className="gift-picker__list" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="gift-picker__product">
          <div className="skeleton gift-picker-skeleton__thumb" />
          <div className="skeleton gift-picker-skeleton__name" />
        </div>
      ))}
    </div>
  )
}

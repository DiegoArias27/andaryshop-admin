/** A generic placeholder for a `.form-field`-based form (Configuración,
 * editar producto, etc.) while its data loads — a short label bar above a
 * field-height bar, repeated. */
export default function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="form-field">
          <div className="skeleton form-skeleton__label" />
          <div className="skeleton form-skeleton__input" />
        </div>
      ))}
    </div>
  )
}

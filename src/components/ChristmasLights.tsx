const LIGHT_COUNT = 12

/** A thin, deliberately small string-lights strip — the one bit of
 * Christmas decor in the admin panel, kept subtle since this is a daily
 * work tool, not the storefront. Mirrors the customer site's own
 * HeaderLights (same colors/twinkle) for a bit of brand consistency. */
export default function ChristmasLights() {
  return (
    <div className="christmas-lights" aria-hidden="true">
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <span key={i} className="christmas-lights__dot" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />
      ))}
    </div>
  )
}

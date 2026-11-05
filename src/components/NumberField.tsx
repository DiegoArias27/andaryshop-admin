import { useRef, type InputHTMLAttributes } from 'react'

/** A numeric input that stays freely editable while typing, including
 * clearing it to retype a different value — unlike a plain controlled
 * `value={x}` + `onChange` that immediately recomputes and re-applies a
 * fallback on every keystroke (the common `Number(e.target.value) || x`
 * pattern), which fights the user's own typing: clearing the field to
 * empty makes it instantly snap back to the old value, so e.g. a "1" can
 * never be turned into a "23" by deleting and retyping.
 *
 * Uncontrolled by design (`value` only seeds the field — pass a `key` from
 * the caller, e.g. the id of whatever this field belongs to, to reseed it
 * when the field should show a DIFFERENT thing's value instead of the one
 * it was just showing). `onValueChange` fires live on every keystroke that
 * currently parses to a real number (skipped entirely while empty or
 * mid-typing something invalid, so a live preview elsewhere just keeps
 * using the last valid number instead of flashing to a fallback), and
 * clamps to min/max — restoring a valid number if left empty — on blur. */
export default function NumberField({
  value,
  onValueChange,
  min,
  max,
  onBlur,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'defaultValue'> & {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
}) {
  const lastCommittedRef = useRef(value)
  lastCommittedRef.current = value

  return (
    <input
      type="number"
      inputMode="numeric"
      defaultValue={value}
      min={min}
      max={max}
      {...rest}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return
        const n = Number(raw)
        if (!Number.isFinite(n)) return
        onValueChange(n)
      }}
      onBlur={(e) => {
        const raw = e.target.value
        const parsed = Number(raw)
        let n = raw === '' || !Number.isFinite(parsed) ? lastCommittedRef.current : parsed
        if (min != null) n = Math.max(min, n)
        if (max != null) n = Math.min(max, n)
        if (String(n) !== raw) e.target.value = String(n)
        if (n !== lastCommittedRef.current) onValueChange(n)
        onBlur?.(e)
      }}
    />
  )
}

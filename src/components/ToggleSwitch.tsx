interface ToggleSwitchProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function ToggleSwitch({ label, hint, checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <label className={`toggle-row ${disabled ? 'toggle-row--disabled' : ''}`}>
      <div>
        <span className="toggle-row__label">{label}</span>
        {hint && <span className="toggle-row__hint">{hint}</span>}
      </div>
      <span className={`toggle-switch ${checked ? 'toggle-switch--on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="toggle-switch__thumb" />
      </span>
    </label>
  )
}

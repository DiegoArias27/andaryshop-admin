import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmOptions } from './confirm-context'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function handleClose(result: boolean) {
    setOptions(null)
    resolver.current?.(result)
    resolver.current = null
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div className="confirm-overlay" onClick={() => handleClose(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h3>{options.title}</h3>
            {options.message && <p>{options.message}</p>}
            <div className="confirm-modal__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleClose(false)}>
                {options.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={`btn btn--sm ${options.danger ? 'btn--danger' : 'btn--accent'}`}
                onClick={() => handleClose(true)}
                autoFocus
              >
                {options.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

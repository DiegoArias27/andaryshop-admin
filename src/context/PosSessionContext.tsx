import { useEffect, useState, type ReactNode } from 'react'
import { PosSessionContext, type HeldSale } from './pos-session-context'

const STORAGE_KEY = 'andary-admin-held-sales'

/** Survives a reload of the tab (so switching pages or refreshing never
 * loses a held sale) but not closing the browser — plenty for "step away to
 * check Productos and come back", without needing a backend table for
 * sales that were never actually completed. */
function loadHeldSales(): HeldSale[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function PosSessionProvider({ children }: { children: ReactNode }) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>(loadHeldSales)
  const [pendingResume, setPendingResume] = useState<HeldSale | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(heldSales))
    } catch {
      // Private browsing / storage disabled — holding sales still works for
      // the rest of this tab's life, it just won't survive a reload.
    }
  }, [heldSales])

  function holdSale(sale: Omit<HeldSale, 'id' | 'createdAt'>) {
    const held: HeldSale = {
      ...sale,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    }
    setHeldSales((prev) => [...prev, held])
  }

  function requestResume(id: string) {
    setHeldSales((prev) => {
      const found = prev.find((s) => s.id === id)
      if (found) setPendingResume(found)
      return prev.filter((s) => s.id !== id)
    })
  }

  function clearPendingResume() {
    setPendingResume(null)
  }

  function discardSale(id: string) {
    setHeldSales((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <PosSessionContext.Provider
      value={{ heldSales, holdSale, requestResume, pendingResume, clearPendingResume, discardSale }}
    >
      {children}
    </PosSessionContext.Provider>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AppSettings } from '../api/types'

/** Loaded fresh by whichever page needs it (Settings.tsx to edit them,
 * ProductsList.tsx/StockLookup.tsx to read the low-stock threshold) — these
 * change rarely, so there's no shared cache/context, just a plain fetch per
 * page visit, same as how StockLookup already loads its own collections/
 * wholesale-tiers data. */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
  }, [])

  return settings
}

import { startOfWeek, addDays, toDateStr } from './dates'

export type QuickRange = 'custom' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year'

export const QUICK_RANGE_LABELS: Record<QuickRange, string> = {
  custom: 'Personalizado',
  this_week: 'Esta semana',
  last_week: 'Semana pasada',
  this_month: 'Este mes',
  last_month: 'Mes pasado',
  this_year: 'Este año',
  last_year: 'Año pasado',
}

/** Resolves a preset to a concrete from/to pair — the date inputs stay the
 * source of truth afterward, so the admin can still nudge them by hand.
 * Shared by every admin page with a date-range filter (Ventas, Devoluciones,
 * Historial de reabastecimiento) so the same "esta semana"/"este mes"/etc.
 * math isn't duplicated per page. */
export function computeQuickRange(range: QuickRange): { from: string; to: string } | null {
  const now = new Date()
  if (range === 'this_week') {
    const start = startOfWeek(now)
    return { from: toDateStr(start), to: toDateStr(addDays(start, 6)) }
  }
  if (range === 'last_week') {
    const start = addDays(startOfWeek(now), -7)
    return { from: toDateStr(start), to: toDateStr(addDays(start, 6)) }
  }
  if (range === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toDateStr(start), to: toDateStr(end) }
  }
  if (range === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: toDateStr(start), to: toDateStr(end) }
  }
  if (range === 'this_year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
  }
  if (range === 'last_year') {
    const year = now.getFullYear() - 1
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  return null
}

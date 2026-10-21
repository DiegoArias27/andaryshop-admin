import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { CashCutSettings, CashCutSettingsUpdate, CashCutsResponse } from '../api/types'
import { formatPrice } from '../utils/currency'
import { startOfWeek, addDays, toDateStr } from '../utils/dates'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import LoadingState from '../components/LoadingState'
import ToggleSwitch from '../components/ToggleSwitch'
import { ArrowLeftIcon, ArrowRightIcon, CartIcon, CheckIcon, ScissorsIcon, WhatsappIcon } from '../components/icons'

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Mirrors the backend scheduler's own slot math (see
 * backend/src/jobs/cashCutScheduler.js) — purely for display, so the admin
 * can see when the next automatic cut will actually happen. */
function computeNextSlot(settings: CashCutSettings): Date {
  const now = new Date()
  const slot = new Date(now)
  slot.setHours(settings.hour, 0, 0, 0)
  if (settings.frequency === 'daily') {
    if (slot <= now) slot.setDate(slot.getDate() + 1)
    return slot
  }
  const weekday = settings.weekday ?? 0
  const diff = (weekday - slot.getDay() + 7) % 7
  slot.setDate(slot.getDate() + diff)
  if (slot <= now) slot.setDate(slot.getDate() + 7)
  return slot
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/** The very first cut ever made has no real previous cut to start from —
 * the backend fills period_from with a plain pre-launch placeholder
 * ('2000-01-01') instead of a meaningful date. Shown/linked as "desde
 * siempre" instead of that literal year-2000 date, which would otherwise
 * read as a bug. */
const NO_PREVIOUS_CUT_THRESHOLD = '2020-01-01'

function isPlaceholderPeriodStart(iso: string): boolean {
  return iso.slice(0, 10) < NO_PREVIOUS_CUT_THRESHOLD
}

export default function CashCuts() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [data, setData] = useState<CashCutsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState<CashCutSettings | null>(null)
  const { toast } = useToast()
  const confirmDialog = useConfirm()

  useEffect(() => {
    api.getCashCutSettings().then(setSettings).catch(() => {})
  }, [])

  async function updateSettings(patch: CashCutSettingsUpdate) {
    try {
      const updated = await api.updateCashCutSettings(patch)
      setSettings(updated)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar la configuración', 'error')
    }
  }

  const weekEnd = addDays(weekStart, 6)
  const isCurrentWeek = toDateStr(weekStart) === toDateStr(startOfWeek(new Date()))

  function load() {
    setLoading(true)
    setError(null)
    api
      .getCashCuts({ from: toDateStr(weekStart), to: toDateStr(weekEnd) })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar los cortes')
        setLoading(false)
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [weekStart])

  async function handleCreateCut() {
    const ok = await confirmDialog({
      title: 'Realizar corte de caja',
      message: 'Se cerrará el periodo de ventas (WhatsApp y mostrador) acumuladas desde el último corte hasta ahora. No se puede deshacer.',
      confirmLabel: 'Realizar corte',
    })
    if (!ok) return
    setCreating(true)
    try {
      const cut = await api.createCashCut()
      toast(`Corte #${cut.id} realizado — ${formatPrice(cut.total_amount)}`)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al realizar el corte', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page-block">
      <h1>Cortes de caja</h1>
      <p className="page-block__hint">
        Cierra el periodo de ventas acumuladas desde el último corte — por WhatsApp y en mostrador (Punto de venta).
      </p>

      {settings && (
        <div className="cash-cut-automation">
          <ToggleSwitch
            label="Corte automático"
            hint="Se genera solo, sin necesitar clic — igual puedes seguir haciendo cortes manuales cuando quieras."
            checked={!!settings.enabled}
            onChange={(checked) => updateSettings({ enabled: checked })}
          />
          {!!settings.enabled && (
            <div className="cash-cut-automation__config">
              <select
                value={settings.frequency}
                onChange={(e) => updateSettings({ frequency: e.target.value as 'daily' | 'weekly' })}
              >
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
              </select>
              {settings.frequency === 'weekly' && (
                <select value={settings.weekday ?? 0} onChange={(e) => updateSettings({ weekday: Number(e.target.value) })}>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <select value={settings.hour} onChange={(e) => updateSettings({ hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <span className="cash-cut-automation__next">
                Próximo corte: {computeNextSlot(settings).toLocaleString('es-MX')}
              </span>
            </div>
          )}
        </div>
      )}

      {data && (
        <div className="cash-cut-pending">
          <div>
            <span className="cash-cut-pending__label">
              <ScissorsIcon width={14} height={14} /> Sin cortar desde {new Date(data.pending.since).toLocaleString('es-MX')}
            </span>
            <div className="cash-cut-pending__stats">
              <span>
                <strong>{data.pending.salesCount}</strong> ventas
              </span>
              <span>
                <strong>{data.pending.itemsSold}</strong> piezas
              </span>
              <span>
                <strong>{formatPrice(data.pending.totalAmount)}</strong>
              </span>
            </div>
            <div className="cash-cut-pending__by-source">
              <span>
                <WhatsappIcon width={13} height={13} /> {data.pending.bySource.whatsapp.salesCount} ·{' '}
                {formatPrice(data.pending.bySource.whatsapp.totalAmount)}
              </span>
              <span>
                <CartIcon width={13} height={13} /> {data.pending.bySource.pos.salesCount} ·{' '}
                {formatPrice(data.pending.bySource.pos.totalAmount)}
              </span>
            </div>
          </div>
          <div className="cash-cut-pending__actions">
            <button
              type="button"
              className="btn btn--accent"
              onClick={handleCreateCut}
              disabled={creating || data.pending.salesCount === 0}
            >
              {creating ? 'Procesando…' : 'Realizar corte'}
            </button>
            {data.pending.salesCount > 0 && (
              <Link
                to={`/pedidos?confirmedFrom=${encodeURIComponent(data.pending.since)}&cutStatus=pending`}
                className="btn btn--ghost btn--sm"
              >
                Ver ventas de este periodo
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="week-nav">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>
          <ArrowLeftIcon width={14} height={14} /> Semana anterior
        </button>
        <span className="week-nav__label">
          Semana del {formatShort(weekStart)} al {formatShort(weekEnd)}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          disabled={isCurrentWeek}
        >
          Semana siguiente <ArrowRightIcon width={14} height={14} />
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}
      {data && data.cuts.length === 0 && <p className="state-msg">No hay cortes en esta semana.</p>}

      <div className="orders-list">
        {data?.cuts.map((cut) => (
          <div key={cut.id} className="order-card cash-cut-card">
            <div className="order-card__header">
              <div>
                <strong className="order-card__id cash-cut-card__title">
                  <CheckIcon width={15} height={15} /> Corte #{cut.id}
                </strong>
                <span className="order-card__date">{new Date(cut.created_at).toLocaleString('es-MX')}</span>
              </div>
              <div className="order-card__total">{formatPrice(cut.total_amount)}</div>
            </div>
            <p className="page-block__hint">
              Periodo: {isPlaceholderPeriodStart(cut.period_from) ? 'Desde siempre' : new Date(cut.period_from).toLocaleString('es-MX')}{' '}
              — {new Date(cut.period_to).toLocaleString('es-MX')}
            </p>
            <div className="cash-cut-card__stats">
              <span>
                <strong>{cut.sales_count}</strong> ventas
              </span>
              <span>
                <strong>{cut.items_sold}</strong> piezas
              </span>
              {cut.admin_email && <span>Por {cut.admin_email}</span>}
            </div>
            {cut.by_source && (
              <div className="cash-cut-card__by-source">
                <span>
                  <WhatsappIcon width={13} height={13} /> {cut.by_source.whatsapp.salesCount} ·{' '}
                  {formatPrice(cut.by_source.whatsapp.totalAmount)}
                </span>
                <span>
                  <CartIcon width={13} height={13} /> {cut.by_source.pos.salesCount} ·{' '}
                  {formatPrice(cut.by_source.pos.totalAmount)}
                </span>
              </div>
            )}
            <div className="order-card__actions">
              <Link
                to={`/pedidos?${
                  isPlaceholderPeriodStart(cut.period_from) ? '' : `confirmedFrom=${encodeURIComponent(cut.period_from)}&`
                }confirmedTo=${encodeURIComponent(cut.period_to)}&cutStatus=done&cutId=${cut.id}`}
                className="btn btn--ghost btn--sm"
              >
                Ver en Ventas
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Brand, Category, DiscountType, NeckType, Product, ProductCollectionMembership } from '../api/types'
import { formatPrice } from '../utils/currency'
import { getProductPriceInfo } from '../utils/discount'
import {
  CheckSquareIcon,
  CloseIcon,
  FlameIcon,
  NoStockIcon,
  PercentIcon,
  SearchIcon,
  ShirtIcon,
  SquareIcon,
  StarIcon,
  WarningIcon,
} from '../components/icons'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { useAppSettings } from '../hooks/useAppSettings'
import TableSkeleton from '../components/TableSkeleton'
import ImageLightbox, { type LightboxImage } from '../components/ImageLightbox'
import { productGallery } from '../utils/productGallery'

function totalStockOf(p: Product): number {
  return p.variants.reduce((sum, v) => sum + v.stock, 0)
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unitalla'] as const
// Distinct from '' ("Todas las marcas" — no filter at all), so the brand
// select can ALSO filter to specifically the products with no brand set.
const NO_BRAND_VALUE = '__none__'

/** Shown both above and below the table — with a long list, paging from
 * the top shouldn't require scrolling all the way down first. */
function PaginationBar({
  total,
  currentPage,
  pageCount,
  onChange,
  position = 'bottom',
}: {
  total: number
  currentPage: number
  pageCount: number
  onChange: (page: number) => void
  position?: 'top' | 'bottom'
}) {
  return (
    <div className={`pagination ${position === 'top' ? 'pagination--top' : ''}`}>
      <span className="pagination__info">
        {total} producto(s) · página {currentPage} de {pageCount}
      </span>
      <div className="pagination__controls">
        <button type="button" className="btn btn--ghost btn--sm" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)}>
          Anterior
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={currentPage >= pageCount}
          onClick={() => onChange(currentPage + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}

const STATE_KEY = 'andary-products-list-state'
const SCROLL_KEY = 'andary-products-list-scroll'

interface PersistedListState {
  page: number
  search: string
  categoryId: string
  brandId: string
  sizeFilter: string
  neckTypeFilter: NeckType | ''
  onlyNew: boolean
  onlyBestseller: boolean
  onlyDiscounted: boolean
  onlyLowStock: boolean
  onlyOutOfStock: boolean
}

// Read once (not per field) so every field's initial useState reads a
// single consistent snapshot instead of each parsing sessionStorage on
// its own.
function loadPersistedState(): Partial<PersistedListState> {
  try {
    return JSON.parse(sessionStorage.getItem(STATE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function ProductsList() {
  const navigate = useNavigate()
  const settings = useAppSettings()
  const lowStockThreshold = settings?.low_stock_threshold ?? 5
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // True while the restore effect below is actively re-applying a saved
  // scroll position — the save-listener uses this to ignore the 'scroll'
  // events that scrollTo() itself fires, so a brief clamp (restoring before
  // the table's reached its full height) never overwrites the correct saved
  // value with that transient, too-short one.
  const restoringScrollRef = useRef(false)
  // Filters/page/search all restore from sessionStorage regardless of how
  // this page was reached (same as a filter's own usual stickiness); only
  // the scroll position below is deliberately restored just on a real
  // back navigation (see the POP-gated effect) — a fresh visit should
  // still start at the top.
  const [initialState] = useState(loadPersistedState)
  const [search, setSearch] = useState(initialState.search ?? '')
  const [categoryId, setCategoryId] = useState(initialState.categoryId ?? '')
  const [brandId, setBrandId] = useState(initialState.brandId ?? '')
  const [sizeFilter, setSizeFilter] = useState(initialState.sizeFilter ?? '')
  const [neckTypeFilter, setNeckTypeFilter] = useState<NeckType | ''>(initialState.neckTypeFilter ?? '')
  const [onlyNew, setOnlyNew] = useState(initialState.onlyNew ?? false)
  const [onlyBestseller, setOnlyBestseller] = useState(initialState.onlyBestseller ?? false)
  const [onlyDiscounted, setOnlyDiscounted] = useState(initialState.onlyDiscounted ?? false)
  const [onlyLowStock, setOnlyLowStock] = useState(initialState.onlyLowStock ?? false)
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(initialState.onlyOutOfStock ?? false)
  const [viewerImages, setViewerImages] = useState<LightboxImage[] | null>(null)
  const [page, setPage] = useState(initialState.page ?? 1)
  const pageSize = 10
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [discountType, setDiscountType] = useState<DiscountType | ''>('')
  const [discountValue, setDiscountValue] = useState('')
  const [applying, setApplying] = useState(false)
  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    let ignore = false
    Promise.all([api.getProducts(), api.getCategories(), api.getBrands()])
      .then(([productsData, categoriesData, brandsData]) => {
        if (ignore) return
        setProducts(productsData)
        setCategories(categoriesData)
        setBrands(brandsData)
        setLoading(false)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    try {
      const toSave: PersistedListState = {
        page,
        search,
        categoryId,
        brandId,
        sizeFilter,
        neckTypeFilter,
        onlyNew,
        onlyBestseller,
        onlyDiscounted,
        onlyLowStock,
        onlyOutOfStock,
      }
      sessionStorage.setItem(STATE_KEY, JSON.stringify(toSave))
    } catch {
      // Private browsing / storage disabled — filters still work, just
      // won't be remembered for next time.
    }
  }, [
    page,
    search,
    categoryId,
    brandId,
    sizeFilter,
    neckTypeFilter,
    onlyNew,
    onlyBestseller,
    onlyDiscounted,
    onlyLowStock,
    onlyOutOfStock,
  ])

  // Gated on !loading — the skeleton shown while loading is a different
  // (usually shorter) height than the real table, so the browser can
  // clamp the scroll position down to fit it the moment this page first
  // mounts. Recording scroll unconditionally meant that clamp sometimes
  // overwrote the correct saved position (from just before navigating
  // away to edit a product) with that shorter one, before the restore
  // effect below ever got to read it — which one won was a race against
  // how long the fetch took, i.e. exactly "sometimes it works, sometimes
  // it doesn't."
  useEffect(() => {
    if (loading) return
    function saveScroll() {
      if (restoringScrollRef.current) return
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
      } catch {
        // ignore
      }
    }
    window.addEventListener('scroll', saveScroll, { passive: true })
    return () => window.removeEventListener('scroll', saveScroll)
  }, [loading])

  // Restores on every mount with a saved position, not just a POP
  // navigation — a real back (Volver, the browser's own back button) is
  // the normal way here, but gating strictly on that meant clicking
  // "Productos" in the sidebar instead landed back at the top, which read
  // as "sometimes it works, sometimes it doesn't" depending on which one
  // was used. Waits for `loading` to clear so the table has its real
  // height before scrolling, not the much shorter skeleton's, then keeps
  // reapplying until the page's height has actually stopped changing for
  // a few checks in a row (not just a fixed handful of frames, and not
  // just until scrollTo lands close once) — thumbnails/collection tags can
  // still be settling the table's final height well after it first mounts,
  // and after enough repeated back-and-forths that settling can land AFTER
  // a short fixed-attempt retry already gave up, snapping back to the top
  // instead of the saved position.
  useEffect(() => {
    if (loading) return
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(SCROLL_KEY)
    } catch {
      // ignore
    }
    const y = raw ? Number(raw) : NaN
    if (!Number.isFinite(y)) return

    let cancelled = false
    let timeoutId = 0
    let lastHeight = -1
    let stableChecks = 0
    let elapsedMs = 0
    const CHECK_MS = 80
    const MAX_MS = 2000
    const STABLE_CHECKS_NEEDED = 3

    // A webfont that's still loading renders the table in a fallback font
    // with different metrics first, then reflows (sometimes changing row
    // heights, e.g. a long product name wrapping differently) once the real
    // font swaps in — on a cold cache that can land well after the height
    // already looked "stable" a few 80ms checks in a row, so the scroll
    // position drifts with nothing left to correct it. Only matters as an
    // extra condition to KEEP retrying, never to stop sooner than the
    // height check alone would.
    let fontsReady = !document.fonts
    document.fonts?.ready.then(() => {
      fontsReady = true
    })

    // Any real interaction (a manual scroll, or a click/tap — e.g. changing
    // pages right after arriving) means the admin has taken over; forcing
    // our own scrollTo on the next tick after that would fight whatever
    // THEY just did (pagination's own "scroll to top" losing to this
    // re-applying the restored position a beat later) and look like the
    // page randomly refusing to scroll.
    let interrupted = false
    function interrupt() {
      interrupted = true
      restoringScrollRef.current = false
    }
    window.addEventListener('wheel', interrupt, { passive: true })
    window.addEventListener('touchstart', interrupt, { passive: true })
    window.addEventListener('pointerdown', interrupt, { passive: true })

    restoringScrollRef.current = true

    function tick() {
      if (cancelled || interrupted) return
      window.scrollTo(0, y)
      const height = document.body.scrollHeight
      stableChecks = height === lastHeight ? stableChecks + 1 : 0
      lastHeight = height
      elapsedMs += CHECK_MS
      if ((stableChecks >= STABLE_CHECKS_NEEDED && fontsReady) || elapsedMs >= MAX_MS) {
        restoringScrollRef.current = false
        return
      }
      timeoutId = window.setTimeout(tick, CHECK_MS)
    }
    tick()
    return () => {
      cancelled = true
      restoringScrollRef.current = false
      window.clearTimeout(timeoutId)
      window.removeEventListener('wheel', interrupt)
      window.removeEventListener('touchstart', interrupt)
      window.removeEventListener('pointerdown', interrupt)
    }
  }, [loading])

  function handlePageChange(next: number) {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: number, name: string) {
    const ok = await confirm({
      title: `¿Eliminar "${name}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteProduct(id)
    setProducts((prev) => prev.filter((p) => p.id !== id))
    toast(`"${name}" se eliminó con éxito`)
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  function toggleSelectAll(ids: number[]) {
    setSelectedIds((prev) => (ids.every((id) => prev.includes(id)) ? [] : ids))
  }

  async function handleApplyDiscount() {
    if (selectedIds.length === 0 || !discountType || !discountValue) return
    setApplying(true)
    try {
      const updated = await api.bulkUpdateDiscount(selectedIds, discountType, Number(discountValue))
      setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) ?? p))
      setSelectedIds([])
      setDiscountType('')
      setDiscountValue('')
    } finally {
      setApplying(false)
    }
  }

  async function handleClearDiscount() {
    if (selectedIds.length === 0) return
    setApplying(true)
    try {
      const updated = await api.bulkUpdateDiscount(selectedIds, null, null)
      setProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) ?? p))
      setSelectedIds([])
    } finally {
      setApplying(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    const ok = await confirm({
      title: `¿Eliminar ${selectedIds.length} producto(s)?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    setApplying(true)
    try {
      await api.bulkDeleteProducts(selectedIds)
      setProducts((prev) => prev.filter((p) => !selectedIds.includes(p.id)))
      toast(`${selectedIds.length} producto(s) eliminado(s)`)
      setSelectedIds([])
    } finally {
      setApplying(false)
    }
  }

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryId && String(p.category_id) !== categoryId) return false
      if (brandId === NO_BRAND_VALUE) {
        if (p.brand_id != null) return false
      } else if (brandId && String(p.brand_id) !== brandId) {
        return false
      }
      if (sizeFilter && !p.variants.some((v) => v.size === sizeFilter)) return false
      if (neckTypeFilter && p.neck_type !== neckTypeFilter) return false
      if (onlyNew && !p.is_new) return false
      if (onlyBestseller && !p.is_bestseller) return false
      if (onlyDiscounted && getProductPriceInfo(p).type !== 'discount') return false
      if (onlyLowStock) {
        const stock = totalStockOf(p)
        if (!(stock > 0 && stock <= lowStockThreshold)) return false
      }
      if (onlyOutOfStock && totalStockOf(p) !== 0) return false
      if (!term) return true
      const haystack = [p.name, p.brand_name ?? '', ...p.variants.map((v) => v.barcode)].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [
    products,
    search,
    categoryId,
    brandId,
    sizeFilter,
    neckTypeFilter,
    onlyNew,
    onlyBestseller,
    onlyDiscounted,
    onlyLowStock,
    onlyOutOfStock,
    lowStockThreshold,
  ])

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  // The Cuello redondo/Tipo polo filter only makes sense while actually
  // looking at Playeras (neck_type is null for every other category) —
  // clearing it when leaving keeps it from silently staying active and
  // filtering a different category with no visible pill to explain why.
  const playerasCategoryId = categories.find((c) => c.slug === 'playeras')?.id
  const isPlayerasSelected = playerasCategoryId != null && categoryId === String(playerasCategoryId)

  function handleCategoryChange(value: string) {
    setCategoryId(value)
    if (playerasCategoryId == null || value !== String(playerasCategoryId)) setNeckTypeFilter('')
    setPage(1)
  }

  function handleBrandChange(value: string) {
    setBrandId(value)
    setPage(1)
  }

  function handleSizeChange(value: string) {
    setSizeFilter(value)
    setPage(1)
  }

  // Click-to-toggle, same as the per-product switch in ProductEditor —
  // clicking the already-active one clears it back to "todas."
  function handleNeckTypeChange(value: NeckType) {
    setNeckTypeFilter((prev) => (prev === value ? '' : value))
    setPage(1)
  }

  function toggleBooleanFilter(setter: (updater: (prev: boolean) => boolean) => void) {
    setter((prev) => !prev)
    setPage(1)
  }

  const hasActiveFilters =
    !!search ||
    !!categoryId ||
    !!brandId ||
    !!sizeFilter ||
    !!neckTypeFilter ||
    onlyNew ||
    onlyBestseller ||
    onlyDiscounted ||
    onlyLowStock ||
    onlyOutOfStock

  function handleClearFilters() {
    setSearch('')
    setCategoryId('')
    setBrandId('')
    setSizeFilter('')
    setNeckTypeFilter('')
    setOnlyNew(false)
    setOnlyBestseller(false)
    setOnlyDiscounted(false)
    setOnlyLowStock(false)
    setOnlyOutOfStock(false)
    setPage(1)
  }

  return (
    <div className="page-block">
      <div className="page-block__header">
        <h1>Productos</h1>
        <Link to="/productos/nuevo" className="btn btn--accent">
          + Nuevo producto
        </Link>
      </div>

      <div className="products-toolbar">
        <div className="search-field">
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder="Buscar por nombre, marca o código de barras…"
          />
          {search && (
            <button type="button" className="icon-btn search-field__clear" onClick={() => handleSearchChange('')} aria-label="Borrar búsqueda">
              <CloseIcon width={14} height={14} />
            </button>
          )}
        </div>
        <select className="category-select" value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="category-select" value={brandId} onChange={(e) => handleBrandChange(e.target.value)}>
          <option value="">Todas las marcas</option>
          <option value={NO_BRAND_VALUE}>Sin marca</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="category-select" value={sizeFilter} onChange={(e) => handleSizeChange(e.target.value)}>
          <option value="">Todas las tallas</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="products-toolbar__checks">
        <button
          type="button"
          className={`filter-check-pill ${onlyNew ? 'filter-check-pill--active' : ''}`}
          onClick={() => toggleBooleanFilter(setOnlyNew)}
        >
          {onlyNew ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
          <StarIcon width={14} height={14} fill="currentColor" style={{ color: 'var(--blue)' }} />
          <span>Nuevo</span>
        </button>
        <button
          type="button"
          className={`filter-check-pill ${onlyBestseller ? 'filter-check-pill--active' : ''}`}
          onClick={() => toggleBooleanFilter(setOnlyBestseller)}
        >
          {onlyBestseller ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
          <FlameIcon width={14} height={14} fill="currentColor" style={{ color: 'var(--amber)' }} />
          <span>Más vendido</span>
        </button>
        <button
          type="button"
          className={`filter-check-pill ${onlyDiscounted ? 'filter-check-pill--active' : ''}`}
          onClick={() => toggleBooleanFilter(setOnlyDiscounted)}
        >
          {onlyDiscounted ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
          <PercentIcon width={14} height={14} fill="currentColor" style={{ color: 'var(--pink)' }} />
          <span>Descuento</span>
        </button>
        <button
          type="button"
          className={`filter-check-pill ${onlyLowStock ? 'filter-check-pill--active' : ''}`}
          onClick={() => toggleBooleanFilter(setOnlyLowStock)}
        >
          {onlyLowStock ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
          <WarningIcon width={14} height={14} fill="currentColor" style={{ color: 'var(--amber)' }} />
          <span>Bajo en stock</span>
        </button>
        <button
          type="button"
          className={`filter-check-pill ${onlyOutOfStock ? 'filter-check-pill--active' : ''}`}
          onClick={() => toggleBooleanFilter(setOnlyOutOfStock)}
        >
          {onlyOutOfStock ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
          <NoStockIcon width={14} height={14} fill="currentColor" style={{ color: 'var(--red)' }} />
          <span>Agotados</span>
        </button>
        {isPlayerasSelected && (
          <>
            <button
              type="button"
              className={`filter-check-pill ${neckTypeFilter === 'redondo' ? 'filter-check-pill--active' : ''}`}
              onClick={() => handleNeckTypeChange('redondo')}
            >
              {neckTypeFilter === 'redondo' ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
              <ShirtIcon width={14} height={14} style={{ color: 'var(--blue)' }} />
              <span>Cuello redondo</span>
            </button>
            <button
              type="button"
              className={`filter-check-pill ${neckTypeFilter === 'polo' ? 'filter-check-pill--active' : ''}`}
              onClick={() => handleNeckTypeChange('polo')}
            >
              {neckTypeFilter === 'polo' ? <CheckSquareIcon width={16} height={16} /> : <SquareIcon width={16} height={16} />}
              <ShirtIcon width={14} height={14} style={{ color: 'var(--green)' }} />
              <span>Tipo polo</span>
            </button>
          </>
        )}
        {hasActiveFilters && (
          <button type="button" className="tag tag--clear-filters" onClick={handleClearFilters}>
            Borrar filtros
          </button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="bulk-toolbar">
          <span>{selectedIds.length} seleccionado(s)</span>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType | '')}>
            <option value="">Tipo de descuento…</option>
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed_price">Precio fijo</option>
            <option value="amount_off">Monto a restar</option>
          </select>
          {discountType && (
            <input
              type="number" inputMode="decimal"
              step="0.01"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percent' ? 'Ej. 20' : '0.00'}
              className="bulk-toolbar__input"
            />
          )}
          <button
            type="button"
            className="btn btn--accent btn--sm"
            disabled={!discountType || !discountValue || applying}
            onClick={handleApplyDiscount}
          >
            Aplicar descuento
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={applying} onClick={handleClearDiscount}>
            Quitar descuento
          </button>
          <button type="button" className="btn btn--danger btn--sm" disabled={applying} onClick={handleBulkDelete}>
            Eliminar seleccionados
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedIds([])}>
            Cancelar selección
          </button>
        </div>
      )}

      {loading && <TableSkeleton columns={8} />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrap">
          {filteredProducts.length > 0 && (
            <PaginationBar
              total={filteredProducts.length}
              currentPage={currentPage}
              pageCount={pageCount}
              onChange={handlePageChange}
              position="top"
            />
          )}
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => toggleSelectAll(filteredProducts.map((p) => p.id))}
                    aria-label="Seleccionar todos"
                  >
                    {filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.includes(p.id)) ? (
                      <CheckSquareIcon />
                    ) : (
                      <SquareIcon />
                    )}
                  </button>
                </th>
                <th></th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p) => {
                const totalStock = totalStockOf(p)
                const hasOutOfStockVariant = p.variants.some((v) => v.stock === 0)
                const priceInfo = getProductPriceInfo(p)
                return (
                  <tr
                    key={p.id}
                    className="admin-table__row--clickable"
                    onClick={() => navigate(`/productos/${p.id}`)}
                  >
                    <td className="admin-table__cell--select">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(p.id)
                        }}
                        aria-label="Seleccionar"
                      >
                        {selectedIds.includes(p.id) ? <CheckSquareIcon /> : <SquareIcon />}
                      </button>
                    </td>
                    <td className="admin-table__cell--media">
                      {p.main_image_url ? (
                        <button
                          type="button"
                          className="admin-table__thumb-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewerImages(productGallery(p))
                          }}
                          aria-label="Ver imagen en grande"
                        >
                          <img src={p.main_image_url} alt="" className="admin-table__thumb" />
                        </button>
                      ) : (
                        <div className="admin-table__thumb admin-table__thumb--empty" />
                      )}
                    </td>
                    <td className="admin-table__cell--title">
                      <Link to={`/productos/${p.id}`} className="admin-table__name" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
                        {p.name}
                      </Link>
                      {/* No stopPropagation here on purpose — this div (and
                          the plain, non-interactive tag spans inside it)
                          used to swallow every click below the name with
                          nothing to actually do with it, since the row's
                          own onClick never got the chance to fire. Only
                          CollectionTag's own real link/button needs its
                          clicks isolated (handled inside it). */}
                      <div className="admin-table__badges">
                        {!!p.is_new && <span className="tag">Nuevo</span>}
                        {!!p.is_bestseller && <span className="tag">Más vendido</span>}
                        {priceInfo.type === 'discount' && <span className="tag tag--discount">Descuento</span>}
                        {p.collections.length > 0 && <CollectionTag collections={p.collections} />}
                      </div>
                    </td>
                    <td data-label="Categoría">{p.category_name ?? '—'}</td>
                    <td data-label="Precio">
                      {priceInfo.type === 'discount' ? (
                        <>
                          <span className="admin-table__price-discounted">{formatPrice(priceInfo.price)}</span>
                          <span className="admin-table__price-was">{formatPrice(p.price)}</span>
                        </>
                      ) : (
                        formatPrice(p.price)
                      )}
                    </td>
                    <td data-label="Stock total">{totalStock}</td>
                    <td data-label="Estado">
                      {totalStock === 0 ? (
                        <span className="tag tag--outofstock">Agotado</span>
                      ) : (
                        <>
                          <span className={`tag ${p.is_active ? 'tag--active' : 'tag--inactive'}`}>
                            {p.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                          {totalStock <= lowStockThreshold && <span className="tag tag--lowstock">Bajo stock</span>}
                          {totalStock > lowStockThreshold && hasOutOfStockVariant && (
                            <span className="tag tag--lowstock" title="Al menos una talla/color está agotado">
                              Checar stock
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/productos/${p.id}`} className="btn btn--ghost btn--sm">
                        Editar
                      </Link>
                      <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(p.id, p.name)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <p className="state-msg">
              {products.length === 0 ? 'Aún no hay productos.' : 'Ningún producto coincide con la búsqueda.'}
            </p>
          )}

          {filteredProducts.length > 0 && (
            <PaginationBar total={filteredProducts.length} currentPage={currentPage} pageCount={pageCount} onChange={handlePageChange} />
          )}
        </div>
      )}

      {viewerImages && viewerImages.length > 0 && (
        <ImageLightbox images={viewerImages} initialIndex={0} onClose={() => setViewerImages(null)} />
      )}
    </div>
  )
}

function CollectionTag({ collections }: { collections: ProductCollectionMembership[] }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (collections.length === 1) {
    return (
      <Link
        to={`/colecciones#collection-${collections[0].id}`}
        className="tag tag--collection tag--collection-link"
        onClick={(e) => e.stopPropagation()}
      >
        {collections[0].name}
      </Link>
    )
  }

  return (
    <div className="collection-tag-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="tag tag--collection tag--collection-link"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {collections.length} colecciones
      </button>
      {open && (
        <div className="collection-tag-menu">
          {collections.map((c) => (
            <Link key={c.id} to={`/colecciones#collection-${c.id}`} onClick={() => setOpen(false)}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

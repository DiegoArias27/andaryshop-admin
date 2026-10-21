import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Brand, Category, Collection, DiscountType, Product, ProductCollectionMembership } from '../api/types'
import { formatPrice } from '../utils/currency'
import { getProductPriceInfo } from '../utils/discount'
import {
  CheckSquareIcon,
  FlameIcon,
  NoStockIcon,
  PercentIcon,
  SearchIcon,
  SquareIcon,
  StarIcon,
  WarningIcon,
} from '../components/icons'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { useAppSettings } from '../hooks/useAppSettings'
import LoadingState from '../components/LoadingState'
import ImageLightbox from '../components/ImageLightbox'

function totalStockOf(p: Product): number {
  return p.variants.reduce((sum, v) => sum + v.stock, 0)
}

export default function ProductsList() {
  const settings = useAppSettings()
  const lowStockThreshold = settings?.low_stock_threshold ?? 5
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const [onlyBestseller, setOnlyBestseller] = useState(false)
  const [onlyDiscounted, setOnlyDiscounted] = useState(false)
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false)
  const [viewerImage, setViewerImage] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [discountType, setDiscountType] = useState<DiscountType | ''>('')
  const [discountValue, setDiscountValue] = useState('')
  const [applying, setApplying] = useState(false)
  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    let ignore = false
    Promise.all([api.getProducts(), api.getCategories(), api.getBrands(), api.getCollections()])
      .then(([productsData, categoriesData, brandsData, collectionsData]) => {
        if (ignore) return
        setProducts(productsData)
        setCategories(categoriesData)
        setBrands(brandsData)
        setCollections(collectionsData)
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
      if (brandId && String(p.brand_id) !== brandId) return false
      if (collectionId && !p.collections.some((c) => String(c.id) === collectionId)) return false
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
    collectionId,
    onlyNew,
    onlyBestseller,
    onlyDiscounted,
    onlyLowStock,
    onlyOutOfStock,
    lowStockThreshold,
  ])

  // "Colecciones" here means real, hand-picked product lists — not a
  // wholesale/bundle/combo rule that just happens to reference some products
  // (those aren't a browsable "this collection's products" list the way a
  // curated one is).
  const curatedCollections = useMemo(() => collections.filter((c) => c.pricing_mode === 'none'), [collections])

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleCategoryChange(value: string) {
    setCategoryId(value)
    setPage(1)
  }

  function handleBrandChange(value: string) {
    setBrandId(value)
    setPage(1)
  }

  function handleCollectionChange(value: string) {
    setCollectionId(value)
    setPage(1)
  }

  function toggleBooleanFilter(setter: (updater: (prev: boolean) => boolean) => void) {
    setter((prev) => !prev)
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
            placeholder="Buscar por nombre, marca o código de barras…"
          />
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
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="category-select" value={collectionId} onChange={(e) => handleCollectionChange(e.target.value)}>
          <option value="">Todas las colecciones</option>
          {curatedCollections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
              type="number"
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

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrap">
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
                  <tr key={p.id}>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => toggleSelect(p.id)}
                        aria-label="Seleccionar"
                      >
                        {selectedIds.includes(p.id) ? <CheckSquareIcon /> : <SquareIcon />}
                      </button>
                    </td>
                    <td>
                      {p.main_image_url ? (
                        <button
                          type="button"
                          className="admin-table__thumb-btn"
                          onClick={() => setViewerImage(p.main_image_url)}
                          aria-label="Ver imagen en grande"
                        >
                          <img src={p.main_image_url} alt="" className="admin-table__thumb" />
                        </button>
                      ) : (
                        <div className="admin-table__thumb admin-table__thumb--empty" />
                      )}
                    </td>
                    <td>
                      <Link to={`/productos/${p.id}`} className="admin-table__name">
                        {p.name}
                      </Link>
                      <div className="admin-table__badges">
                        {!!p.is_new && <span className="tag">Nuevo</span>}
                        {!!p.is_bestseller && <span className="tag">Más vendido</span>}
                        {priceInfo.type === 'discount' && <span className="tag tag--discount">Descuento</span>}
                        {p.collections.length > 0 && <CollectionTag collections={p.collections} />}
                      </div>
                    </td>
                    <td>{p.category_name ?? '—'}</td>
                    <td>
                      {priceInfo.type === 'discount' ? (
                        <>
                          <span className="admin-table__price-discounted">{formatPrice(priceInfo.price)}</span>
                          <span className="admin-table__price-was">{formatPrice(p.price)}</span>
                        </>
                      ) : (
                        formatPrice(p.price)
                      )}
                    </td>
                    <td>{totalStock}</td>
                    <td>
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
                    <td className="admin-table__actions">
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
            <div className="pagination">
              <span className="pagination__info">
                {filteredProducts.length} producto(s) · página {currentPage} de {pageCount}
              </span>
              <div className="pagination__controls">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {viewerImage && (
        <ImageLightbox images={[{ url: viewerImage }]} initialIndex={0} onClose={() => setViewerImage(null)} />
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
      <Link to={`/colecciones#collection-${collections[0].id}`} className="tag tag--collection tag--collection-link">
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

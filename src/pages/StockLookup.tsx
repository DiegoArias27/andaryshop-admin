import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import ImageLightbox from '../components/ImageLightbox'
import { api } from '../api/client'
import type { Collection, Customer, PaymentMethod, Product, ProductVariant, VariantByBarcode, WholesaleTier } from '../api/types'
import type { SaleLine } from '../context/pos-session-context'
import { usePosSession } from '../hooks/usePosSession'
import {
  BarcodeIcon,
  CardIcon,
  CartIcon,
  CashIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  GiftIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  SettingsIcon,
  TransferIcon,
  TrashIcon,
  UploadCloudIcon,
} from '../components/icons'
import { getProductPriceInfo } from '../utils/discount'
import { priceCart, type PricingCartItem } from '../utils/pricing'
import { formatPrice } from '../utils/currency'
import { printBarcodeLabels, DEFAULT_LABEL_SIZE } from '../utils/labels'
import { useToast } from '../hooks/useToast'
import { useAppSettings } from '../hooks/useAppSettings'

const AUTO_SEARCH_MIN_LENGTH = 3
const AUTO_SEARCH_DEBOUNCE_MS = 300
// Real sale/restock quantities are small; a barcode scanner firing into a
// quantity field by mistake (focus left there) produces a much longer
// string — treat anything past this length as a misdirected scan.
const QTY_MAX_DIGITS = 5

function stockClass(stock: number, lowStockThreshold: number): string {
  if (stock === 0) return 'stock-flag--out'
  if (stock <= lowStockThreshold) return 'stock-flag--low'
  return ''
}

function stockChipLabel(stock: number, lowStockThreshold: number): string {
  if (stock === 0) return 'Sin stock'
  if (stock <= lowStockThreshold) return `Quedan ${stock}`
  return ''
}

/** A short, recognizable label for a held sale — "100 Playera Lacoste, 1
 * Gorra LA" — instead of just the first line's name, so several sales on
 * hold at once are actually tellable apart in the floating widget. */
function summarizeSaleLines(lines: SaleLine[]): string {
  const byName = new Map<string, number>()
  for (const l of lines) byName.set(l.name, (byName.get(l.name) ?? 0) + l.quantity)
  const parts = Array.from(byName.entries()).map(([name, qty]) => `${qty} ${name}`)
  if (parts.length === 0) return 'Venta'
  if (parts.length <= 2) return parts.join(', ')
  return `${parts.slice(0, 2).join(', ')} +${parts.length - 2} más`
}

export default function StockLookup() {
  const [mode, setMode] = useState<'scan' | 'search'>('scan')
  const [barcode, setBarcode] = useState('')
  const [result, setResult] = useState<VariantByBarcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [restockMode, setRestockMode] = useState(false)
  const [surtirQty, setSurtirQty] = useState('')
  // Independent of surtirQty — printing 5 labels for a restock of 20 units
  // (or vice versa) is a normal, separate decision.
  const [labelQty, setLabelQty] = useState('1')
  const settings = useAppSettings()
  const labelSize = settings
    ? { widthMm: settings.label_width_mm, heightMm: settings.label_height_mm }
    : DEFAULT_LABEL_SIZE
  const lowStockThreshold = settings?.low_stock_threshold ?? 5
  const { holdSale, pendingResume, clearPendingResume } = usePosSession()
  const [restocking, setRestocking] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  // Fetched once so the sale can price wholesale/bundle/unit/combo
  // collections the same way the storefront cart does (pooled across every
  // matching line), instead of pricing each scanned item in isolation.
  const [pricingCollections, setPricingCollections] = useState<Collection[]>([])
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [filterNew, setFilterNew] = useState(false)
  const [filterBestseller, setFilterBestseller] = useState(false)
  const [filterDiscount, setFilterDiscount] = useState(false)
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(new Set())
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [showSizes, setShowSizes] = useState(false)
  const [saleLines, setSaleLines] = useState<SaleLine[]>([])
  // Which line (if any) currently has the "regalar N unidades" inline input
  // open — only one at a time, closed again on confirm (see splitGiftUnits).
  const [giftSplitKey, setGiftSplitKey] = useState<string | null>(null)
  const [giftSplitQty, setGiftSplitQty] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([])
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  // A cashier-typed final total, standing in for the auto-computed one —
  // reset the moment the cart changes again so it can never keep charging a
  // stale amount that no longer matches what's actually in the sale.
  const [totalOverride, setTotalOverride] = useState<number | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [completingSale, setCompletingSale] = useState(false)
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  function reloadProducts() {
    api
      .getProducts()
      .then(setAllProducts)
      .catch(() => {})
  }

  useEffect(() => {
    reloadProducts()
    api.getCollections().then(setPricingCollections).catch(() => {})
    api.getWholesaleTiers().then(setWholesaleTiers).catch(() => {})
  }, [])

  useEffect(() => {
    if (mode === 'scan') inputRef.current?.focus()
    else searchInputRef.current?.focus()
  }, [mode])

  // A physical barcode scanner just "types" into whatever element currently
  // has focus — so in Escáner mode, clicking anything else (a button, a
  // dropdown, a filter) must not permanently steal focus away from the
  // scan input, or the next scan silently goes nowhere. Runs only in scan
  // mode, and skips clicks that land on a genuine text-entry element (an
  // input/textarea/select the admin is deliberately using, like a note or a
  // discount field) so it never yanks focus away from something they're
  // actively typing into.
  useEffect(() => {
    if (mode !== 'scan') return
    function handleDocumentMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [mode])

  // Keeps the "Último artículo detectado" card in view — in search mode the
  // results list can push it well below the fold, so once a size/variant is
  // picked (or a barcode is scanned) it scrolls into view automatically.
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  // Shared by both discovery paths — a real barcode scan (doSearch, below)
  // and a search-mode pick resolved entirely from already-loaded data
  // (pickLocal) — so a product with no barcode assigned yet still works
  // fine from search, and neither path duplicates the sale/restock logic.
  function handleDetected(data: VariantByBarcode) {
    setResult(data)
    // Outside Reabastecer mode, every detected item goes straight into the
    // sale — no separate "Agregar" click. Detecting the same variant again
    // just stacks another unit onto that line.
    if (!restockMode) {
      const product = allProducts.find((p) => p.id === data.product_id)
      if (product) {
        addLineToSale(
          {
            key: `v${data.id}`,
            productId: data.product_id,
            variantId: data.id,
            name: data.product_name,
            size: data.size,
            colorName: data.color_name,
            colorHex: data.color_hex,
            image: data.main_image_url,
            unitPrice: parseFloat(product.price),
          },
          1
        )
        toast(`Se agregó 1 × ${data.product_name} a la venta`)
      } else {
        toast('Producto detectado pero aún no cargado — inténtalo de nuevo', 'error')
      }
    }
  }

  function buildVariantResult(product: Product, variant: ProductVariant): VariantByBarcode {
    return {
      id: variant.id,
      product_id: product.id,
      size: variant.size,
      color_name: variant.color_name,
      color_hex: variant.color_hex,
      barcode: variant.barcode,
      stock: variant.stock,
      product_name: product.name,
      product_slug: product.slug,
      main_image_url: product.main_image_url,
    }
  }

  // Search mode already has the full product/variant in memory — resolving
  // locally (instead of round-tripping through getVariantByBarcode) means a
  // product with no barcode assigned yet still works fine from search; only
  // an actual barcode scan needs the API lookup below.
  function pickLocal(product: Product, variant: ProductVariant) {
    setError(null)
    handleDetected(buildVariantResult(product, variant))
    setSearchQuery('')
    setExpandedProductId(null)
  }

  async function doSearch(code: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getVariantByBarcode(code)
      handleDetected(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se encontró ese código de barras')
    } finally {
      setLoading(false)
      // Always clear so the next scan can start typing straight away — the
      // result above stays on screen until a new scan replaces it. Surtir is
      // cleared too: otherwise a leftover digit sitting there gets
      // prepended to the next scan (if focus is still in that field) and
      // the combined text never matches a real barcode.
      setBarcode('')
      setSurtirQty('')
      inputRef.current?.focus()
    }
  }

  // Auto-searches once typing settles, so scanning a barcode (or typing one
  // by hand) never needs Enter or a "Buscar" button.
  useEffect(() => {
    const trimmed = barcode.trim()
    if (trimmed.length < AUTO_SEARCH_MIN_LENGTH) return
    const timer = window.setTimeout(() => doSearch(trimmed), AUTO_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode])

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = barcode.trim()
    if (!trimmed) return
    doSearch(trimmed)
  }

  // A physical scanner always ends a scan with an Enter keystroke — firing
  // the search right on that keydown (instead of only via the debounced
  // effect above) makes the lookup deterministic regardless of code length
  // or how fast the scan typed, rather than depending on the effect's timer
  // outrunning whatever comes next. preventDefault stops the wrapping
  // form's own native submit from ALSO firing for the same Enter press,
  // which would otherwise double up the search.
  function handleBarcodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = barcode.trim()
    if (!trimmed) return
    doSearch(trimmed)
  }

  // After finishing with a product the admin is ready to look up the next
  // one — scroll back to the top of the page and clear the search box so
  // it's ready for a fresh lookup.
  function resetForNextLookup() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setSearchQuery('')
    setExpandedProductId(null)
    if (mode === 'scan') inputRef.current?.focus()
    else searchInputRef.current?.focus()
  }

  function handleCloseResult() {
    setResult(null)
    setSurtirQty('')
    setShowSizes(false)
    resetForNextLookup()
  }

  const resultProduct = result ? allProducts.find((p) => p.id === result.product_id) : undefined

  function addLineToSale(input: Omit<SaleLine, 'quantity' | 'isGift' | 'overridePrice' | 'discountAmount'>, qty: number) {
    setSaleLines((prev) => {
      // Match by variant (falling back to the raw key for lines with no
      // variantId) rather than by key alone — a gift-flagged line must never
      // silently absorb a fresh scan of the same item, or those new units
      // would come out free too instead of ringing up as a normal sale.
      const matchesVariant = (l: SaleLine) => (input.variantId != null ? l.variantId === input.variantId : l.key === input.key)
      const idx = prev.findIndex((l) => matchesVariant(l) && !l.isGift)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty }
        return next
      }
      const existingCount = prev.filter(matchesVariant).length
      const key = existingCount > 0 ? `${input.key}-${existingCount}` : input.key
      return [...prev, { ...input, key, quantity: qty, isGift: false, overridePrice: null, discountAmount: 0 }]
    })
  }

  function handlePrintLabels() {
    if (!result) return
    const qty = Math.max(1, Number(labelQty) || 1)
    printBarcodeLabels(
      [
        {
          barcode: result.barcode,
          title: result.product_name,
          subtitle: `${result.color_name} · Talla ${result.size}`,
          copies: qty,
        },
      ],
      labelSize
    )
  }


  async function handleRestock() {
    if (!result) return
    const qty = Number(surtirQty) || 0
    if (qty <= 0) return
    setRestocking(true)
    try {
      const updated = await api.adjustStock(result.barcode, { delta: qty })
      setResult((prev) => (prev ? { ...prev, stock: updated.stock } : prev))
      setSurtirQty('')
      reloadProducts()
      toast(`Se surtieron ${qty} unidades — stock actual: ${updated.stock}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al actualizar el inventario', 'error')
    } finally {
      setRestocking(false)
      resetForNextLookup()
    }
  }

  // A barcode scanner just "types" into whatever field is focused. If the
  // admin left focus in a quantity field and then scans, redirect the
  // scanned value to the barcode field instead of leaving it stuck there.
  function handleQtyChange(value: string, setQty: (v: string) => void) {
    if (value.length > QTY_MAX_DIGITS) {
      setQty('')
      setBarcode(value)
      inputRef.current?.focus()
      return
    }
    setQty(value)
  }

  const categoryOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of allProducts) {
      if (p.category_id != null && p.category_name) map.set(p.category_id, p.category_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allProducts])

  const brandOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of allProducts) {
      if (p.brand_id != null && p.brand_name) map.set(p.brand_id, p.brand_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allProducts])

  const collectionOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of allProducts) {
      // Only real, hand-picked product lists — a wholesale/bundle/combo rule
      // that just happens to reference products isn't a browsable "these
      // are the products in this collection" filter.
      for (const c of p.collections) if (c.pricing_mode === 'none') map.set(c.id, c.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allProducts])

  const sizeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of allProducts) {
      for (const v of p.variants) set.add(v.size)
    }
    return Array.from(set).sort()
  }, [allProducts])

  const normalizedQuery = searchQuery.trim().toLowerCase()
  // Filter-driven searches (collection/brand/category/talla/nuevo/más
  // vendido/con descuento) can match many products at once, so they get a
  // bulk-select mode; a plain name search stays a simple single-pick lookup.
  const filtersActive =
    !!categoryFilter || !!brandFilter || !!collectionFilter || !!sizeFilter || filterNew || filterBestseller || filterDiscount
  const hasActiveSearch = normalizedQuery.length > 0 || filtersActive

  const searchResults = hasActiveSearch
    ? allProducts
        .filter((p) => {
          if (!p.is_active) return false
          if (categoryFilter && String(p.category_id) !== categoryFilter) return false
          if (brandFilter && String(p.brand_id) !== brandFilter) return false
          if (collectionFilter && !p.collections.some((c) => String(c.id) === collectionFilter)) return false
          if (sizeFilter && !p.variants.some((v) => v.size === sizeFilter)) return false
          if (filterNew && !p.is_new) return false
          if (filterBestseller && !p.is_bestseller) return false
          if (filterDiscount && getProductPriceInfo(p).type !== 'discount') return false
          if (!normalizedQuery) return true
          return p.name.toLowerCase().includes(normalizedQuery)
        })
        .slice(0, 25)
    : []

  // Flattens the results list (plus any expanded product's variant chips)
  // into one keyboard-navigable sequence, so ↑/↓ + Enter can move through
  // multi-variant products the same way clicking through them would.
  const selectableEntries = useMemo(() => {
    const entries: { key: string; onSelect: () => void }[] = []
    for (const p of searchResults) {
      entries.push({ key: `p-${p.id}`, onSelect: () => handlePickProduct(p) })
      if (p.variants.length > 1 && expandedProductId === p.id) {
        for (const v of p.variants) {
          entries.push({ key: `v-${v.id}`, onSelect: () => handlePickVariant(p, v) })
        }
      }
    }
    return entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, expandedProductId])

  // A new query/filter invalidates whatever was highlighted before.
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery, categoryFilter, brandFilter, collectionFilter, sizeFilter, filterNew, filterBestseller, filterDiscount])

  useEffect(() => {
    if (highlightedIndex < 0) return
    const key = selectableEntries[highlightedIndex]?.key
    if (!key) return
    document.querySelector(`[data-flat-key="${key}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightedIndex, selectableEntries])

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (selectableEntries.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(selectableEntries.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectableEntries[highlightedIndex]?.onSelect()
    }
  }

  function toggleVariantSelection(variantId: number) {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  function handlePickProduct(p: Product) {
    if (p.variants.length === 0) return
    if (bulkMode) {
      if (p.variants.length === 1) {
        toggleVariantSelection(p.variants[0].id)
        return
      }
      setExpandedProductId((prev) => (prev === p.id ? null : p.id))
      return
    }
    if (p.variants.length === 1) {
      pickLocal(p, p.variants[0])
      return
    }
    setExpandedProductId((prev) => (prev === p.id ? null : p.id))
  }

  function handlePickVariant(product: Product, variant: ProductVariant) {
    if (bulkMode) {
      toggleVariantSelection(variant.id)
      return
    }
    pickLocal(product, variant)
  }

  function handlePickResultVariant(variant: ProductVariant) {
    if (!resultProduct) return
    setShowSizes(false)
    pickLocal(resultProduct, variant)
  }

  // The results list scrolls internally (fixed max-height) — when a product
  // near the bottom is expanded, its size chips render below the visible
  // window unless we scroll them into view ourselves.
  useEffect(() => {
    if (expandedProductId === null) return
    const el = document.querySelector(`[data-product-result="${expandedProductId}"]`)
    el?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [expandedProductId])

  function handleToggleBulkMode() {
    setBulkMode((v) => !v)
    setSelectedVariantIds(new Set())
  }

  function findProductAndVariantById(variantId: number): { product: Product; variant: ProductVariant } | null {
    for (const p of allProducts) {
      const v = p.variants.find((v) => v.id === variantId)
      if (v) return { product: p, variant: v }
    }
    return null
  }

  function handleBulkAddToSale() {
    // Defensive — the "Selección múltiple" chip that leads here is already
    // hidden while Reabastecer is active, but this is the one add-to-sale
    // path that doesn't check restockMode on its own, so guard it directly
    // too instead of relying purely on it being unreachable via the UI.
    if (restockMode) return
    if (selectedVariantIds.size === 0) return
    let added = 0
    for (const variantId of selectedVariantIds) {
      const found = findProductAndVariantById(variantId)
      if (!found) continue
      addLineToSale(
        {
          key: `v${found.variant.id}`,
          productId: found.product.id,
          variantId: found.variant.id,
          name: found.product.name,
          size: found.variant.size,
          colorName: found.variant.color_name,
          colorHex: found.variant.color_hex,
          image: found.product.main_image_url,
          unitPrice: parseFloat(found.product.price),
        },
        1
      )
      added++
    }
    setSelectedVariantIds(new Set())
    setBulkMode(false)
    toast(`${added} artículo(s) agregado(s) a la venta`)
  }

  function updateLineQty(key: string, qty: number) {
    setSaleLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.key !== key)
      return prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l))
    })
  }

  function updateLineUnitPrice(key: string, value: string) {
    const price = Math.max(0, Number(value) || 0)
    setSaleLines((prev) => prev.map((l) => (l.key === key ? { ...l, overridePrice: price } : l)))
  }

  function updateLineDiscount(key: string, value: string) {
    const discount = Math.max(0, Number(value) || 0)
    setSaleLines((prev) => prev.map((l) => (l.key === key ? { ...l, discountAmount: discount } : l)))
  }

  function toggleLineGift(key: string) {
    setSaleLines((prev) => prev.map((l) => (l.key === key ? { ...l, isGift: !l.isGift } : l)))
  }

  // Splits `qty` units off an existing line into their own gift line —
  // covers "add 100 shirts, then gift 5 of those same shirts" without the
  // plain "Regalo" checkbox (which only ever flips a WHOLE line) turning all
  // 100 into a giveaway.
  function splitGiftUnits(key: string, qty: number) {
    setSaleLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key)
      if (idx < 0) return prev
      const line = prev[idx]
      const splitQty = Math.min(Math.max(0, Math.floor(qty)), line.quantity)
      if (splitQty <= 0) return prev

      const next = [...prev]
      const remaining = line.quantity - splitQty
      if (remaining <= 0) next.splice(idx, 1)
      else next[idx] = { ...line, quantity: remaining }

      const giftIdx = next.findIndex((l) => l.variantId === line.variantId && l.isGift)
      if (giftIdx >= 0) {
        next[giftIdx] = { ...next[giftIdx], quantity: next[giftIdx].quantity + splitQty }
      } else {
        next.push({ ...line, key: `${line.key}-gift`, quantity: splitQty, isGift: true, discountAmount: 0, overridePrice: null })
      }
      return next
    })
    setGiftSplitKey(null)
    setGiftSplitQty('')
  }

  function removeLine(key: string) {
    setSaleLines((prev) => prev.filter((l) => l.key !== key))
  }

  function clearSale() {
    setSaleLines([])
    setSaleNotes('')
    setTotalOverride(null)
    setPaymentMethod('cash')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setShowCustomerSearch(false)
  }

  // Stashes the current sale away (see PosSessionContext) and clears the
  // screen to start a new one — the floating widget in AdminLayout lets the
  // cashier come back to it later from anywhere in the admin.
  function handleHoldSale() {
    if (saleLines.length === 0) return
    holdSale({
      label: summarizeSaleLines(saleLines),
      saleLines,
      saleNotes,
      paymentMethod,
      totalOverride,
      customer: selectedCustomer,
    })
    clearSale()
    toast('Venta puesta en espera')
  }

  // Latest sale state, kept in a ref for the unmount-cleanup effect below —
  // that effect's closure is only ever created once (empty deps), so without
  // this it would see whatever saleLines/etc looked like on the FIRST
  // render, not what's actually in the cart when the admin navigates away.
  const liveSaleRef = useRef({ saleLines, saleNotes, paymentMethod, totalOverride, selectedCustomer })
  liveSaleRef.current = { saleLines, saleNotes, paymentMethod, totalOverride, selectedCustomer }
  const holdSaleRef = useRef(holdSale)
  holdSaleRef.current = holdSale

  // Stepping away to check something in Productos (or anywhere else) with
  // items already in the sale must never just silently lose them — this
  // mirrors "Poner en espera" but fires automatically on unmount (a route
  // change) instead of needing the cashier to remember to click it. Skips
  // cleanly when the sale was already emptied by completing it, holding it
  // manually, or clearing it — there's nothing left to stash in that case.
  useEffect(() => {
    return () => {
      const live = liveSaleRef.current
      if (live.saleLines.length === 0) return
      holdSaleRef.current({
        label: summarizeSaleLines(live.saleLines),
        saleLines: live.saleLines,
        saleNotes: live.saleNotes,
        paymentMethod: live.paymentMethod,
        totalOverride: live.totalOverride,
        customer: live.selectedCustomer,
      })
    }
  }, [])

  // Debounced customer search for the "Cliente frecuente" picker — same
  // debounce length as the barcode scanner input.
  useEffect(() => {
    const term = customerSearch.trim()
    if (!term) {
      setCustomerOptions([])
      return
    }
    const timer = window.setTimeout(() => {
      api
        .getCustomers(term)
        .then(setCustomerOptions)
        .catch(() => {})
    }, AUTO_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [customerSearch])

  // Any change to the cart invalidates a manually-typed total — otherwise it
  // would keep charging an amount that no longer matches what's in the sale.
  // Skipped exactly once right after resuming a held sale (see the effect
  // below), since THAT saleLines change should keep the total it was held
  // with, not wipe it.
  const skipNextTotalResetRef = useRef(false)
  useEffect(() => {
    if (skipNextTotalResetRef.current) {
      skipNextTotalResetRef.current = false
      return
    }
    setTotalOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleLines])

  // Picks up a sale resumed from the floating "ventas en espera" widget
  // (which can live outside this page entirely, in AdminLayout) — the
  // context stages it as pendingResume since there's no local state on that
  // end to hand it back to directly.
  useEffect(() => {
    if (!pendingResume) return
    skipNextTotalResetRef.current = true
    setSaleLines(pendingResume.saleLines)
    setSaleNotes(pendingResume.saleNotes)
    setPaymentMethod(pendingResume.paymentMethod)
    setTotalOverride(pendingResume.totalOverride)
    setSelectedCustomer(pendingResume.customer)
    clearPendingResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume])

  const productCategories = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const p of allProducts) map.set(p.id, p.category_id ?? null)
    return map
  }, [allProducts])

  // Prices the whole sale in one pass — same engine the storefront cart
  // uses (frontend/src/utils/pricing.ts, mirrored in admin/src/utils/pricing.ts)
  // — so wholesale/bundle/unit/combo collection deals are pooled across
  // every matching line instead of each scanned item being priced alone
  // (which is why they never used to apply here). A line the cashier
  // manually re-priced still contributes its quantity to the pool (so the
  // OTHER lines still qualify correctly) but keeps its own typed price.
  const pricedLineInfo = useMemo(() => {
    const withProduct = saleLines.filter((l): l is SaleLine & { productId: number } => l.productId != null)
    const items: PricingCartItem[] = withProduct.map((l) => ({ productId: l.productId, price: l.unitPrice, quantity: l.quantity }))
    const { pricedItems } = priceCart(items, wholesaleTiers, pricingCollections, new Map(), productCategories)
    const map = new Map<string, { price: number; collectionId: number | null; collectionName: string | null }>()
    withProduct.forEach((l, i) => {
      const priced = pricedItems[i]
      map.set(l.key, {
        price: l.overridePrice ?? priced.effectivePrice,
        collectionId: l.overridePrice == null ? (priced.collectionId ?? null) : null,
        collectionName: l.overridePrice == null ? (priced.collectionName ?? null) : null,
      })
    })
    return map
  }, [saleLines, wholesaleTiers, pricingCollections, productCategories])

  function pricedLine(line: SaleLine): { price: number; collectionId: number | null; collectionName: string | null } {
    return (
      pricedLineInfo.get(line.key) ?? { price: line.overridePrice ?? line.unitPrice, collectionId: null, collectionName: null }
    )
  }

  // Every sale line that actually has a photo, in cart order — what the
  // lightbox browses through when one of them is clicked (see viewerIndex).
  const cartImages = useMemo(
    () => saleLines.filter((l): l is SaleLine & { image: string } => !!l.image).map((l) => ({ url: l.image, label: l.name })),
    [saleLines]
  )

  // The selected "cliente frecuente"'s standing per-unit discount — stacks
  // on top of each line's own collection/override price and manual
  // discount, same rule the backend applies (see createPosSale).
  const loyaltyDiscount = selectedCustomer ? Number(selectedCustomer.discount_amount) || 0 : 0

  // The auto-computed total, honoring each line's collection/override price
  // AND its own per-unit discount — what the cashier would see before
  // touching the total field by hand.
  const computedTotal = saleLines.reduce(
    (sum, l) =>
      l.isGift ? sum : sum + Math.max(0, pricedLine(l).price - l.discountAmount - loyaltyDiscount) * l.quantity,
    0
  )
  // A manually-typed total wins over the computed one — the gap between the
  // two becomes the sale's own flat discount_amount on submit (see
  // handleCompleteSale), same mechanism a "cliente frecuente" order uses.
  const saleTotal = totalOverride ?? computedTotal

  async function handleCompleteSale() {
    if (saleLines.length === 0) return
    setCompletingSale(true)
    try {
      const order = await api.createPosSale({
        items: saleLines.map((l) => {
          const priced = pricedLine(l)
          return {
            productId: l.productId,
            variantId: l.variantId,
            name: l.name,
            size: l.size,
            colorName: l.colorName,
            image: l.image,
            unitPrice: priced.price,
            quantity: l.quantity,
            collectionId: priced.collectionId,
            collectionName: priced.collectionName,
            discountAmount: l.discountAmount,
            isGift: l.isGift,
          }
        }),
        notes: saleNotes.trim() || null,
        // A manually-typed total becomes the sale's own flat discount — the
        // gap between what the lines/quantities would normally add up to
        // and what the cashier actually typed (negative if they typed MORE,
        // which correctly reads back as a surcharge instead of a discount).
        discountAmount: totalOverride != null ? computedTotal - totalOverride : 0,
        paymentMethod,
        customerId: selectedCustomer?.id ?? null,
      })
      toast(`Venta #${order.id} completada — ${formatPrice(saleTotal)}`)
      clearSale()
      reloadProducts()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al completar la venta', 'error')
    } finally {
      setCompletingSale(false)
    }
  }

  return (
    <div className="page-block">
      <h1>Punto de venta</h1>
      <p className="page-block__hint">
        Escanea o busca un producto y se agrega solo a la venta actual — presiona "Completar venta" para cobrarla y
        descontar el stock al instante (queda registrada en Ventas). Activa "Reabastecer" para recibir mercancía
        nueva e imprimir sus etiquetas en vez de vender.
      </p>

      <div className="scanner-header">
        <span className="scanner-header__dot" />
        <span className="scanner-header__label">
          {restockMode ? 'Modo reabastecer activo' : mode === 'scan' ? 'Modo escáner activo' : 'Modo búsqueda activo'}
        </span>
        <div className="scanner-mode-toggle">
          <button
            type="button"
            className={`scanner-mode-toggle__btn ${mode === 'scan' ? 'scanner-mode-toggle__btn--active' : ''}`}
            onClick={() => setMode('scan')}
          >
            <BarcodeIcon /> Escáner
          </button>
          <button
            type="button"
            className={`scanner-mode-toggle__btn ${mode === 'search' ? 'scanner-mode-toggle__btn--active' : ''}`}
            onClick={() => setMode('search')}
          >
            <SearchIcon /> Búsqueda
          </button>
          <span className="scanner-mode-toggle__divider" />
          <button
            type="button"
            className={`scanner-mode-toggle__btn scanner-mode-toggle__btn--switch ${restockMode ? 'scanner-mode-toggle__btn--active' : ''}`}
            onClick={() => {
              setRestockMode((v) => !v)
              setBulkMode(false)
              setSelectedVariantIds(new Set())
            }}
          >
            <UploadCloudIcon /> Reabastecer
          </button>
        </div>
      </div>

      <div className="pos-lookup-row">
      <div className="pos-lookup-row__main">
      {mode === 'scan' ? (
        <form className="barcode-form" onSubmit={handleSearchSubmit}>
          <BarcodeIcon />
          <input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={handleBarcodeKeyDown}
            placeholder="Escanear código de barras…"
            autoFocus
          />
          {loading && <span className="barcode-form__status">Buscando…</span>}
        </form>
      ) : (
        <div className="scanner-search">
          <div className="scanner-search__search-row">
            <div className="barcode-form">
              <SearchIcon />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar producto por nombre…"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  className="barcode-form__clear"
                  onClick={() => {
                    setSearchQuery('')
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Borrar búsqueda"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <select className="scanner-search__size-select" value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
              <option value="">Talla (todas)</option>
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="scanner-search__menus">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Categoría (todas)</option>
              {categoryOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="">Marca (todas)</option>
              {brandOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
              <option value="">Colección (todas)</option>
              {collectionOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="scanner-search__filters">
            <button
              type="button"
              className={`chip-filter ${filterNew ? 'chip-filter--active' : ''}`}
              onClick={() => setFilterNew((v) => !v)}
            >
              Nuevo
            </button>
            <button
              type="button"
              className={`chip-filter ${filterBestseller ? 'chip-filter--active' : ''}`}
              onClick={() => setFilterBestseller((v) => !v)}
            >
              Más vendido
            </button>
            <button
              type="button"
              className={`chip-filter ${filterDiscount ? 'chip-filter--active' : ''}`}
              onClick={() => setFilterDiscount((v) => !v)}
            >
              Con descuento
            </button>
            {filtersActive && !restockMode && (
              <button
                type="button"
                className={`chip-filter ${bulkMode ? 'chip-filter--active' : ''}`}
                onClick={handleToggleBulkMode}
              >
                {bulkMode ? 'Cancelar selección múltiple' : 'Selección múltiple'}
              </button>
            )}
          </div>

          <div className="scanner-search__results">
            {searchResults.map((p) => {
              const singleSelected = bulkMode && p.variants.length === 1 && selectedVariantIds.has(p.variants[0].id)
              const isProductHighlighted = selectableEntries[highlightedIndex]?.key === `p-${p.id}`
              return (
                <div key={p.id} className="scanner-search__result" data-product-result={p.id}>
                  <button
                    type="button"
                    data-flat-key={`p-${p.id}`}
                    className={`scanner-search__result-main ${singleSelected ? 'scanner-search__result-main--selected' : ''} ${isProductHighlighted ? 'scanner-search__result-main--highlighted' : ''}`}
                    onClick={() => handlePickProduct(p)}
                  >
                    {bulkMode && p.variants.length === 1 && (
                      <span className={`scanner-search__checkbox ${singleSelected ? 'scanner-search__checkbox--checked' : ''}`} />
                    )}
                    {p.main_image_url ? (
                      <img src={p.main_image_url} alt="" />
                    ) : (
                      <div className="scanner-search__result-thumb-empty" />
                    )}
                    <div className="scanner-search__result-body">
                      <strong>{p.name}</strong>
                      <span>
                        {p.category_name ?? 'Sin categoría'}
                        {p.brand_name ? ` · ${p.brand_name}` : ''}
                      </span>
                      <span className="scanner-search__result-tags">
                        {!!p.is_new && <span className="tag">Nuevo</span>}
                        {!!p.is_bestseller && <span className="tag">Más vendido</span>}
                        {getProductPriceInfo(p).type === 'discount' && <span className="tag tag--discount">Descuento</span>}
                        {p.collections.map((c) => (
                          <span key={c.id} className="tag tag--collection">
                            {c.name}
                          </span>
                        ))}
                      </span>
                    </div>
                  </button>
                  {p.variants.length > 1 && expandedProductId === p.id && (
                    <div className="scanner-search__variants">
                      {p.variants.map((v) => {
                        const selected = bulkMode && selectedVariantIds.has(v.id)
                        const isVariantHighlighted = selectableEntries[highlightedIndex]?.key === `v-${v.id}`
                        return (
                          <button
                            key={v.id}
                            type="button"
                            data-flat-key={`v-${v.id}`}
                            className={`scanner-search__variant-chip ${selected ? 'scanner-search__variant-chip--selected' : ''} ${isVariantHighlighted ? 'scanner-search__variant-chip--highlighted' : ''}`}
                            onClick={() => handlePickVariant(p, v)}
                          >
                            {bulkMode && <span className={`scanner-search__checkbox ${selected ? 'scanner-search__checkbox--checked' : ''}`} />}
                            <span className="color-dot" style={{ backgroundColor: v.color_hex }} />
                            {v.color_name} · {v.size}
                            {stockChipLabel(v.stock, lowStockThreshold) && (
                              <span className={`stock-flag ${stockClass(v.stock, lowStockThreshold)}`}> ({stockChipLabel(v.stock, lowStockThreshold)})</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {hasActiveSearch && searchResults.length === 0 && <p className="state-msg">No se encontraron productos.</p>}
            {!hasActiveSearch && (
              <p className="state-msg">
                Escribe un nombre o elige un filtro para buscar un producto. Usa ↑ ↓ y Enter para navegar y elegir.
              </p>
            )}
          </div>

          {bulkMode && selectedVariantIds.size > 0 && (
            <div className="scanner-bulk-bar">
              <span>{selectedVariantIds.size} seleccionado(s)</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedVariantIds(new Set())}>
                Limpiar
              </button>
              <button type="button" className="btn btn--accent btn--sm" onClick={handleBulkAddToSale}>
                Agregar {selectedVariantIds.size} a la venta
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="state-msg state-msg--error">{error}</p>}
      </div>

      <div className="pos-lookup-row__side">
      {result && (
        <>
          <span className="page-block__hint">Último artículo detectado</span>
          <div className="stock-result" ref={resultRef}>
            {result.main_image_url ? (
              <img src={result.main_image_url} alt="" className="stock-result__img" />
            ) : (
              <div className="stock-result__img" />
            )}
            <div className="stock-result__body">
              <span className="stock-result__label">SKU: {result.barcode}</span>
              <h2 className="stock-result__title">{result.product_name}</h2>

              <div className="stock-result__meta">
                <div>
                  Color
                  <strong>
                    <span className="color-dot" style={{ backgroundColor: result.color_hex }} />
                    {result.color_name}
                  </strong>
                </div>
                <div>
                  Talla
                  <strong>{result.size}</strong>
                </div>
                <div>
                  Stock actual
                  <span className="stock-result__stock-row">
                    <strong className={stockClass(result.stock, lowStockThreshold)}>{result.stock}</strong>
                    {resultProduct && resultProduct.variants.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setShowSizes((v) => !v)}
                      >
                        {showSizes ? 'Ocultar tallas' : 'Ver tallas'}
                      </button>
                    )}
                  </span>
                </div>
              </div>

              {showSizes && resultProduct && (
                <div className="scanner-search__variants scanner-search__variants--inline">
                  {resultProduct.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`scanner-search__variant-chip ${v.id === result.id ? 'scanner-search__variant-chip--selected' : ''}`}
                      onClick={() => handlePickResultVariant(v)}
                    >
                      <span className="color-dot" style={{ backgroundColor: v.color_hex }} />
                      {v.color_name} · {v.size}
                      {stockChipLabel(v.stock, lowStockThreshold) && (
                        <span className={`stock-flag ${stockClass(v.stock, lowStockThreshold)}`}> ({stockChipLabel(v.stock, lowStockThreshold)})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="stock-result__actions">
                {restockMode ? (
                  <>
                    <span className="stock-result__actions-label">Reabastecer</span>
                    <div className="pos-restock__row">
                      <input
                        type="number"
                        min="0"
                        placeholder="Cantidad recibida"
                        value={surtirQty}
                        onChange={(e) => handleQtyChange(e.target.value, setSurtirQty)}
                      />
                      <button type="button" className="btn btn--accent btn--sm" onClick={handleRestock} disabled={restocking || !surtirQty}>
                        {restocking ? 'Actualizando…' : 'Surtir'}
                      </button>
                    </div>
                    <div className="pos-restock__row">
                      <input
                        type="number"
                        min="1"
                        className="pos-label-qty"
                        title="Cuántas etiquetas imprimir"
                        value={labelQty}
                        onChange={(e) => handleQtyChange(e.target.value, setLabelQty)}
                      />
                      <button type="button" className="btn btn--ghost btn--sm" onClick={handlePrintLabels}>
                        <PrinterIcon /> Imprimir etiquetas
                      </button>
                      <Link to="/configuracion" className="icon-btn icon-btn--ghost" aria-label="Configurar tamaño de etiqueta" title="Configurar tamaño de etiqueta">
                        <SettingsIcon />
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="pos-add-confirm">
                    <CartIcon width={14} height={14} /> Agregado a la venta actual
                  </p>
                )}

                <div className="stock-adjust-actions">
                  <Link to={`/productos/${result.product_id}`} className="btn btn--ghost btn--sm stock-result__edit">
                    <EditIcon />
                    Editar producto
                  </Link>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={handleCloseResult}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      </div>
      </div>

      <div className="pos-cart">
        <div className="pos-cart__header">
          <h2 className="section-title-icon">
            <CartIcon /> Venta actual
          </h2>
          {saleLines.length > 0 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearSale}>
              Vaciar
            </button>
          )}
        </div>

        {saleLines.length === 0 ? (
          <p className="state-msg">Escanea o busca un producto para agregarlo a la venta.</p>
        ) : (
          <>
            <ul className="pos-cart__items">
              {saleLines.map((line) => {
                const priced = pricedLine(line)
                return (
                <li key={line.key} className={`pos-cart__item ${line.isGift ? 'pos-cart__item--gift' : ''}`}>
                  {line.image ? (
                    <button
                      type="button"
                      className="pos-cart__item-thumb-btn"
                      onClick={() => setViewerIndex(saleLines.filter((l) => l.image).findIndex((l) => l.key === line.key))}
                      aria-label="Ver imagen en grande"
                    >
                      <img src={line.image} alt="" />
                    </button>
                  ) : (
                    <div className="pos-cart__item-thumb" />
                  )}
                  <div className="pos-cart__item-info">
                    <strong>{line.name}</strong>
                    <span>{[line.colorName, line.size].filter(Boolean).join(' · ')}</span>
                    {priced.collectionName && (
                      <span className="tag tag--collection" title="Precio de esta colección/paquete aplicado a esta línea">
                        {priced.collectionName}
                      </span>
                    )}
                  </div>
                  <div className="pos-cart__item-qty">
                    <button type="button" onClick={() => updateLineQty(line.key, line.quantity - 1)} aria-label="Restar">
                      <MinusIcon />
                    </button>
                    <span>{line.quantity}</span>
                    <button type="button" onClick={() => updateLineQty(line.key, line.quantity + 1)} aria-label="Sumar">
                      <PlusIcon />
                    </button>
                  </div>
                  <label className="pos-cart__item-field">
                    <span>Precio</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="pos-cart__item-price"
                      title={line.overridePrice != null ? 'Precio editado a mano' : priced.collectionName ? `Precio de ${priced.collectionName}` : 'Precio de lista'}
                      value={priced.price}
                      onChange={(e) => updateLineUnitPrice(line.key, e.target.value)}
                      disabled={line.isGift}
                    />
                  </label>
                  <label className="pos-cart__item-field">
                    <span>Desc. x unidad</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="pos-cart__item-price"
                      title="Descuento por unidad"
                      placeholder="0"
                      value={line.discountAmount || ''}
                      onChange={(e) => updateLineDiscount(line.key, e.target.value)}
                      disabled={line.isGift}
                    />
                  </label>
                  <label className="pos-cart__item-gift">
                    <input type="checkbox" checked={line.isGift} onChange={() => toggleLineGift(line.key)} />
                    <GiftIcon width={14} height={14} /> Regalo
                  </label>
                  {!line.isGift && line.quantity > 1 && (
                    giftSplitKey === line.key ? (
                      <form
                        className="pos-cart__gift-split"
                        onSubmit={(e) => {
                          e.preventDefault()
                          splitGiftUnits(line.key, Number(giftSplitQty) || 0)
                        }}
                      >
                        <input
                          type="number"
                          min="1"
                          max={line.quantity - 1}
                          autoFocus
                          placeholder="Cant."
                          value={giftSplitQty}
                          onChange={(e) => setGiftSplitQty(e.target.value)}
                        />
                        <button type="submit" className="icon-btn icon-btn--ghost" aria-label="Confirmar regalo parcial">
                          <CheckIcon width={14} height={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--ghost"
                          aria-label="Cancelar"
                          onClick={() => {
                            setGiftSplitKey(null)
                            setGiftSplitQty('')
                          }}
                        >
                          <CloseIcon width={14} height={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm pos-cart__gift-split-btn"
                        onClick={() => {
                          setGiftSplitKey(line.key)
                          setGiftSplitQty('')
                        }}
                      >
                        Regalar unidades
                      </button>
                    )
                  )}
                  <button type="button" className="icon-btn" onClick={() => removeLine(line.key)} aria-label="Quitar">
                    <TrashIcon />
                  </button>
                </li>
                )
              })}
            </ul>

            <div className="pos-cart__footer">
              <div className="pos-cart__customer">
                <span className="pos-cart__customer-label">Cliente frecuente (opcional)</span>
                {selectedCustomer ? (
                  <div className="pos-cart__customer-selected">
                    <span>
                      {selectedCustomer.name}
                      {loyaltyDiscount > 0 ? ` · -${formatPrice(loyaltyDiscount)} por pieza` : ''}
                    </span>
                    <button
                      type="button"
                      className="icon-btn icon-btn--ghost"
                      onClick={() => setSelectedCustomer(null)}
                      aria-label="Quitar cliente"
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </div>
                ) : (
                  <div className="pos-cart__customer-search">
                    <input
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setShowCustomerSearch(true)
                      }}
                      onFocus={() => setShowCustomerSearch(true)}
                      placeholder="Buscar por nombre, correo o teléfono…"
                    />
                    {showCustomerSearch && customerOptions.length > 0 && (
                      <ul className="pos-cart__customer-options">
                        {customerOptions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(c)
                                setCustomerSearch('')
                                setCustomerOptions([])
                                setShowCustomerSearch(false)
                              }}
                            >
                              {c.name}
                              {Number(c.discount_amount) > 0 && <span className="tag">-{formatPrice(c.discount_amount)}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <label className="form-field pos-cart__notes">
                Notas (opcional)
                <input
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Ej. cliente…"
                />
              </label>

              <div className="pos-payment-method">
                <span className="pos-payment-method__label">Forma de pago</span>
                <div className="pos-payment-method__row">
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${paymentMethod === 'cash' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <CashIcon width={16} height={16} /> Efectivo
                  </button>
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${paymentMethod === 'debit' || paymentMethod === 'credit' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setPaymentMethod((pm) => (pm === 'debit' || pm === 'credit' ? pm : 'credit'))}
                  >
                    <CardIcon width={16} height={16} /> Tarjeta
                  </button>
                  <button
                    type="button"
                    className={`pos-payment-method__btn ${paymentMethod === 'transfer' ? 'pos-payment-method__btn--active' : ''}`}
                    onClick={() => setPaymentMethod('transfer')}
                  >
                    <TransferIcon width={16} height={16} /> Transferencia
                  </button>
                </div>
                {(paymentMethod === 'debit' || paymentMethod === 'credit') && (
                  <div className="pos-payment-method__row pos-payment-method__row--sub">
                    <button
                      type="button"
                      className={`pos-payment-method__btn pos-payment-method__btn--sm ${paymentMethod === 'debit' ? 'pos-payment-method__btn--active' : ''}`}
                      onClick={() => setPaymentMethod('debit')}
                    >
                      Débito
                    </button>
                    <button
                      type="button"
                      className={`pos-payment-method__btn pos-payment-method__btn--sm ${paymentMethod === 'credit' ? 'pos-payment-method__btn--active' : ''}`}
                      onClick={() => setPaymentMethod('credit')}
                    >
                      Crédito
                    </button>
                  </div>
                )}
              </div>

              <label className="pos-cart__total">
                <span>Total a pagar{totalOverride != null ? ' (editado a mano)' : ''}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pos-cart__total-input"
                  value={Math.round(saleTotal * 100) / 100}
                  onChange={(e) => setTotalOverride(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <button type="button" className="btn btn--ghost" onClick={handleHoldSale} disabled={completingSale}>
                Poner en espera
              </button>
              <button type="button" className="btn btn--accent" onClick={handleCompleteSale} disabled={completingSale}>
                {completingSale ? 'Procesando…' : 'Completar venta'}
              </button>
            </div>
          </>
        )}
      </div>

      {viewerIndex !== null && cartImages.length > 0 && (
        <ImageLightbox images={cartImages} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  )
}

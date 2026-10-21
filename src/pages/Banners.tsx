import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Banner, BannerElement, BannerPlacement, Category, Collection, PageLayoutEntry, PageLayoutPage } from '../api/types'
import ImageUploader from '../components/ImageUploader'
import ImagePreview from '../components/ImagePreview'
import ToggleSwitch from '../components/ToggleSwitch'
import BannerEditor, { PROMO_DEVICE_RATIOS, seedBannerElements, imageSizeHint } from '../components/BannerEditor'
import { DragHandleIcon } from '../components/icons'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import LoadingState from '../components/LoadingState'

const PLACEMENT_LABELS: Record<Exclude<BannerPlacement, 'category'>, string> = {
  home_hero: 'Carrusel de Inicio',
  home_promo: 'Inicio',
  packages: 'Paquetes',
}

/** Every promo banner sharing the same placement (and, for placement =
 * 'category', the same category) groups together — a banner on the
 * Paquetes page has nothing to do with one on a category page, even though
 * both live in the same `banners` table. Only 'category' groups keep their
 * own drag order here; 'home_promo'/'packages' order is decided by the
 * "Orden de Inicio"/"Orden de Paquetes" sections above instead (see
 * PageOrderSection) — having both would be exactly the overlapping,
 * confusing controls this page exists to avoid. */
function groupKeyOf(b: Banner): string {
  return b.placement === 'category' ? `category:${b.placement_category_id}` : b.placement
}

function groupLabelOf(b: Banner): string {
  if (b.placement === 'category') return `Categoría: ${b.placement_category_name ?? '(sin categoría)'}`
  return PLACEMENT_LABELS[b.placement]
}

/** Which curated page (if any) a promo banner's placement feeds into. */
function pageOfPlacement(placement: BannerPlacement): PageLayoutPage | null {
  if (placement === 'home_promo') return 'home'
  if (placement === 'packages') return 'packages'
  return null
}

const SINGLETON_ENTRY_LABELS: Record<'category_showcase' | 'all_products', string> = {
  category_showcase: 'Comprar por categoría',
  all_products: 'Todos los productos',
}

function entryKey(e: PageLayoutEntry): string {
  return e.type === 'category_showcase' || e.type === 'all_products' ? e.type : `${e.type}:${e.id}`
}

function entryLabel(e: PageLayoutEntry): string {
  return e.type === 'category_showcase' || e.type === 'all_products' ? SINGLETON_ENTRY_LABELS[e.type] : e.label
}

function entryTypeLabel(e: PageLayoutEntry): string {
  if (e.type === 'category_showcase' || e.type === 'all_products') return 'Sección fija'
  if (e.type === 'banner') return 'Banner'
  return 'Colección'
}

const emptyHeroDraft = {
  imageUrl: null as string | null,
  badgeText: '',
  title: '',
  subtitle: '',
  ctaText: '',
  collectionId: '',
  layoutElements: [] as BannerElement[],
  imageFocusX: 50,
  imageFocusY: 50,
  imageZoom: null as number | null,
  scrimOpacity: null as number | null,
  /** The button's destination is either this OR collectionId (never both —
   * picking one in the "El botón lleva a" select clears the other). Empty
   * collectionId + empty categoryId = "Catálogo general". */
  categoryId: '',
  imageUrlMobile: null as string | null,
}

/** The plain (non-visual-editor) "El botón lleva a" field only has one
 * pointer field per destination kind — collectionId for a collection, this
 * for a category (there's no dedicated column for it, so it's expressed as
 * a plain ctaLink URL the same way a custom link would be). */
/** A "collectionId" value reserved to mean "the Paquetes page" instead of a
 * real collection — never collides with a real id (those are numeric
 * strings). */
const PACKAGES_LINK_SENTINEL = '__packages__'

function categoryCtaLink(categories: Category[], categoryId: string): string | null {
  const slug = categories.find((c) => String(c.id) === categoryId)?.slug
  return slug ? `/?categoria=${slug}` : null
}

const emptyPromoDraft = {
  placement: 'home_promo' as BannerPlacement,
  placementCategoryId: '',
  imageUrl: null as string | null,
  badgeText: '',
  title: '',
  subtitle: '',
  ctaText: '',
  collectionId: '',
  layoutElements: [] as BannerElement[],
  imageFocusX: 50,
  imageFocusY: 50,
  imageZoom: null as number | null,
  scrimOpacity: null as number | null,
  categoryId: '',
  imageUrlMobile: null as string | null,
}

/** One page's ("Inicio" or "Paquetes") curated, orderable section list —
 * drag to reorder, "Quitar" to hide something without deleting it, "+
 * Agregar" to bring back anything eligible that isn't currently shown. */
function PageOrderSection({
  title,
  hint,
  draft,
  changed,
  saving,
  dragIndex,
  onDragOver,
  onDragStart,
  onDragEnd,
  onCancel,
  onSave,
  onRemove,
  available,
  onAdd,
}: {
  title: string
  hint: string
  draft: PageLayoutEntry[]
  changed: boolean
  saving: boolean
  dragIndex: number | null
  onDragOver: (e: DragEvent, index: number) => void
  onDragStart: (index: number) => void
  onDragEnd: () => void
  onCancel: () => void
  onSave: () => void
  onRemove: (entry: PageLayoutEntry) => void
  available: PageLayoutEntry[]
  onAdd: (entry: PageLayoutEntry) => void
}) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      <p className="page-block__hint">{hint}</p>

      {changed && (
        <div className="assigned-products__header">
          <div className="variants-editor__edit-actions">
            <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--accent btn--sm" onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar orden'}
            </button>
          </div>
        </div>
      )}

      <div className="banners-list">
        {draft.map((entry, index) => (
          <div
            key={entryKey(entry)}
            className={`banner-card ${dragIndex === index ? 'banner-card--dragging' : ''}`}
            onDragOver={(e) => onDragOver(e, index)}
          >
            <span className="image-thumbs__handle" draggable onDragStart={() => onDragStart(index)} onDragEnd={onDragEnd}>
              <DragHandleIcon />
            </span>
            <div className="banner-card__body">
              <strong>{entryLabel(entry)}</strong>
              <p>{entryTypeLabel(entry)}</p>
            </div>
            {entry.type !== 'category_showcase' && (
              <div className="banner-card__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRemove(entry)}>
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
        {draft.length === 0 && <p className="state-msg">Nada configurado todavía — agrega algo abajo.</p>}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAdd((v) => !v)} disabled={available.length === 0}>
          {showAdd ? 'Cerrar' : '+ Agregar'}
        </button>
        {available.length === 0 && !showAdd && (
          <span className="page-block__hint" style={{ marginLeft: 8 }}>
            Ya está todo lo disponible agregado.
          </span>
        )}
        {showAdd && (
          <div className="collection-picker__checks" style={{ marginTop: 10 }}>
            {available.map((entry) => (
              <button
                key={entryKey(entry)}
                type="button"
                className="chip-filter"
                onClick={() => {
                  onAdd(entry)
                  if (available.length === 1) setShowAdd(false)
                }}
              >
                + {entryLabel(entry)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reorder state for banner groups that still order independently (the
  // hero carousel, and each 'category' placement group) — one ordered id
  // list per group (see groupKeyOf).
  const [orderMap, setOrderMap] = useState<Record<string, number[]>>({})
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [savingGroup, setSavingGroup] = useState<string | null>(null)

  // Hero carousel create form — hidden behind "+ Crear slide" until needed.
  const [showCreateHero, setShowCreateHero] = useState(false)
  const [heroDraft, setHeroDraft] = useState(emptyHeroDraft)
  const [creatingHero, setCreatingHero] = useState(false)
  const [heroError, setHeroError] = useState<string | null>(null)
  const [showHeroDraftEditor, setShowHeroDraftEditor] = useState(false)

  // Promo banner create form — hidden behind "+ Crear banner" until needed.
  const [showCreatePromo, setShowCreatePromo] = useState(false)
  const [promoDraft, setPromoDraft] = useState(emptyPromoDraft)
  const [creatingPromo, setCreatingPromo] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [showPromoDraftEditor, setShowPromoDraftEditor] = useState(false)

  // Shared inline "editar banner" (visual layout editor) — one editor at a
  // time, for whichever row (hero OR promo, they work identically) is open.
  const [bannerEditingId, setBannerEditingId] = useState<number | null>(null)
  const [bannerEditorElements, setBannerEditorElements] = useState<BannerElement[]>([])
  const [bannerEditorImageUrl, setBannerEditorImageUrl] = useState<string>('')
  const [bannerEditorImageFocus, setBannerEditorImageFocus] = useState({ x: 50, y: 50 })
  const [bannerEditorImageZoom, setBannerEditorImageZoom] = useState<number | null>(null)
  const [bannerEditorScrimOpacity, setBannerEditorScrimOpacity] = useState<number | null>(null)
  const [bannerEditorImageUrlMobile, setBannerEditorImageUrlMobile] = useState<string | null>(null)
  const [savingBanner, setSavingBanner] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)

  // "Orden de Inicio" / "Orden de Paquetes" — pageLayouts is the
  // last-saved-from-server order per page; pageDrafts is the working drag
  // draft per page.
  const emptyPages: Record<PageLayoutPage, PageLayoutEntry[]> = { home: [], packages: [] }
  const [pageLayouts, setPageLayouts] = useState(emptyPages)
  const [pageDrafts, setPageDrafts] = useState(emptyPages)
  const [pageDragState, setPageDragState] = useState<{ page: PageLayoutPage; index: number } | null>(null)
  const [savingPage, setSavingPage] = useState<PageLayoutPage | null>(null)

  const { toast } = useToast()
  const confirm = useConfirm()

  function buildOrderMap(list: Banner[]): Record<string, number[]> {
    const map: Record<string, number[]> = {}
    for (const b of list) {
      const key = groupKeyOf(b)
      if (!map[key]) map[key] = []
      map[key].push(b.id)
    }
    return map
  }

  function load() {
    Promise.all([api.getBanners(), api.getCollections(), api.getCategories(), api.getPageLayout('home'), api.getPageLayout('packages')])
      .then(([bannersData, collectionsData, categoriesData, homeData, packagesData]) => {
        setBanners(bannersData)
        setOrderMap(buildOrderMap(bannersData))
        setCollections(collectionsData)
        setCategories(categoriesData)
        setPageLayouts({ home: homeData, packages: packagesData })
        setPageDrafts({ home: homeData, packages: packagesData })
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(load, [])

  const heroBanners = banners.filter((b) => b.kind === 'hero')
  const promoGroups: { key: string; label: string; banners: Banner[] }[] = []
  for (const b of banners.filter((b) => b.kind === 'promo')) {
    const key = groupKeyOf(b)
    let group = promoGroups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: groupLabelOf(b), banners: [] }
      promoGroups.push(group)
    }
    group.banners.push(b)
  }

  function orderedBanners(key: string, list: Banner[]): Banner[] {
    const ids = orderMap[key] ?? list.map((b) => b.id)
    const byId = new Map(list.map((b) => [b.id, b]))
    return ids.map((id) => byId.get(id)).filter((b): b is Banner => !!b)
  }

  function groupOrderChanged(key: string, list: Banner[]): boolean {
    const ids = orderMap[key] ?? []
    return ids.join(',') !== list.map((b) => b.id).join(',')
  }

  function handleGroupDragOver(e: DragEvent, key: string, index: number) {
    e.preventDefault()
    if (dragGroup !== key || dragIndex === null || dragIndex === index) return
    setOrderMap((prev) => {
      const list = [...(prev[key] ?? [])]
      const [moved] = list.splice(dragIndex, 1)
      list.splice(index, 0, moved)
      return { ...prev, [key]: list }
    })
    setDragIndex(index)
  }

  function handleGroupDragEnd() {
    setDragGroup(null)
    setDragIndex(null)
  }

  function handleCancelGroupOrder(key: string, list: Banner[]) {
    setOrderMap((prev) => ({ ...prev, [key]: list.map((b) => b.id) }))
  }

  async function handleSaveGroupOrder(key: string) {
    setSavingGroup(key)
    try {
      await api.reorderBanners(orderMap[key] ?? [])
      load()
      toast('Orden actualizado con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el orden', 'error')
    } finally {
      setSavingGroup(null)
    }
  }

  // ---------- "Orden de Inicio" / "Orden de Paquetes" ----------

  function pageOrderChanged(page: PageLayoutPage): boolean {
    return pageDrafts[page].map(entryKey).join(',') !== pageLayouts[page].map(entryKey).join(',')
  }

  function handlePageDragOver(e: DragEvent, page: PageLayoutPage, index: number) {
    e.preventDefault()
    if (!pageDragState || pageDragState.page !== page || pageDragState.index === index) return
    setPageDrafts((prev) => {
      const list = [...prev[page]]
      const [moved] = list.splice(pageDragState.index, 1)
      list.splice(index, 0, moved)
      return { ...prev, [page]: list }
    })
    setPageDragState({ page, index })
  }

  function handlePageDragEnd() {
    setPageDragState(null)
  }

  function handleCancelPageOrder(page: PageLayoutPage) {
    setPageDrafts((prev) => ({ ...prev, [page]: pageLayouts[page] }))
  }

  async function handleSavePageOrder(page: PageLayoutPage) {
    setSavingPage(page)
    try {
      const order = pageDrafts[page].map((e) =>
        e.type === 'category_showcase' || e.type === 'all_products' ? { type: e.type } : { type: e.type, id: e.id }
      )
      const updated = await api.updatePageLayout(page, order)
      setPageLayouts((prev) => ({ ...prev, [page]: updated }))
      setPageDrafts((prev) => ({ ...prev, [page]: updated }))
      toast('Orden actualizado con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el orden', 'error')
    } finally {
      setSavingPage(null)
    }
  }

  function handleRemoveFromPage(page: PageLayoutPage, entry: PageLayoutEntry) {
    setPageDrafts((prev) => ({ ...prev, [page]: prev[page].filter((e) => entryKey(e) !== entryKey(entry)) }))
  }

  function handleAddToPage(page: PageLayoutPage, entry: PageLayoutEntry) {
    setPageDrafts((prev) => ({ ...prev, [page]: [...prev[page], entry] }))
  }

  function availableToAdd(page: PageLayoutPage): PageLayoutEntry[] {
    const draftKeys = new Set(pageDrafts[page].map(entryKey))
    const bannerPlacement: BannerPlacement = page === 'home' ? 'home_promo' : 'packages'
    const items: PageLayoutEntry[] = []
    if (page === 'home' && !draftKeys.has('category_showcase')) items.push({ type: 'category_showcase' })
    if (page === 'home' && !draftKeys.has('all_products')) items.push({ type: 'all_products' })
    for (const b of banners) {
      if (b.kind !== 'promo' || b.placement !== bannerPlacement || !b.is_active) continue
      const key = `banner:${b.id}`
      if (!draftKeys.has(key)) items.push({ type: 'banner', id: b.id, label: b.title || '(sin título)' })
    }
    for (const c of collections) {
      if (!c.is_active) continue
      const key = `collection:${c.id}`
      if (!draftKeys.has(key)) items.push({ type: 'collection', id: c.id, label: c.name })
    }
    return items
  }

  /** A promo banner just created, deleted, or (de)activated may need to
   * appear in (or disappear from) its page's order — refetch it, but only
   * overwrite the working drag draft if it wasn't already mid-edit. */
  function refreshPageLayout(page: PageLayoutPage) {
    const draftUnchanged = !pageOrderChanged(page)
    api
      .getPageLayout(page)
      .then((data) => {
        setPageLayouts((prev) => ({ ...prev, [page]: data }))
        if (draftUnchanged) setPageDrafts((prev) => ({ ...prev, [page]: data }))
      })
      .catch(() => {})
  }

  // ---------- Shared banner actions (hero and promo banners alike) ----------

  async function handleToggleActive(banner: Banner, isActive: boolean) {
    try {
      const updated = await api.updateBanner(banner.id, { isActive })
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
      const page = pageOfPlacement(updated.placement)
      if (page) refreshPageLayout(page)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al actualizar', 'error')
    }
  }

  async function handleDelete(banner: Banner) {
    const ok = await confirm({
      title: `¿Eliminar el banner "${banner.title || 'sin título'}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await api.deleteBanner(banner.id)
    setBanners((prev) => prev.filter((b) => b.id !== banner.id))
    setOrderMap((prev) => {
      const key = groupKeyOf(banner)
      return { ...prev, [key]: (prev[key] ?? []).filter((id) => id !== banner.id) }
    })
    const page = pageOfPlacement(banner.placement)
    if (page) refreshPageLayout(page)
    toast('Banner eliminado con éxito')
  }

  // ---------- Shared inline banner editor (hero rows and promo rows alike) ----------

  function openBannerEditorFor(b: Banner) {
    setBannerEditingId(b.id)
    setBannerEditorImageUrl(b.image_url)
    setBannerEditorImageFocus({ x: b.image_focus_x, y: b.image_focus_y })
    setBannerEditorImageZoom(b.image_zoom)
    setBannerEditorScrimOpacity(b.scrim_opacity)
    setBannerEditorImageUrlMobile(b.image_url_mobile)
    setBannerError(null)
    setBannerEditorElements(
      b.layout_json && b.layout_json.length > 0
        ? b.layout_json
        : seedBannerElements({
            badgeText: b.badge_text ?? '',
            title: b.title ?? '',
            subtitle: b.subtitle ?? '',
            ctaText: b.cta_text ?? '',
            collectionSlug: b.collection_slug ?? null,
          })
    )
  }

  function closeBannerEditorFor() {
    setBannerEditingId(null)
    setBannerEditorElements([])
  }

  async function handleSaveBannerEditor() {
    if (bannerEditingId == null) return
    setSavingBanner(true)
    setBannerError(null)
    try {
      const updated = await api.updateBanner(bannerEditingId, {
        layoutJson: bannerEditorElements.length > 0 ? bannerEditorElements : null,
        imageUrl: bannerEditorImageUrl,
        imageFocusX: bannerEditorImageFocus.x,
        imageFocusY: bannerEditorImageFocus.y,
        imageZoom: bannerEditorImageZoom,
        scrimOpacity: bannerEditorScrimOpacity,
        imageUrlMobile: bannerEditorImageUrlMobile,
      })
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
      closeBannerEditorFor()
      toast('Banner actualizado con éxito')
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Error al guardar el banner')
    } finally {
      setSavingBanner(false)
    }
  }

  // ---------- Hero carousel ----------

  function handleToggleHeroDraftEditor() {
    setShowHeroDraftEditor((v) => {
      const next = !v
      if (next && heroDraft.layoutElements.length === 0) {
        setHeroDraft((d) => ({
          ...d,
          layoutElements: seedBannerElements({
            badgeText: d.badgeText,
            title: d.title,
            subtitle: d.subtitle,
            ctaText: d.ctaText,
            collectionSlug: collections.find((c) => String(c.id) === d.collectionId)?.slug ?? null,
          }),
        }))
      }
      return next
    })
  }

  function closeCreateHero() {
    setShowCreateHero(false)
    setHeroDraft(emptyHeroDraft)
    setShowHeroDraftEditor(false)
    setHeroError(null)
  }

  async function handleCreateHero(e: FormEvent) {
    e.preventDefault()
    if (!heroDraft.imageUrl) {
      setHeroError('Sube una imagen para el slide')
      return
    }
    setCreatingHero(true)
    setHeroError(null)
    try {
      const created = await api.createBanner({
        kind: 'hero',
        placement: 'home_hero',
        imageUrl: heroDraft.imageUrl,
        badgeText: heroDraft.badgeText || null,
        title: heroDraft.title || null,
        subtitle: heroDraft.subtitle || null,
        ctaText: heroDraft.ctaText || null,
        ctaLink: heroDraft.categoryId
          ? categoryCtaLink(categories, heroDraft.categoryId)
          : heroDraft.collectionId === PACKAGES_LINK_SENTINEL
            ? '/?paquetes=1'
            : null,
        collectionId:
          heroDraft.categoryId || heroDraft.collectionId === PACKAGES_LINK_SENTINEL
            ? null
            : heroDraft.collectionId
              ? Number(heroDraft.collectionId)
              : null,
        isActive: true,
        sortOrder: heroBanners.length,
        layoutJson: heroDraft.layoutElements.length > 0 ? heroDraft.layoutElements : null,
        imageFocusX: heroDraft.imageFocusX,
        imageFocusY: heroDraft.imageFocusY,
        imageZoom: heroDraft.imageZoom,
        scrimOpacity: heroDraft.scrimOpacity,
        imageUrlMobile: heroDraft.imageUrlMobile,
      })
      setBanners((prev) => [...prev, created])
      setOrderMap((prev) => ({ ...prev, home_hero: [...(prev.home_hero ?? []), created.id] }))
      closeCreateHero()
      toast('Slide creado con éxito')
    } catch (err) {
      setHeroError(err instanceof Error ? err.message : 'Error al crear el slide')
    } finally {
      setCreatingHero(false)
    }
  }

  // ---------- Promo banners ----------

  function handleTogglePromoDraftEditor() {
    setShowPromoDraftEditor((v) => {
      const next = !v
      if (next && promoDraft.layoutElements.length === 0) {
        setPromoDraft((d) => ({
          ...d,
          layoutElements: seedBannerElements({
            badgeText: d.badgeText,
            title: d.title,
            subtitle: d.subtitle,
            ctaText: d.ctaText,
            collectionSlug: collections.find((c) => String(c.id) === d.collectionId)?.slug ?? null,
          }),
        }))
      }
      return next
    })
  }

  function closeCreatePromo() {
    setShowCreatePromo(false)
    setPromoDraft(emptyPromoDraft)
    setShowPromoDraftEditor(false)
    setPromoError(null)
  }

  async function handleCreatePromo(e: FormEvent) {
    e.preventDefault()
    if (!promoDraft.imageUrl) {
      setPromoError('Sube una imagen para el banner')
      return
    }
    if (promoDraft.placement === 'category' && !promoDraft.placementCategoryId) {
      setPromoError('Elige una categoría')
      return
    }
    setCreatingPromo(true)
    setPromoError(null)
    try {
      const groupKey =
        promoDraft.placement === 'category' ? `category:${promoDraft.placementCategoryId}` : promoDraft.placement
      const sortOrder = (orderMap[groupKey] ?? []).length
      const created = await api.createBanner({
        kind: 'promo',
        placement: promoDraft.placement,
        placementCategoryId: promoDraft.placement === 'category' ? Number(promoDraft.placementCategoryId) : null,
        imageUrl: promoDraft.imageUrl,
        badgeText: promoDraft.badgeText || null,
        title: promoDraft.title || null,
        subtitle: promoDraft.subtitle || null,
        ctaText: promoDraft.ctaText || null,
        ctaLink: promoDraft.categoryId
          ? categoryCtaLink(categories, promoDraft.categoryId)
          : promoDraft.collectionId === PACKAGES_LINK_SENTINEL
            ? '/?paquetes=1'
            : null,
        collectionId:
          promoDraft.categoryId || promoDraft.collectionId === PACKAGES_LINK_SENTINEL
            ? null
            : promoDraft.collectionId
              ? Number(promoDraft.collectionId)
              : null,
        isActive: true,
        sortOrder,
        layoutJson: promoDraft.layoutElements.length > 0 ? promoDraft.layoutElements : null,
        imageFocusX: promoDraft.imageFocusX,
        imageFocusY: promoDraft.imageFocusY,
        imageZoom: promoDraft.imageZoom,
        scrimOpacity: promoDraft.scrimOpacity,
        imageUrlMobile: promoDraft.imageUrlMobile,
      })
      setBanners((prev) => [...prev, created])
      setOrderMap((prev) => ({ ...prev, [groupKey]: [...(prev[groupKey] ?? []), created.id] }))
      const page = pageOfPlacement(created.placement)
      if (page) refreshPageLayout(page)
      closeCreatePromo()
      toast('Banner creado con éxito')
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Error al crear el banner')
    } finally {
      setCreatingPromo(false)
    }
  }

  // ---------- Shared row markup (hero and promo banners look/behave identically) ----------

  function renderBannerRow(b: Banner, index: number, groupKey: string, options?: { deviceRatios?: typeof PROMO_DEVICE_RATIOS; draggable?: boolean }) {
    const draggable = options?.draggable ?? true
    return (
      <div key={b.id} className="banner-card-wrap">
        <div
          className={`banner-card ${dragGroup === groupKey && dragIndex === index ? 'banner-card--dragging' : ''}`}
          onDragOver={draggable ? (e) => handleGroupDragOver(e, groupKey, index) : undefined}
        >
          {draggable && (
            <span
              className="image-thumbs__handle"
              draggable
              onDragStart={() => {
                setDragGroup(groupKey)
                setDragIndex(index)
              }}
              onDragEnd={handleGroupDragEnd}
            >
              <DragHandleIcon />
            </span>
          )}
          <div className="banner-card__img">
            <ImagePreview
              imageUrl={b.image_url}
              onCropped={() => {}}
              allowCrop={false}
              imageFocus={{ x: b.image_focus_x, y: b.image_focus_y }}
            />
          </div>
          <div className="banner-card__body">
            <strong>{b.title || '(sin título)'}</strong>
            <p>{b.subtitle}</p>
            {b.cta_text && (
              <span className="tag">
                {b.cta_text} → {b.collection_name ? b.collection_name : 'Catálogo'}
              </span>
            )}
            {b.layout_json && b.layout_json.length > 0 && <span className="tag">Banner personalizado</span>}
          </div>
          <div className="banner-card__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => (bannerEditingId === b.id ? closeBannerEditorFor() : openBannerEditorFor(b))}
            >
              {bannerEditingId === b.id ? 'Cerrar editor' : 'Editar banner'}
            </button>
            <ToggleSwitch label="Activo" checked={!!b.is_active} onChange={(v) => handleToggleActive(b, v)} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(b)}>
              Eliminar
            </button>
          </div>
        </div>
        {bannerEditingId === b.id && (
          <div>
            <BannerEditor
              imageUrl={bannerEditorImageUrl}
              elements={bannerEditorElements}
              onChange={setBannerEditorElements}
              collections={collections}
              categories={categories}
              onImageChange={setBannerEditorImageUrl}
              imageFocus={bannerEditorImageFocus}
              onImageFocusChange={setBannerEditorImageFocus}
              imageZoom={bannerEditorImageZoom}
              onImageZoomChange={setBannerEditorImageZoom}
              scrimOpacity={bannerEditorScrimOpacity}
              onScrimOpacityChange={setBannerEditorScrimOpacity}
              imageUrlMobile={bannerEditorImageUrlMobile}
              onImageUrlMobileChange={setBannerEditorImageUrlMobile}
              deviceRatios={options?.deviceRatios}
            />
            {bannerError && <p className="form-error">{bannerError}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn--ghost" onClick={closeBannerEditorFor}>
                Cancelar
              </button>
              <button type="button" className="btn btn--accent" onClick={handleSaveBannerEditor} disabled={savingBanner}>
                {savingBanner ? 'Guardando…' : 'Guardar banner'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-block">
      <h1>Banners</h1>
      <p className="page-block__hint">
        Administra todos los banners de la tienda: el carrusel principal de Inicio y las franjas promocionales que
        puedes colocar en Inicio, Paquetes o una categoría específica.
      </p>

      {loading && <LoadingState />}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {!loading && (
        <>
          <PageOrderSection
            title="Orden de Inicio"
            hint='Qué aparece en Inicio y en qué orden: banners, "Comprar por categoría", colecciones y "Todos los productos". Arrastra para reordenar, "Quitar" para ocultar algo sin borrarlo.'
            draft={pageDrafts.home}
            changed={pageOrderChanged('home')}
            saving={savingPage === 'home'}
            dragIndex={pageDragState?.page === 'home' ? pageDragState.index : null}
            onDragOver={(e, index) => handlePageDragOver(e, 'home', index)}
            onDragStart={(index) => setPageDragState({ page: 'home', index })}
            onDragEnd={handlePageDragEnd}
            onCancel={() => handleCancelPageOrder('home')}
            onSave={() => handleSavePageOrder('home')}
            onRemove={(entry) => handleRemoveFromPage('home', entry)}
            available={availableToAdd('home')}
            onAdd={(entry) => handleAddToPage('home', entry)}
          />

          <PageOrderSection
            title="Orden de Paquetes"
            hint='Qué aparece en la página de Paquetes y en qué orden: banners y colecciones. Arrastra para reordenar, "Quitar" para ocultar algo sin borrarlo.'
            draft={pageDrafts.packages}
            changed={pageOrderChanged('packages')}
            saving={savingPage === 'packages'}
            dragIndex={pageDragState?.page === 'packages' ? pageDragState.index : null}
            onDragOver={(e, index) => handlePageDragOver(e, 'packages', index)}
            onDragStart={(index) => setPageDragState({ page: 'packages', index })}
            onDragEnd={handlePageDragEnd}
            onCancel={() => handleCancelPageOrder('packages')}
            onSave={() => handleSavePageOrder('packages')}
            onRemove={(entry) => handleRemoveFromPage('packages', entry)}
            available={availableToAdd('packages')}
            onAdd={(entry) => handleAddToPage('packages', entry)}
          />

          <div className="card" style={{ marginTop: 24 }}>
            <div className="page-block__header">
              <div>
                <h2>Carrusel de Inicio</h2>
                <p className="page-block__hint">
                  Con un slide activo se muestra un banner fijo; con más de uno, se muestra como carrusel. Arrastra
                  para cambiar el orden.
                </p>
              </div>
              {!showCreateHero && (
                <button type="button" className="btn btn--accent" onClick={() => setShowCreateHero(true)}>
                  + Crear slide
                </button>
              )}
            </div>

            {groupOrderChanged('home_hero', heroBanners) && (
              <div className="assigned-products__header">
                <div className="variants-editor__edit-actions">
                  <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleCancelGroupOrder('home_hero', heroBanners)}
                    disabled={savingGroup === 'home_hero'}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--accent btn--sm"
                    onClick={() => handleSaveGroupOrder('home_hero')}
                    disabled={savingGroup === 'home_hero'}
                  >
                    {savingGroup === 'home_hero' ? 'Guardando…' : 'Guardar orden'}
                  </button>
                </div>
              </div>
            )}

            <div className="banners-list">
              {orderedBanners('home_hero', heroBanners).map((s, index) => renderBannerRow(s, index, 'home_hero'))}
              {heroBanners.length === 0 && <p className="state-msg">Aún no hay slides. Se mostrará el banner por defecto.</p>}
            </div>
          </div>

          {showCreateHero && (
            <div className="card" style={{ maxWidth: 620, marginTop: 24 }}>
              <div className="page-block__header">
                <h2>Nuevo slide de Inicio</h2>
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeCreateHero}>
                  Cancelar
                </button>
              </div>
              <form onSubmit={handleCreateHero}>
                {heroDraft.imageUrl && (
                  <ImagePreview
                    imageUrl={heroDraft.imageUrl}
                    onCropped={(url) => setHeroDraft((d) => ({ ...d, imageUrl: url }))}
                    allowCrop={false}
                  />
                )}
                <ImageUploader
                  label={heroDraft.imageUrl ? 'Cambiar imagen' : 'Arrastra la imagen aquí'}
                  sizeHint={imageSizeHint(undefined, 'desktop')}
                  onUploaded={(url) => setHeroDraft((d) => ({ ...d, imageUrl: url }))}
                />

                <label className="form-field" style={{ marginTop: 16 }}>
                  Etiqueta (opcional)
                  <input
                    value={heroDraft.badgeText}
                    onChange={(e) => setHeroDraft((d) => ({ ...d, badgeText: e.target.value }))}
                    placeholder="Ej. NEW COLLECTION"
                  />
                </label>
                <label className="form-field">
                  Título
                  <input
                    value={heroDraft.title}
                    onChange={(e) => setHeroDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Ej. Urban Elegance"
                  />
                </label>
                <label className="form-field">
                  Subtítulo
                  <textarea
                    rows={3}
                    value={heroDraft.subtitle}
                    onChange={(e) => setHeroDraft((d) => ({ ...d, subtitle: e.target.value }))}
                    placeholder="Descripción breve"
                  />
                </label>
                <div className="form-grid">
                  <label className="form-field">
                    Texto del botón
                    <input
                      value={heroDraft.ctaText}
                      onChange={(e) => setHeroDraft((d) => ({ ...d, ctaText: e.target.value }))}
                      placeholder="Ej. VER COLECCIÓN"
                    />
                  </label>
                  <label className="form-field">
                    El botón lleva a
                    <select
                      value={heroDraft.categoryId ? `cat:${heroDraft.categoryId}` : heroDraft.collectionId}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v.startsWith('cat:')) {
                          setHeroDraft((d) => ({ ...d, categoryId: v.slice(4), collectionId: '' }))
                        } else {
                          setHeroDraft((d) => ({ ...d, collectionId: v, categoryId: '' }))
                        }
                      }}
                    >
                      <option value="">Catálogo general</option>
                      <option value={PACKAGES_LINK_SENTINEL}>Página de Paquetes</option>
                      {collections.length > 0 && (
                        <optgroup label="Colecciones / paquetes">
                          {collections.map((c) => (
                            <option key={`c-${c.id}`} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {categories.length > 0 && (
                        <optgroup label="Categorías">
                          {categories.map((c) => (
                            <option key={`cat-${c.id}`} value={`cat:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                </div>

                {heroDraft.imageUrl && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ marginTop: 8 }}
                      onClick={handleToggleHeroDraftEditor}
                    >
                      {showHeroDraftEditor ? 'Cerrar editor de banner' : 'Editar banner'}
                    </button>
                    {showHeroDraftEditor && (
                      <BannerEditor
                        imageUrl={heroDraft.imageUrl}
                        elements={heroDraft.layoutElements}
                        onChange={(layoutElements) => setHeroDraft((d) => ({ ...d, layoutElements }))}
                        collections={collections}
                        categories={categories}
                        onImageChange={(url) => setHeroDraft((d) => ({ ...d, imageUrl: url }))}
                        imageFocus={{ x: heroDraft.imageFocusX, y: heroDraft.imageFocusY }}
                        onImageFocusChange={(focus) => setHeroDraft((d) => ({ ...d, imageFocusX: focus.x, imageFocusY: focus.y }))}
                        imageZoom={heroDraft.imageZoom}
                        onImageZoomChange={(zoom) => setHeroDraft((d) => ({ ...d, imageZoom: zoom }))}
                        scrimOpacity={heroDraft.scrimOpacity}
                        onScrimOpacityChange={(opacity) => setHeroDraft((d) => ({ ...d, scrimOpacity: opacity }))}
                        imageUrlMobile={heroDraft.imageUrlMobile}
                        onImageUrlMobileChange={(url) => setHeroDraft((d) => ({ ...d, imageUrlMobile: url }))}
                      />
                    )}
                  </>
                )}

                {heroError && <p className="form-error">{heroError}</p>}

                <button type="submit" className="btn btn--accent" disabled={creatingHero}>
                  {creatingHero ? 'Guardando…' : '+ Agregar slide'}
                </button>
              </form>
            </div>
          )}

          <div className="card" style={{ marginTop: 32 }}>
            <div className="page-block__header">
              <div>
                <h2>Banners promocionales</h2>
                <p className="page-block__hint">
                  Franjas de imagen + texto (como "Arma tu paquete y ahorra más") — créalas aquí, pero decide si
                  aparecen y en qué orden desde "Orden de Inicio"/"Orden de Paquetes" arriba (solo las de una
                  categoría específica se reordenan aquí mismo).
                </p>
              </div>
              {!showCreatePromo && (
                <button type="button" className="btn btn--accent" onClick={() => setShowCreatePromo(true)}>
                  + Crear banner
                </button>
              )}
            </div>

            {promoGroups.length === 0 && (
              <p className="state-msg">Aún no hay banners promocionales. Se mostrará el texto por defecto en Inicio.</p>
            )}

            {promoGroups.map((group) => {
              const isCategoryGroup = group.key.startsWith('category:')
              const ordered = orderedBanners(group.key, group.banners)
              const changed = isCategoryGroup && groupOrderChanged(group.key, group.banners)
              return (
                <div key={group.key} className="banner-group">
                  <h3 className="banner-group__title">{group.label}</h3>

                  {changed && (
                    <div className="assigned-products__header">
                      <div className="variants-editor__edit-actions">
                        <span className="variants-editor__dirty-hint">Cambios sin guardar</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleCancelGroupOrder(group.key, group.banners)}
                          disabled={savingGroup === group.key}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn--accent btn--sm"
                          onClick={() => handleSaveGroupOrder(group.key)}
                          disabled={savingGroup === group.key}
                        >
                          {savingGroup === group.key ? 'Guardando…' : 'Guardar orden'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="banners-list">
                    {ordered.map((b, index) =>
                      renderBannerRow(b, index, group.key, { deviceRatios: PROMO_DEVICE_RATIOS, draggable: isCategoryGroup })
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {showCreatePromo && (
            <div className="card" style={{ maxWidth: 620, marginTop: 24 }}>
              <div className="page-block__header">
                <h2>Nuevo banner promocional</h2>
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeCreatePromo}>
                  Cancelar
                </button>
              </div>
              <form onSubmit={handleCreatePromo}>
                <div className="form-grid">
                  <label className="form-field">
                    Dónde aparece
                    <select
                      value={promoDraft.placement}
                      onChange={(e) =>
                        setPromoDraft((d) => ({ ...d, placement: e.target.value as BannerPlacement, placementCategoryId: '' }))
                      }
                    >
                      <option value="home_promo">Inicio</option>
                      <option value="packages">Paquetes</option>
                      <option value="category">Una categoría específica</option>
                    </select>
                  </label>
                  {promoDraft.placement === 'category' && (
                    <label className="form-field">
                      Categoría
                      <select
                        value={promoDraft.placementCategoryId}
                        onChange={(e) => setPromoDraft((d) => ({ ...d, placementCategoryId: e.target.value }))}
                      >
                        <option value="">Elige una categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {(promoDraft.placement === 'home_promo' || promoDraft.placement === 'packages') && (
                  <p className="page-block__hint">
                    Se agrega automáticamente a "{promoDraft.placement === 'home_promo' ? 'Orden de Inicio' : 'Orden de Paquetes'}" —
                    puedes reordenarlo o quitarlo desde ahí después.
                  </p>
                )}

                {promoDraft.imageUrl && (
                  <ImagePreview
                    imageUrl={promoDraft.imageUrl}
                    onCropped={(url) => setPromoDraft((d) => ({ ...d, imageUrl: url }))}
                    allowCrop={false}
                  />
                )}
                <ImageUploader
                  label={promoDraft.imageUrl ? 'Cambiar imagen' : 'Arrastra la imagen aquí'}
                  sizeHint={imageSizeHint(PROMO_DEVICE_RATIOS, 'desktop')}
                  onUploaded={(url) => setPromoDraft((d) => ({ ...d, imageUrl: url }))}
                />

                <label className="form-field" style={{ marginTop: 16 }}>
                  Etiqueta (opcional)
                  <input
                    value={promoDraft.badgeText}
                    onChange={(e) => setPromoDraft((d) => ({ ...d, badgeText: e.target.value }))}
                    placeholder="Precios especiales"
                  />
                </label>
                <label className="form-field">
                  Título
                  <input
                    value={promoDraft.title}
                    onChange={(e) => setPromoDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Arma tu paquete y ahorra más"
                  />
                </label>
                <label className="form-field">
                  Subtítulo
                  <textarea
                    rows={3}
                    value={promoDraft.subtitle}
                    onChange={(e) => setPromoDraft((d) => ({ ...d, subtitle: e.target.value }))}
                    placeholder="Combina tus favoritos y obtén precios especiales."
                  />
                </label>
                <div className="form-grid">
                  <label className="form-field">
                    Texto del botón
                    <input
                      value={promoDraft.ctaText}
                      onChange={(e) => setPromoDraft((d) => ({ ...d, ctaText: e.target.value }))}
                      placeholder="Ver paquetes"
                    />
                  </label>
                  <label className="form-field">
                    El botón lleva a
                    <select
                      value={promoDraft.categoryId ? `cat:${promoDraft.categoryId}` : promoDraft.collectionId}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v.startsWith('cat:')) {
                          setPromoDraft((d) => ({ ...d, categoryId: v.slice(4), collectionId: '' }))
                        } else {
                          setPromoDraft((d) => ({ ...d, collectionId: v, categoryId: '' }))
                        }
                      }}
                    >
                      <option value="">Catálogo general</option>
                      <option value={PACKAGES_LINK_SENTINEL}>Página de Paquetes</option>
                      {collections.length > 0 && (
                        <optgroup label="Colecciones / paquetes">
                          {collections.map((c) => (
                            <option key={`c-${c.id}`} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {categories.length > 0 && (
                        <optgroup label="Categorías">
                          {categories.map((c) => (
                            <option key={`cat-${c.id}`} value={`cat:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                </div>

                {promoDraft.imageUrl && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ marginTop: 8 }}
                      onClick={handleTogglePromoDraftEditor}
                    >
                      {showPromoDraftEditor ? 'Cerrar editor de banner' : 'Editar banner'}
                    </button>
                    {showPromoDraftEditor && (
                      <BannerEditor
                        imageUrl={promoDraft.imageUrl}
                        elements={promoDraft.layoutElements}
                        onChange={(layoutElements) => setPromoDraft((d) => ({ ...d, layoutElements }))}
                        collections={collections}
                        categories={categories}
                        onImageChange={(url) => setPromoDraft((d) => ({ ...d, imageUrl: url }))}
                        imageFocus={{ x: promoDraft.imageFocusX, y: promoDraft.imageFocusY }}
                        onImageFocusChange={(focus) => setPromoDraft((d) => ({ ...d, imageFocusX: focus.x, imageFocusY: focus.y }))}
                        imageZoom={promoDraft.imageZoom}
                        onImageZoomChange={(zoom) => setPromoDraft((d) => ({ ...d, imageZoom: zoom }))}
                        scrimOpacity={promoDraft.scrimOpacity}
                        onScrimOpacityChange={(opacity) => setPromoDraft((d) => ({ ...d, scrimOpacity: opacity }))}
                        imageUrlMobile={promoDraft.imageUrlMobile}
                        onImageUrlMobileChange={(url) => setPromoDraft((d) => ({ ...d, imageUrlMobile: url }))}
                        deviceRatios={PROMO_DEVICE_RATIOS}
                      />
                    )}
                  </>
                )}

                {promoError && <p className="form-error">{promoError}</p>}

                <button type="submit" className="btn btn--accent" disabled={creatingPromo}>
                  {creatingPromo ? 'Guardando…' : '+ Agregar banner'}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  )
}

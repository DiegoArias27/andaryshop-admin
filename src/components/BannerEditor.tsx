import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { BannerDevice, BannerDeviceLayout, BannerElement, BannerTemplateData, BannerTemplateRecord, Category, Collection } from '../api/types'
import { resolveDeviceLayout } from '../api/types'
import { api } from '../api/client'
import ImageCropModal from './ImageCropModal'
import ImageUploader from './ImageUploader'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  BoldIcon,
  BorderBoxIcon,
  CropIcon,
  DropletIcon,
  FillBoxIcon,
  FontIcon,
  GridIcon,
  LinkIcon,
  MoveIcon,
  TextSizeIcon,
  TrashIcon,
  UnlinkIcon,
} from './icons'

const FONT_OPTIONS = [
  { value: "'Fraunces', Georgia, serif", label: 'Fraunces' },
  { value: "'Inter', system-ui, sans-serif", label: 'Inter' },
  { value: "'Anton', sans-serif", label: 'Anton (impacto)' },
  { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue (condensada)' },
  { value: "'Oswald', sans-serif", label: 'Oswald' },
  { value: "'Playfair Display', Georgia, serif", label: 'Playfair Display' },
  { value: "'Poppins', sans-serif", label: 'Poppins' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Archivo Black', sans-serif", label: 'Archivo Black' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Courier New', monospace", label: 'Courier New' },
]

/** The banner's real shape on the storefront is NOT a fixed aspect ratio —
 * frontend/src/index.css's .hero-banner sizes itself off viewport height, so
 * the same xPct/yPct can land differently on different screens. A custom
 * layout instead locks the shape to these three ratios per breakpoint (see
 * .hero-banner--custom-layout, applied automatically whenever a slide has a
 * layout) so a position set once is reproducible — these three values here
 * must stay in sync with that CSS. Switching tabs below previews each one,
 * since positioning for "centered on desktop" doesn't mean the same pixel
 * math on mobile — each device tab has its own layout (see BannerElement's
 * `layouts`), linked together by default. */
const DEFAULT_DEVICE_RATIOS: Record<BannerDevice, { label: string; ratio: string }> = {
  mobile: { label: 'Móvil', ratio: '0.85 / 1' },
  tablet: { label: 'Tablet', ratio: '1.55 / 1' },
  desktop: { label: 'Escritorio', ratio: '2.5 / 1' },
}

/** A collection's own banner is shaped differently on the storefront (see
 * .collection-banner--custom-layout in frontend/src/index.css) — passing
 * this as the `deviceRatios` prop keeps the editor's canvas the same shape
 * the customer will actually see, instead of the hero's wider box. */
export const COLLECTION_DEVICE_RATIOS: Record<BannerDevice, { label: string; ratio: string }> = {
  mobile: { label: 'Móvil', ratio: '1.6 / 1' },
  tablet: { label: 'Tablet', ratio: '2.2 / 1' },
  desktop: { label: 'Escritorio', ratio: '2.2 / 1' },
}

/** A promo banner (the simpler image+title+subtitle strip, e.g. "Arma tu
 * paquete") is shaped differently still — see .package-promo--custom-layout
 * in frontend/src/index.css. Passed as `deviceRatios` when editing a
 * kind:'promo' banner so its editor canvas matches its real shape. */
export const PROMO_DEVICE_RATIOS: Record<BannerDevice, { label: string; ratio: string }> = {
  mobile: { label: 'Móvil', ratio: '1.8 / 1' },
  tablet: { label: 'Tablet', ratio: '3.2 / 1' },
  desktop: { label: 'Escritorio', ratio: '4.5 / 1' },
}
const DEVICE_ORDER: BannerDevice[] = ['desktop', 'tablet', 'mobile']

/** Target width (px) to base the recommended photo size on, per device —
 * high enough to stay sharp at that breakpoint's own real-world size
 * (desktop banners render largest, mobile smallest) without recommending
 * an unnecessarily huge upload for a phone-sized box. */
const SIZE_HINT_BASE_WIDTH: Record<BannerDevice, number> = {
  desktop: 2000,
  tablet: 1200,
  mobile: 800,
}

/** A recommended photo size to show while uploading — computed from
 * whichever placement's real shape `deviceRatios` represents AND the
 * specific device tab currently open (mobile/tablet/desktop each have a
 * different box shape — a photo sized for desktop's wide banner is the
 * wrong shape entirely for mobile's narrower, often taller one), so the
 * admin doesn't have to guess and end up with a photo that gets cropped
 * oddly once it's actually placed. */
export function imageSizeHint(
  deviceRatios: Record<BannerDevice, { label: string; ratio: string }> | undefined,
  device: BannerDevice
): string {
  const resolved = deviceRatios ?? DEFAULT_DEVICE_RATIOS
  const [wPart, hPart] = resolved[device].ratio.split('/').map((n) => parseFloat(n.trim()))
  const ratio = wPart / hPart
  const width = SIZE_HINT_BASE_WIDTH[device]
  const height = Math.round(width / ratio)
  const orientation = ratio > 1.05 ? 'horizontal' : ratio < 0.95 ? 'vertical' : 'cuadrada'
  return `Recomendado: ${width}×${height}px o más, ${orientation}`
}

/** Reproduces whichever real scrim CSS (.hero-banner__scrim by default,
 * .collection-banner__scrim / .package-promo__scrim for those placements —
 * see index.css in both admin and frontend) applies to the `deviceRatios`
 * passed to this editor instance, scaled by `opacityPct` (100 = that
 * gradient's own real stops, unmodified). Computed inline (never left to
 * the CSS class's own default) so the preview is pixel-accurate for every
 * placement, not just hero. */
function scrimGradient(deviceRatios: Record<BannerDevice, { label: string; ratio: string }> | undefined, opacityPct: number): string {
  const f = opacityPct / 100
  const a = (base: number) => Math.min(1, Math.max(0, base * f)).toFixed(2)
  if (deviceRatios === PROMO_DEVICE_RATIOS) {
    return `linear-gradient(90deg, rgba(0, 0, 0, ${a(0.88)}) 0%, rgba(0, 0, 0, ${a(0.6)}) 55%, rgba(0, 0, 0, ${a(0.25)}) 100%)`
  }
  if (deviceRatios === COLLECTION_DEVICE_RATIOS) {
    return `linear-gradient(180deg, rgba(0, 0, 0, ${a(0.15)}) 0%, rgba(0, 0, 0, ${a(0.75)}) 100%)`
  }
  return `linear-gradient(180deg, rgba(0, 0, 0, ${a(0.25)}) 0%, rgba(0, 0, 0, ${a(0.9)}) 100%)`
}

let elKeySeq = 0
function newElementId() {
  elKeySeq += 1
  return `el-${Date.now()}-${elKeySeq}`
}

/** The "px" values entered in the panel (font size, padding, border width,
 * radius) are relative to this reference container width — actual rendering
 * converts them to CSS container query units (cqw, 1cqw = 1% of the nearest
 * container-type:inline-size ancestor's width — see .banner-editor__canvas
 * and .hero-banner). That makes text and spacing scale proportionally with
 * however wide the banner's box actually renders (an ultra-wide desktop
 * monitor, a phone) instead of staying a fixed pixel size that only looks
 * right at one specific width — this is why the unit is "px" and not "pt":
 * neither is truly fixed here, "px" just names the reference width it's
 * proportional to. A realistic TARGET width per device, not how big the
 * editor's own preview BOX looks on screen — see DEVICE_PREVIEW_WIDTHS for
 * that. Must match the same table in frontend/src/components/product/Hero.tsx. */
export const BANNER_REFERENCE_WIDTHS: Record<BannerDevice, number> = {
  desktop: 1400,
  tablet: 700,
  mobile: 380,
}
function cqw(px: number, device: BannerDevice): string {
  return `${(px / BANNER_REFERENCE_WIDTHS[device]) * 100}cqw`
}

/** How big the preview box actually appears on screen in the admin panel —
 * independent of BANNER_REFERENCE_WIDTHS. The canvas itself always renders
 * at its full BANNER_REFERENCE_WIDTHS size (laid out, hinted, and wrapped
 * exactly like the real site would be at that width) and is then visually
 * shrunk with a CSS scale() transform to fit this box (see
 * .banner-editor__canvas's inline transform below). A scale transform is a
 * pure repaint-time operation — it doesn't change the element's own layout
 * size, so container queries (cqw) and text wrapping inside it are
 * completely unaffected, unlike shrinking the canvas's actual CSS width
 * would be (which used to make text metrics drift slightly from the real
 * site at large font sizes, since fonts — especially a variable one like
 * Fraunces — don't hint/space perfectly linearly across a wide range of
 * absolute pixel sizes). Desktop's reference (1400) is intentionally
 * larger than its preview box (700) for exactly this reason; tablet/mobile
 * already sit close to their own realistic widths, so no shrinking (scale
 * 1) is needed there. */
const DEVICE_PREVIEW_WIDTHS: Record<BannerDevice, number> = {
  desktop: 560,
  tablet: 560,
  mobile: BANNER_REFERENCE_WIDTHS.mobile,
}

/** Normalizes textShadow's legacy `boolean` shape (true ≈ level 3) alongside
 * its current `number` (0-5) one — every reader goes through this instead of
 * touching the raw field. */
export function shadowLevel(v: number | boolean | undefined): number {
  if (typeof v === 'number') return v
  return v ? 3 : 0
}

/** A CSS text-shadow string for a 0-5 level — kept in sync with
 * frontend/src/components/product/Hero.tsx's copy so the editor preview
 * matches the live site exactly. 0 (or unset) means no shadow at all. */
export function shadowCss(level: number): string | undefined {
  if (!level) return undefined
  const blur = 3 + level * 3
  const offset = Math.min(4, 1 + Math.floor(level / 2))
  const alpha = Math.min(0.75, 0.18 + level * 0.11)
  return `0 ${offset}px ${blur}px rgba(0, 0, 0, ${alpha.toFixed(2)})`
}

/** The visual box style shared by the editor canvas and the live site
 * (frontend/src/components/product/Hero.tsx keeps a matching copy) — driven
 * entirely by the element's own fields plus its resolved per-device layout,
 * so what's saved here is exactly what renders on the storefront. */
/** #rgb/#rrggbb -> "rgba(r, g, b, alpha)" — used to turn a flat fill color
 * into the translucent tint the iOS-glass style needs, since a plain
 * <input type="color"> can't express alpha itself. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${Number.isNaN(r) ? 255 : r}, ${Number.isNaN(g) ? 255 : g}, ${Number.isNaN(b) ? 255 : b}, ${alpha})`
}

/** Default box size (reference-px, same unit as fontSize) for an 'image'
 * element that hasn't had its width/height set yet — kept in sync with
 * frontend/src/utils/bannerLayout.ts's copy. */
const DEFAULT_IMAGE_SIZE = { width: 220, height: 270 }

export function bannerElementStyle(el: BannerElement, layout: BannerDeviceLayout, device: BannerDevice): CSSProperties {
  if (el.kind === 'image') {
    const shadow = shadowLevel(el.textShadow)
    return {
      width: cqw(layout.width ?? DEFAULT_IMAGE_SIZE.width, device),
      height: cqw(layout.height ?? DEFAULT_IMAGE_SIZE.height, device),
      borderRadius: cqw(layout.borderRadius ?? 0, device),
      objectFit: 'cover',
      boxShadow: shadow ? shadowCss(shadow) : undefined,
      border: el.borderColor ? `${cqw(layout.borderWidth ?? 1, device)} solid ${el.borderColor}` : undefined,
      transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
    }
  }
  const style: CSSProperties = {
    color: el.color,
    fontFamily: el.fontFamily,
    fontSize: cqw(layout.fontSize, device),
    fontWeight: el.fontWeight === 'bold' ? 700 : 400,
    padding: cqw(layout.padding ?? 0, device),
    borderRadius: cqw(layout.borderRadius ?? 0, device),
    backgroundColor: el.backgroundColor ?? undefined,
    textAlign: el.align === 'center' ? 'center' : undefined,
    transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
    border: el.borderColor ? `${cqw(layout.borderWidth ?? 1, device)} solid ${el.borderColor}` : undefined,
    textShadow: shadowCss(shadowLevel(el.textShadow)),
    // Unset (auto-width, never wraps for a button per .banner-editor__el--button)
    // unless the admin picks an explicit width — then the box honors it and
    // wraps its text inside instead, same as any normal box.
    width: layout.width != null ? cqw(layout.width, device) : undefined,
    whiteSpace: layout.width != null ? 'normal' : undefined,
  }
  if (el.glass) {
    style.backgroundColor = hexToRgba(el.backgroundColor ?? '#ffffff', 0.16)
    style.backdropFilter = 'blur(14px) saturate(160%)'
    style.WebkitBackdropFilter = 'blur(14px) saturate(160%)'
    if (!el.borderColor) style.border = '1px solid rgba(255, 255, 255, 0.35)'
  }
  return style
}

function sameLayouts(l: BannerDeviceLayout): { desktop: BannerDeviceLayout; tablet: BannerDeviceLayout; mobile: BannerDeviceLayout } {
  return { desktop: { ...l }, tablet: { ...l }, mobile: { ...l } }
}

/** The button style used only when SEEDING (a slide's own cta_text, the
 * first time the editor opens for it) — deliberately the plain "pre-editor"
 * look (a slim solid-white pill, single button), independent of whatever
 * the "Clásico" template's own button currently looks like, so opening the
 * editor for a slide the admin already likes doesn't change its width or
 * color out from under them. Explicitly clicking "Clásico" afterward still
 * switches to that template's own (bolder, dual-button) style on purpose. */
const DEFAULT_SEED_BUTTON: TemplatePreset = {
  layout: { xPct: 4, yPct: 88, fontSize: 16, borderRadius: 999, padding: 11 },
  mobileLayout: { yPct: 90 },
  color: '#0d0d0d',
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 'bold',
  backgroundColor: '#ffffff',
}

/** Default elements seeded from a slide's plain fields the first time the
 * visual editor is opened for it, positioned to match the site's pre-editor
 * fixed banner layout (badge/title/subtitle/button clustered bottom-left),
 * so switching to the editor doesn't visually jump. Every device starts
 * linked. */
export function seedBannerElements(fields: {
  badgeText: string
  title: string
  subtitle: string
  ctaText: string
  collectionSlug?: string | null
}): BannerElement[] {
  const elements: BannerElement[] = []
  if (fields.badgeText) {
    elements.push(elementFromPreset('badge', fields.badgeText, CLASSIC_TEMPLATE.badge!))
  }
  elements.push(elementFromPreset('title', fields.title || 'Título', CLASSIC_TEMPLATE.title))
  if (fields.subtitle) {
    elements.push(elementFromPreset('subtitle', fields.subtitle, CLASSIC_TEMPLATE.subtitle!))
  }
  if (fields.ctaText) {
    elements.push({
      ...elementFromPreset('button', fields.ctaText, DEFAULT_SEED_BUTTON),
      linkType: fields.collectionSlug ? 'collection' : 'catalog',
      collectionSlug: fields.collectionSlug ?? null,
    })
  }
  return elements
}

/** Builds one fresh element from a template preset — pulls just the fields
 * BannerElement actually declares out of the preset (which also carries its
 * own `layout`, folded here into `layouts` instead), so no stray keys leak
 * onto the saved element. */
function elementFromPreset(
  kind: BannerElement['kind'],
  text: string,
  preset: TemplatePreset,
  scale: Record<BannerDevice, number> = NO_SCALE
): BannerElement {
  return {
    id: newElementId(),
    kind,
    text,
    color: preset.color,
    fontFamily: preset.fontFamily,
    fontWeight: preset.fontWeight,
    textShadow: preset.textShadow,
    backgroundColor: preset.backgroundColor,
    borderColor: preset.borderColor ?? null,
    align: preset.align,
    linked: true,
    layouts: presetLayouts(preset, scale),
  }
}

const NO_SCALE: Record<BannerDevice, number> = { desktop: 1, tablet: 1, mobile: 1 }

function aspectRatioValue(ratio: string): number {
  const [w, h] = ratio.split('/').map((n) => parseFloat(n.trim()))
  return w / h
}

/** Every template is authored against the tall home-hero shape
 * (DEFAULT_DEVICE_RATIOS) — applying it as-is to a much shorter box (a promo
 * strip is roughly HALF as tall per unit of width) makes the same font size
 * eat a much bigger share of the available height and start overlapping the
 * next element down. This scales font size (and its hugging padding) down
 * proportionally so a template still looks like itself in a shorter box,
 * never scaled past 1 — a box that happens to be TALLER than the hero (e.g.
 * a collection banner) just keeps the size the template was authored at. */
function templateScaleForDevice(
  deviceRatios: Record<BannerDevice, { label: string; ratio: string }> | undefined,
  device: BannerDevice
): number {
  if (!deviceRatios || deviceRatios === DEFAULT_DEVICE_RATIOS) return 1
  const reference = aspectRatioValue(DEFAULT_DEVICE_RATIOS[device].ratio)
  const current = aspectRatioValue(deviceRatios[device].ratio)
  return Math.min(1, reference / current)
}

function templateScale(
  deviceRatios: Record<BannerDevice, { label: string; ratio: string }> | undefined
): Record<BannerDevice, number> {
  return {
    desktop: templateScaleForDevice(deviceRatios, 'desktop'),
    tablet: templateScaleForDevice(deviceRatios, 'tablet'),
    mobile: templateScaleForDevice(deviceRatios, 'mobile'),
  }
}

/** Same layout for desktop/tablet, with `mobileLayout` merged in for mobile
 * only — for a preset whose mobile position/size needs to differ (e.g. to
 * clear the toolbar that floats over the top of the hero on the home page —
 * see .catalog-toolbar's negative margin in Catalog.tsx — which eats a much
 * bigger share of a short mobile hero than of a wide desktop one). `scale`
 * shrinks fontSize/padding per device — see templateScale(). */
function presetLayouts(
  preset: TemplatePreset,
  scale: Record<BannerDevice, number> = NO_SCALE
): { desktop: BannerDeviceLayout; tablet: BannerDeviceLayout; mobile: BannerDeviceLayout } {
  function withScale(layout: BannerDeviceLayout, device: BannerDevice): BannerDeviceLayout {
    const s = scale[device]
    if (s === 1) return layout
    return {
      ...layout,
      fontSize: Math.round(layout.fontSize * s),
      padding: layout.padding != null ? Math.max(2, Math.round(layout.padding * s)) : layout.padding,
    }
  }
  return {
    desktop: withScale({ ...preset.layout }, 'desktop'),
    tablet: withScale({ ...preset.layout }, 'tablet'),
    mobile: withScale({ ...preset.layout, ...preset.mobileLayout }, 'mobile'),
  }
}

function newTextBox(): BannerElement {
  return {
    id: newElementId(),
    kind: 'text',
    text: 'Nuevo texto',
    color: '#ffffff',
    textShadow: 3,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'normal',
    linked: true,
    layouts: sameLayouts({ xPct: 40, yPct: 45, fontSize: 16 }),
  }
}

function newButton(): BannerElement {
  return {
    id: newElementId(),
    kind: 'button',
    text: 'Botón',
    color: '#0d0d0d',
    backgroundColor: '#ffffff',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'bold',
    linkType: 'catalog',
    linked: true,
    layouts: sameLayouts({ xPct: 40, yPct: 84, fontSize: 14, borderRadius: 999, padding: 10 }),
  }
}

const KIND_LABELS: Record<BannerElement['kind'], string> = {
  badge: 'Etiqueta',
  title: 'Título',
  subtitle: 'Subtítulo',
  button: 'Botón',
  text: 'Cuadro de texto',
  plaque: 'Tarjeta de precio',
  image: 'Imagen',
}

/** A photo dropped into the layout, e.g. one of several product shots
 * collaged around the text (like a printed flyer) instead of one single
 * full-bleed background — positioned/resized the same way as any other
 * element, just sized in width/height instead of off a font size. */
function newImageElement(url: string): BannerElement {
  return {
    id: newElementId(),
    kind: 'image',
    text: '',
    imageUrl: url,
    color: '#ffffff',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'normal',
    linked: true,
    layouts: sameLayouts({ xPct: 6, yPct: 6, fontSize: 16, width: 220, height: 270, borderRadius: 10 }),
  }
}

/** A named starting point for the four core elements (badge/title/subtitle/
 * button) — picking one repositions and restyles those, without touching
 * any extra text boxes or extra buttons the admin already added. */
interface TemplatePreset {
  layout: BannerDeviceLayout
  /** Overrides merged into `layout` for mobile only — see presetLayouts(). */
  mobileLayout?: Partial<BannerDeviceLayout>
  align?: 'left' | 'center'
  color: string
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  /** 0-5 (or unset, meaning 0). */
  textShadow?: number
  backgroundColor?: string | null
  borderColor?: string | null
}
interface BannerTemplate {
  id: string
  name: string
  badge?: TemplatePreset
  title: TemplatePreset
  subtitle?: TemplatePreset
  button?: TemplatePreset
  /** An optional second, ghost/outline-style button next to the first (see
   * applyTemplate) — added automatically if the banner doesn't have one yet. */
  secondaryButton?: TemplatePreset
  secondaryButtonText?: string
  /** True only for the one built-in template below — a saved (admin-made)
   * template can be deleted from the picker, this one can't. */
  builtin?: boolean
}

/** The only built-in starting point — badge/title/subtitle/button clustered
 * left, one flat red button, no boxes around the text. Everything else is
 * whatever the admin has saved themselves (see "Guardar como plantilla"
 * below) from a banner they already arranged to their liking, instead of a
 * fixed set of designer-authored looks that don't fit every banner's shape. */
const CLASSIC_TEMPLATE: BannerTemplate = {
  id: 'classic',
  name: 'Clásico',
  builtin: true,
  badge: {
    layout: { xPct: 84, yPct: 9, fontSize: 15, borderRadius: 999, padding: 12 },
    color: '#ffffff',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'bold',
    backgroundColor: '#dc1c18',
  },
  title: {
    layout: { xPct: 4, yPct: 36, fontSize: 50 },
    color: '#ffffff',
    // Anton is already a single heavy weight by design — 'normal' avoids
    // the browser faking an even heavier synthetic bold on top of it.
    fontFamily: "'Anton', sans-serif",
    fontWeight: 'normal',
    textShadow: 0,
    backgroundColor: null,
  },
  subtitle: {
    layout: { xPct: 4, yPct: 56, fontSize: 16 },
    color: '#e2e0db',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'normal',
    backgroundColor: null,
  },
  button: {
    layout: { xPct: 4, yPct: 69, fontSize: 16, borderRadius: 20, padding: 12 },
    color: '#ffffff',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 'bold',
    backgroundColor: '#dc1c18',
  },
}

/** Applies a template to the badge/title/subtitle and the FIRST button —
 * any extra text boxes or extra buttons the admin already added are left
 * exactly where they are, since a template is a starting point for the core
 * elements, not a reset of everything. */
function applyPreset(el: BannerElement, preset: TemplatePreset, scale: Record<BannerDevice, number>): BannerElement {
  return {
    ...el,
    color: preset.color,
    fontFamily: preset.fontFamily,
    fontWeight: preset.fontWeight,
    textShadow: preset.textShadow,
    backgroundColor: preset.backgroundColor,
    borderColor: preset.borderColor ?? null,
    align: preset.align,
    linked: true,
    layouts: presetLayouts(preset, scale),
  }
}

function applyTemplate(
  elements: BannerElement[],
  template: BannerTemplate,
  deviceRatios?: Record<BannerDevice, { label: string; ratio: string }>
): BannerElement[] {
  const scale = templateScale(deviceRatios)
  let buttonApplied = false
  let secondaryButtonApplied = false
  const updated = elements.map((el) => {
    let preset: TemplatePreset | null | undefined = null
    if (el.kind === 'badge') preset = template.badge
    else if (el.kind === 'title') preset = template.title
    else if (el.kind === 'subtitle') preset = template.subtitle
    else if (el.kind === 'button' && !buttonApplied && template.button) {
      preset = template.button
      buttonApplied = true
    } else if (el.kind === 'button' && template.secondaryButton && !secondaryButtonApplied) {
      preset = template.secondaryButton
      secondaryButtonApplied = true
    }
    return preset ? applyPreset(el, preset, scale) : el
  })
  // The template wants a second button (an outline one next to the first,
  // say) but this banner doesn't have one yet — add it instead of silently
  // dropping it, so applying the template still matches its preview.
  if (template.secondaryButton && !secondaryButtonApplied) {
    updated.push(elementFromPreset('button', template.secondaryButtonText ?? 'Ver más', template.secondaryButton, scale))
  }
  return updated
}

/** The inverse of applyPreset — captures one element's current style+layout
 * as a reusable preset. Only records a `mobileLayout` override for whichever
 * fields actually differ from desktop, so a template built from a banner
 * that was left "linked" (same on every device) doesn't carry a pointless
 * full copy of the layout under mobileLayout too. */
function presetFromElement(el: BannerElement): TemplatePreset {
  const desktop = resolveDeviceLayout(el, 'desktop')
  const mobile = resolveDeviceLayout(el, 'mobile')
  const mobileLayout: Record<string, number> = {}
  for (const key of Object.keys(mobile) as (keyof BannerDeviceLayout)[]) {
    if (mobile[key] !== desktop[key] && mobile[key] !== undefined) mobileLayout[key] = mobile[key] as number
  }
  return {
    layout: desktop,
    mobileLayout: Object.keys(mobileLayout).length > 0 ? (mobileLayout as Partial<BannerDeviceLayout>) : undefined,
    align: el.align,
    color: el.color,
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight,
    textShadow: typeof el.textShadow === 'number' ? el.textShadow : undefined,
    backgroundColor: el.backgroundColor,
    borderColor: el.borderColor,
  }
}

/** Builds a saveable template from whichever badge/title/subtitle/button
 * elements a banner currently has — the whole point of "Guardar como
 * plantilla" is reusing a look the admin already arranged on a real banner,
 * instead of picking from a fixed set of designer-authored presets that
 * don't necessarily fit this banner's shape or purpose. Returns null when
 * there's no title (nothing meaningful to save as a starting point). */
function buildTemplateFromElements(elements: BannerElement[]): BannerTemplateData | null {
  const badge = elements.find((el) => el.kind === 'badge')
  const title = elements.find((el) => el.kind === 'title')
  const subtitle = elements.find((el) => el.kind === 'subtitle')
  const buttons = elements.filter((el) => el.kind === 'button')
  if (!title) return null

  const data: BannerTemplateData = { title: presetFromElement(title) }
  if (badge) data.badge = presetFromElement(badge)
  if (subtitle) data.subtitle = presetFromElement(subtitle)
  if (buttons[0]) data.button = presetFromElement(buttons[0])
  if (buttons[1]) {
    data.secondaryButton = presetFromElement(buttons[1])
    data.secondaryButtonText = buttons[1].text
  }
  return data
}

export default function BannerEditor({
  imageUrl,
  elements,
  onChange,
  collections,
  categories,
  onImageChange,
  imageFocus,
  onImageFocusChange,
  imageZoom,
  onImageZoomChange,
  scrimOpacity,
  onScrimOpacityChange,
  imageUrlMobile,
  onImageUrlMobileChange,
  deviceRatios,
}: {
  imageUrl: string
  elements: BannerElement[]
  onChange: (elements: BannerElement[]) => void
  /** Populates the "El botón lleva a" select for kind 'button' elements. */
  collections: Collection[]
  /** Same, for the "Una categoría" link-type option. */
  categories: Category[]
  /** When given, shows a "Recortar imagen" action right in the editor's own
   * toolbar — so cropping the photo and positioning text/buttons over it
   * both happen in the same panel instead of the crop control living
   * somewhere else on the page. */
  onImageChange?: (url: string) => void
  /** Where the photo is anchored within its box (CSS background-position,
   * percent) — defaults to centered (50/50) when omitted. */
  imageFocus?: { x: number; y: number }
  /** When given (together with imageFocus), shows "Mover imagen" sliders so
   * a photo whose important part isn't centered can be re-anchored instead
   * of always cropping from the middle. */
  onImageFocusChange?: (focus: { x: number; y: number }) => void
  /** null (default) = background-size: cover, always filling the box (and
   * cropping whatever doesn't fit its aspect ratio). A number is an explicit
   * background-size percent instead, letting the photo shrink to show the
   * whole thing (revealing solid black around it) instead of being cropped —
   * for a photo whose own aspect ratio doesn't match the banner's box. */
  imageZoom?: number | null
  /** When given (together with imageZoom), shows a "Tamaño de imagen"
   * slider. */
  onImageZoomChange?: (zoom: number | null) => void
  /** null (default) = this placement's own fixed dark gradient over the
   * photo (see .hero-banner__scrim/.package-promo__scrim in index.css). A
   * 0-150 number scales that same gradient's opacity stops — lower to stop
   * a photo looking washed out under the default darkening, higher for more
   * legible text over a busy/light photo. */
  scrimOpacity?: number | null
  /** When given (together with scrimOpacity), shows an "Oscurecer" slider. */
  onScrimOpacityChange?: (opacity: number | null) => void
  /** A single photo's aspect ratio can't look right in both a wide desktop
   * box and a tall/narrow mobile one — this is a separate, optional photo
   * shown only on the "Móvil" tab (both here and on the real site) instead
   * of `imageUrl` there, so the admin can upload a differently cropped shot
   * for that breakpoint. Unset/null falls back to `imageUrl` on mobile too. */
  imageUrlMobile?: string | null
  /** When given, shows an "Imagen para móvil" upload slot. */
  onImageUrlMobileChange?: (url: string | null) => void
  /** Overrides the per-device aspect ratio the canvas previews — defaults to
   * the hero's own shape. Pass COLLECTION_DEVICE_RATIOS for a collection's
   * banner, which is shaped differently on the storefront. */
  deviceRatios?: Record<BannerDevice, { label: string; ratio: string }>
}) {
  const resolvedDeviceRatios = deviceRatios ?? DEFAULT_DEVICE_RATIOS
  const [savedTemplates, setSavedTemplates] = useState<BannerTemplateRecord[]>([])
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  useEffect(() => {
    api.getBannerTemplates().then(setSavedTemplates).catch(() => {})
  }, [])

  async function handleSaveTemplate() {
    const name = saveName.trim()
    if (!name) return
    const preset = buildTemplateFromElements(elements)
    if (!preset) return
    setSavingTemplate(true)
    try {
      const created = await api.createBannerTemplate({ name, preset })
      setSavedTemplates((prev) => [...prev, created])
      setShowSaveForm(false)
      setSaveName('')
    } catch {
      // Silent — the admin can just try again from the still-open form.
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteTemplate(id: number) {
    setSavedTemplates((prev) => prev.filter((t) => t.id !== id))
    await api.deleteBannerTemplate(id).catch(() => {})
  }

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  // Double-click puts one element's text directly into edit mode — see the
  // contentEditable div below. Committed on blur (not on every keystroke),
  // which sidesteps the classic "React fights the cursor" contentEditable
  // problem, since `elements` doesn't change (so nothing re-renders the
  // node's children) until editing actually ends.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [device, setDevice] = useState<BannerDevice>('desktop')
  // Guide line(s) currently showing while dragging — shown (and snapped to)
  // when the dragged element's own edge/center lines up with the canvas
  // middle OR with another element's edge/center, Canva/Figma-style ("smart
  // guides"). null = that axis has no active guide right now.
  const [snapGuides, setSnapGuides] = useState<{ xPct: number | null; yPct: number | null }>({ xPct: null, yPct: null })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ id: string; offsetXPct: number; offsetYPct: number; widthPct: number; heightPct: number } | null>(null)
  // Dragging the width handle on a text/button/badge/title/subtitle element
  // (see the "manija" rendered only on the selected element below) —
  // separate from dragState since a resize and a move never happen at once,
  // but both are driven by pointermove on the same canvas.
  const resizeState = useRef<{ id: string; startWidthPx: number; startPointerXPct: number } | null>(null)
  // One DOM node per rendered element, so a drag can read every OTHER
  // element's actual on-screen position/size (already accounting for its
  // own align/transform) to compare against for the guides.
  const elNodesRef = useRef<Map<string, HTMLDivElement>>(new Map())
  function setElNode(id: string, node: HTMLDivElement | null) {
    if (node) elNodesRef.current.set(id, node)
    else elNodesRef.current.delete(id)
  }

  const selected = elements.find((el) => el.id === selectedId) ?? null
  // Drives the "Desvincular"/"Vincular todos" buttons' own active state and
  // the persistent status line below them — otherwise the only feedback
  // that unlinking actually did something was the per-element toggle icon,
  // invisible unless that exact element happened to be selected.
  const unlinkedCount = elements.filter((el) => el.linked === false).length

  function updateElement(id: string, changes: Partial<BannerElement>) {
    onChange(elements.map((el) => (el.id === id ? { ...el, ...changes } : el)))
  }

  /** Writes a position/size change for the currently active device. When
   * linked (the default), the same change applies to all three devices —
   * otherwise only the active one moves/resizes. */
  function updateDeviceLayout(id: string, changes: Partial<BannerDeviceLayout>) {
    onChange(
      elements.map((el) => {
        if (el.id !== id) return el
        const current = resolveDeviceLayout(el, device)
        const nextLayout = { ...current, ...changes }
        if (el.linked !== false) return { ...el, layouts: sameLayouts(nextLayout) }
        const layouts = el.layouts ?? sameLayouts(current)
        return { ...el, layouts: { ...layouts, [device]: nextLayout } }
      })
    )
  }

  /** Toggling "vincular" back on picks the currently active device's layout
   * as the one that now applies everywhere — otherwise linked=true with
   * three different stored layouts would be a contradiction. */
  function setLinked(id: string, linked: boolean) {
    onChange(
      elements.map((el) => {
        if (el.id !== id) return el
        if (!linked) return { ...el, linked: false }
        return { ...el, linked: true, layouts: sameLayouts(resolveDeviceLayout(el, device)) }
      })
    )
  }

  /** Unlinks every element at once (from whichever device tab is active),
   * so each can then be moved/resized per device without doing it one
   * element at a time. Current values are already identical across devices
   * while linked, so this is a pure mode switch — nothing moves yet. */
  function unlinkAll() {
    onChange(elements.map((el) => ({ ...el, linked: false })))
  }

  /** The inverse — re-syncs every element back to a single shared layout,
   * taken from whichever device tab is active right now. */
  function linkAll() {
    onChange(elements.map((el) => ({ ...el, linked: true, layouts: sameLayouts(resolveDeviceLayout(el, device)) })))
  }

  function removeElement(id: string) {
    onChange(elements.filter((el) => el.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function addTextBox() {
    const el = newTextBox()
    onChange([...elements, el])
    setSelectedId(el.id)
  }

  function addButton() {
    const el = newButton()
    onChange([...elements, el])
    setSelectedId(el.id)
  }

  function addImage(url: string) {
    const el = newImageElement(url)
    onChange([...elements, el])
    setSelectedId(el.id)
  }

  async function handleCropSave(blob: Blob) {
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const { url } = await api.uploadImage(file)
    onImageChange?.(url)
    setCropping(false)
  }

  function clampPct(v: number) {
    return Math.max(0, Math.min(96, v))
  }

  /** Detected manually (not via onDoubleClick) — starting a drag on the
   * very first pointerdown (needed so a single press-and-move drags
   * immediately) otherwise beats the browser's native dblclick timing and
   * can nudge the element just enough that the second click misses it. */
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const DOUBLE_CLICK_MS = 400

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, el: BannerElement) {
    e.stopPropagation()
    setSelectedId(el.id)

    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === el.id && now - last.time < DOUBLE_CLICK_MS) {
      lastClickRef.current = null
      setEditingId(el.id)
      return
    }
    lastClickRef.current = { id: el.id, time: now }

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100
    const layout = resolveDeviceLayout(el, device)
    // Captured once at drag start (not re-measured every move) — the
    // element's own rendered size, as a % of the canvas, so its actual
    // CENTER (not just its xPct/yPct anchor corner) can be checked against
    // the canvas middle for the snap guides below.
    const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragState.current = {
      id: el.id,
      offsetXPct: pointerXPct - layout.xPct,
      offsetYPct: pointerYPct - layout.yPct,
      widthPct: (elRect.width / rect.width) * 100,
      heightPct: (elRect.height / rect.height) * 100,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  /** Starts dragging the width handle — reads the element's CURRENT rendered
   * width (whether it came from an explicit layout.width or was left to
   * auto-size around its text) as the starting point, converted back to the
   * same reference-px unit layout.width is stored in, so the drag can just
   * add the pointer's percent-of-canvas delta on top of it. */
  function handleResizePointerDown(e: ReactPointerEvent<HTMLSpanElement>, el: BannerElement) {
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
    const node = elNodesRef.current.get(el.id)
    const domRect = node?.getBoundingClientRect()
    const widthPct = domRect ? (domRect.width / rect.width) * 100 : 10
    resizeState.current = {
      id: el.id,
      startWidthPx: (widthPct / 100) * BANNER_REFERENCE_WIDTHS[device],
      startPointerXPct: pointerXPct,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  /** How close (in % of canvas size) an edge/center needs to be to a guide
   * candidate before it snaps there and the guide line shows. */
  const SNAP_THRESHOLD_PCT = 1.5

  /** Every other element's left/center/right edge (as % of canvas width)
   * and top/center/bottom edge (as % of canvas height) — read from their
   * actual rendered position, which already accounts for their own align/
   * transform, so this works regardless of how each one is anchored. */
  function otherElementEdges(draggedId: string, rect: DOMRect) {
    const xs: number[] = []
    const ys: number[] = []
    for (const other of elements) {
      if (other.id === draggedId) continue
      const node = elNodesRef.current.get(other.id)
      if (!node) continue
      const r = node.getBoundingClientRect()
      const leftPct = ((r.left - rect.left) / rect.width) * 100
      const widthPct = (r.width / rect.width) * 100
      const topPct = ((r.top - rect.top) / rect.height) * 100
      const heightPct = (r.height / rect.height) * 100
      xs.push(leftPct, leftPct + widthPct / 2, leftPct + widthPct)
      ys.push(topPct, topPct + heightPct / 2, topPct + heightPct)
    }
    return { xs, ys }
  }

  /** Checks `value` against every candidate for a close-enough match, and
   * if found, returns the candidate to snap to. */
  function findSnap(value: number, candidates: number[]): number | null {
    for (const c of candidates) {
      if (Math.abs(value - c) < SNAP_THRESHOLD_PCT) return c
    }
    return null
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeState.current
    if (resize) {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
      const deltaPct = pointerXPct - resize.startPointerXPct
      const deltaPx = (deltaPct / 100) * BANNER_REFERENCE_WIDTHS[device]
      const newWidth = Math.max(20, Math.min(1400, Math.round(resize.startWidthPx + deltaPx)))
      updateDeviceLayout(resize.id, { width: newWidth })
      return
    }

    const drag = dragState.current
    const container = containerRef.current
    if (!drag || !container) return
    const rect = container.getBoundingClientRect()
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100
    let xPct = clampPct(pointerXPct - drag.offsetXPct)
    let yPct = clampPct(pointerYPct - drag.offsetYPct)

    const el = elements.find((e2) => e2.id === drag.id)
    const centered = el?.align === 'center'
    // The dragged element's own left/center/right edge and top/center/
    // bottom edge, in canvas %, before any snapping — for a centered
    // element xPct already IS its horizontal center (it's rendered with
    // translateX(-50%)); for a left-anchored one it's the left edge.
    const left = centered ? xPct - drag.widthPct / 2 : xPct
    const centerX = centered ? xPct : xPct + drag.widthPct / 2
    const right = left + drag.widthPct
    const top = yPct
    const centerY = yPct + drag.heightPct / 2
    const bottom = yPct + drag.heightPct

    const { xs, ys } = otherElementEdges(drag.id, rect)
    // Canvas center is always a candidate too, alongside every other
    // element's edges/center — checked in this order (own center first)
    // since centering is the most common intent.
    const xCandidates = [50, ...xs]
    const yCandidates = [50, ...ys]

    let guideXPct: number | null = null
    const snapCenterX = findSnap(centerX, xCandidates)
    const snapLeft = snapCenterX == null ? findSnap(left, xCandidates) : null
    const snapRight = snapCenterX == null && snapLeft == null ? findSnap(right, xCandidates) : null
    if (snapCenterX != null) {
      xPct = centered ? snapCenterX : snapCenterX - drag.widthPct / 2
      guideXPct = snapCenterX
    } else if (snapLeft != null) {
      xPct = centered ? snapLeft + drag.widthPct / 2 : snapLeft
      guideXPct = snapLeft
    } else if (snapRight != null) {
      xPct = centered ? snapRight - drag.widthPct / 2 : snapRight - drag.widthPct
      guideXPct = snapRight
    }

    let guideYPct: number | null = null
    const snapCenterY = findSnap(centerY, yCandidates)
    const snapTop = snapCenterY == null ? findSnap(top, yCandidates) : null
    const snapBottom = snapCenterY == null && snapTop == null ? findSnap(bottom, yCandidates) : null
    if (snapCenterY != null) {
      yPct = snapCenterY - drag.heightPct / 2
      guideYPct = snapCenterY
    } else if (snapTop != null) {
      yPct = snapTop
      guideYPct = snapTop
    } else if (snapBottom != null) {
      yPct = snapBottom - drag.heightPct
      guideYPct = snapBottom
    }

    setSnapGuides({ xPct: guideXPct, yPct: guideYPct })
    updateDeviceLayout(drag.id, { xPct: clampPct(xPct), yPct: clampPct(yPct) })
  }

  function handlePointerUp() {
    dragState.current = null
    resizeState.current = null
    setSnapGuides({ xPct: null, yPct: null })
  }

  const selectedLayout = selected ? resolveDeviceLayout(selected, device) : null

  return (
    <div className="banner-editor">
      <div className="banner-editor__templates">
        <span className="banner-editor__templates-label">
          <GridIcon width={16} height={16} /> Plantilla:
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onChange(applyTemplate(elements, CLASSIC_TEMPLATE, deviceRatios))}
        >
          {CLASSIC_TEMPLATE.name}
        </button>
        {savedTemplates.map((t) => (
          <span key={t.id} className="banner-editor__saved-template">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onChange(applyTemplate(elements, { id: `saved-${t.id}`, name: t.name, ...t.preset_json }, deviceRatios))}
            >
              {t.name}
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--ghost banner-editor__saved-template-delete"
              onClick={() => handleDeleteTemplate(t.id)}
              aria-label={`Eliminar plantilla ${t.name}`}
              title="Eliminar plantilla"
            >
              <TrashIcon width={13} height={13} />
            </button>
          </span>
        ))}
        {showSaveForm ? (
          <form
            className="banner-editor__save-template-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveTemplate()
            }}
          >
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Nombre de la plantilla"
              autoFocus
            />
            <button type="submit" className="btn btn--accent btn--sm" disabled={savingTemplate || !saveName.trim()}>
              Guardar
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setShowSaveForm(false)
                setSaveName('')
              }}
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowSaveForm(true)}>
            + Guardar como plantilla
          </button>
        )}
        <p className="page-block__hint">
          Reacomoda etiqueta, título, subtítulo y botón principal a un diseño ya armado — puedes seguir ajustando
          cada uno después. No mueve cuadros de texto ni botones extra que ya hayas agregado. Cuando dejes uno como
          te gusta, guárdalo como plantilla para reusarlo en otros banners.
        </p>
      </div>

      <div className="banner-editor__device-tabs">
        {DEVICE_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            className={`banner-editor__device-tab ${device === d ? 'banner-editor__device-tab--active' : ''}`}
            onClick={() => setDevice(d)}
          >
            {resolvedDeviceRatios[d].label}
          </button>
        ))}
        <span className="banner-editor__device-tabs-sep" />
        <button
          type="button"
          className={`btn btn--ghost btn--sm ${unlinkedCount > 0 ? 'banner-editor__toolbar-btn--active' : ''}`}
          onClick={unlinkAll}
          title="Desvincula todos los elementos de una vez, para mover/redimensionar cada dispositivo por separado"
        >
          <UnlinkIcon width={14} height={14} /> Desvincular {resolvedDeviceRatios[device].label} de todos
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={linkAll}
          title={`Vuelve a usar la misma posición y tamaño de ${resolvedDeviceRatios[device].label} en los tres dispositivos, para todos los elementos`}
        >
          <LinkIcon width={14} height={14} /> Vincular todos
        </button>
        {unlinkedCount > 0 && (
          <span className="banner-editor__unlink-status">
            <UnlinkIcon width={13} height={13} />
            {unlinkedCount === elements.length
              ? 'Todo desvinculado'
              : `${unlinkedCount} de ${elements.length} desvinculados`}{' '}
            — cada dispositivo se edita por separado
          </span>
        )}
        {onImageChange && (
          <>
            <span className="banner-editor__device-tabs-sep" />
            <ImageUploader variant="inline" label="Cambiar imagen" sizeHint={imageSizeHint(deviceRatios, device)} onUploaded={onImageChange} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCropping(true)}>
              <CropIcon width={14} height={14} /> Recortar imagen
            </button>
          </>
        )}
      </div>

      {onImageUrlMobileChange && device === 'mobile' && (
        <div className="banner-editor__device-tabs">
          <span
            className="banner-editor__templates-label"
            title="Una sola foto no siempre se ve bien tanto en un banner ancho de escritorio como en uno angosto de móvil — sube aquí una versión recortada específicamente para móvil (opcional). Si no subes nada, se usa la misma foto de arriba."
          >
            Imagen para móvil (opcional):
          </span>
          <ImageUploader
            variant="inline"
            label={imageUrlMobile ? 'Cambiar' : '+ Subir para móvil'}
            sizeHint={imageSizeHint(deviceRatios, 'mobile')}
            onUploaded={onImageUrlMobileChange}
          />
          {imageUrlMobile && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onImageUrlMobileChange(null)}>
              Quitar (usar la de escritorio)
            </button>
          )}
        </div>
      )}

      {onImageFocusChange && (
        <div className="banner-editor__device-tabs">
          <span className="banner-editor__templates-label">
            <MoveIcon width={16} height={16} /> Posición de la imagen:
          </span>
          <label className="banner-editor__toolbar-num" title="Horizontal">
            H
            <input
              type="range"
              min="0"
              max="100"
              value={imageFocus?.x ?? 50}
              onChange={(e) => onImageFocusChange({ x: Number(e.target.value), y: imageFocus?.y ?? 50 })}
            />
          </label>
          <label className="banner-editor__toolbar-num" title="Vertical">
            V
            <input
              type="range"
              min="0"
              max="100"
              value={imageFocus?.y ?? 50}
              onChange={(e) => onImageFocusChange({ x: imageFocus?.x ?? 50, y: Number(e.target.value) })}
            />
          </label>
          {(imageFocus?.x !== 50 || imageFocus?.y !== 50) && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onImageFocusChange({ x: 50, y: 50 })}>
              Centrar
            </button>
          )}
          {onImageZoomChange && (
            <>
              <label className="banner-editor__toolbar-num" title="Tamaño de la foto dentro del cuadro — bájalo si se recorta y quieres verla completa">
                Tamaño
                <input
                  type="range"
                  min="30"
                  max="150"
                  value={imageZoom && imageZoom > 0 ? imageZoom : 100}
                  onChange={(e) => onImageZoomChange(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                title="Ajusta la foto para que se vea COMPLETA sin recortar, en cualquier tamaño de pantalla — deja franjas del fondo a los lados o arriba/abajo donde no alcanza a llenar el cuadro. Recomendado si la foto tiene texto o precios que no deben cortarse (ej. un flyer)."
                className={`btn btn--ghost btn--sm ${imageZoom === 0 ? 'banner-editor__toolbar-btn--active' : ''}`}
                onClick={() => onImageZoomChange(imageZoom === 0 ? null : 0)}
              >
                Ajustar completa
              </button>
              {imageZoom != null && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onImageZoomChange(null)}>
                  Restablecer
                </button>
              )}
            </>
          )}
          {onScrimOpacityChange && (
            <>
              <label className="banner-editor__toolbar-num" title="Qué tan oscurecida se ve la foto detrás del texto — bájalo si se ve muy tenue/opaca, súbelo si el texto no se lee bien">
                <span style={{ fontSize: 11, fontWeight: 600 }}>Oscurecer</span>
                <input
                  type="range"
                  min="0"
                  max="150"
                  value={scrimOpacity ?? 100}
                  onChange={(e) => onScrimOpacityChange(Number(e.target.value))}
                />
              </label>
              {scrimOpacity != null && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onScrimOpacityChange(null)}>
                  Restablecer
                </button>
              )}
            </>
          )}
        </div>
      )}
      {onImageZoomChange && imageZoom === 0 && (
        <p className="page-block__hint" style={{ marginTop: -6 }}>
          "Ajustar completa" activo: la foto se ve entera en todos los tamaños de pantalla (móvil, tablet, escritorio),
          incluso si su forma no coincide con la del banner — deja franjas del fondo donde no alcanza a cubrir.
        </p>
      )}
      {onImageZoomChange && imageZoom != null && imageZoom !== 0 && (
        <p className="page-block__hint" style={{ marginTop: -6 }}>
          Con un tamaño menor a 100% se ve más foto (menos recorte), dejando fondo negro alrededor donde no alcanza a
          cubrir el cuadro — pero esto no se ajusta solo por tamaño de pantalla; si tu foto es muy distinta de forma al
          banner (como un flyer), usa "Ajustar completa" en vez de este control.
        </p>
      )}

      {cropping && onImageChange && (
        <ImageCropModal imageUrl={imageUrl} onCancel={() => setCropping(false)} onSave={handleCropSave} />
      )}

      {/* Canva-style compact icon toolbar for the selected element, right
          above the canvas — replaces a long vertical form of labeled
          fields with icon buttons/inline controls grouped by what they do.
          Always rendered (even with nothing selected, as an empty-state
          hint instead) so the canvas below never shifts position the
          moment something gets selected — otherwise a real double-click
          can miss its second click entirely, since the layout reflow from
          the toolbar appearing moves the target out from under the
          still-stationary cursor between the two clicks. */}
      <div className="banner-editor__toolbar" role="toolbar" aria-label="Estilo del elemento">
        {selected && selectedLayout ? (
          <>
          {selected.kind === 'plaque' ? (
            <div className="banner-editor__toolbar-group">
              <label className="banner-editor__toolbar-num" title="Tamaño de la tarjeta">
                <TextSizeIcon width={16} height={16} />
                <input
                  type="number"
                  min="16"
                  max="96"
                  value={selectedLayout.fontSize}
                  onChange={(e) => updateDeviceLayout(selected.id, { fontSize: Number(e.target.value) || selectedLayout.fontSize })}
                />
              </label>
            </div>
          ) : selected.kind === 'image' ? (
            <>
              <div className="banner-editor__toolbar-group">
                <label className="banner-editor__toolbar-num" title="Ancho">
                  <span style={{ fontSize: 11, fontWeight: 600 }}>An.</span>
                  <input
                    type="number"
                    min="20"
                    max="1400"
                    value={selectedLayout.width ?? 220}
                    onChange={(e) => updateDeviceLayout(selected.id, { width: Number(e.target.value) || selectedLayout.width })}
                  />
                </label>
                <label className="banner-editor__toolbar-num" title="Alto">
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Al.</span>
                  <input
                    type="number"
                    min="20"
                    max="1400"
                    value={selectedLayout.height ?? 270}
                    onChange={(e) => updateDeviceLayout(selected.id, { height: Number(e.target.value) || selectedLayout.height })}
                  />
                </label>
                <label className="banner-editor__toolbar-num" title="Redondeado (0 = cuadrado, alto = píldora)">
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Radio</span>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={selectedLayout.borderRadius ?? 0}
                    onChange={(e) => updateDeviceLayout(selected.id, { borderRadius: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="banner-editor__toolbar-num" title="Nivel de sombra (0 = sin sombra, 5 = máxima)">
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Sombra</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={shadowLevel(selected.textShadow)}
                    onChange={(e) =>
                      updateElement(selected.id, { textShadow: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })
                    }
                  />
                </label>
              </div>
              <div className="banner-editor__toolbar-group">
                <button
                  type="button"
                  title="Con borde"
                  className={`banner-editor__toolbar-btn banner-editor__toolbar-btn--labeled ${selected.borderColor != null ? 'banner-editor__toolbar-btn--active' : ''}`}
                  onClick={() => updateElement(selected.id, { borderColor: selected.borderColor != null ? null : '#ffffff' })}
                >
                  <BorderBoxIcon width={16} height={16} /> Borde
                </button>
                {selected.borderColor != null && (
                  <>
                    <input
                      type="color"
                      className="banner-editor__toolbar-color-only"
                      value={selected.borderColor}
                      onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                      title="Color del borde"
                    />
                    <label className="banner-editor__toolbar-num" title="Grosor del borde">
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={selectedLayout.borderWidth ?? 2}
                        onChange={(e) => updateDeviceLayout(selected.id, { borderWidth: Number(e.target.value) || 1 })}
                      />
                    </label>
                  </>
                )}
                <ImageUploader
                  variant="inline"
                  label="Reemplazar foto"
                  onUploaded={(url) => updateElement(selected.id, { imageUrl: url })}
                />
              </div>
            </>
          ) : (
          <div className="banner-editor__toolbar-group">
            <select
              className="banner-editor__toolbar-select"
              value={selected.fontFamily}
              onChange={(e) => updateElement(selected.id, { fontFamily: e.target.value })}
              title="Fuente"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <label className="banner-editor__toolbar-num" title="Tamaño de texto">
              <TextSizeIcon width={16} height={16} />
              <input
                type="number"
                min="8"
                max="96"
                value={selectedLayout.fontSize}
                onChange={(e) => updateDeviceLayout(selected.id, { fontSize: Number(e.target.value) || selectedLayout.fontSize })}
              />
            </label>
            <button
              type="button"
              title="Negrita"
              className={`banner-editor__toolbar-btn ${selected.fontWeight === 'bold' ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}
            >
              <BoldIcon width={16} height={16} />
            </button>
            <label className="banner-editor__toolbar-swatch" title="Color de texto">
              <FontIcon width={16} height={16} />
              <input type="color" value={selected.color} onChange={(e) => updateElement(selected.id, { color: e.target.value })} />
            </label>
            <label className="banner-editor__toolbar-num" title="Nivel de sombra de texto (0 = sin sombra, 5 = máxima)">
              <span style={{ fontSize: 11, fontWeight: 600 }}>Sombra</span>
              <input
                type="number"
                min="0"
                max="5"
                value={shadowLevel(selected.textShadow)}
                onChange={(e) =>
                  updateElement(selected.id, { textShadow: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })
                }
              />
            </label>
          </div>
          )}

          {selected.kind !== 'plaque' && (
          <div className="banner-editor__toolbar-group">
            <button
              type="button"
              title="Alinear a la izquierda"
              className={`banner-editor__toolbar-btn ${selected.align !== 'center' ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { align: 'left' })}
            >
              <AlignLeftIcon width={16} height={16} />
            </button>
            <button
              type="button"
              title="Centrar"
              className={`banner-editor__toolbar-btn ${selected.align === 'center' ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { align: 'center' })}
            >
              <AlignCenterIcon width={16} height={16} />
            </button>
          </div>
          )}

          {selected.kind !== 'plaque' && selected.kind !== 'image' && (
          <div className="banner-editor__toolbar-group">
            <button
              type="button"
              title="Con fondo — un color sólido detrás del texto"
              className={`banner-editor__toolbar-btn banner-editor__toolbar-btn--labeled ${selected.backgroundColor != null ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { backgroundColor: selected.backgroundColor != null ? null : '#ffffff' })}
            >
              <FillBoxIcon width={16} height={16} /> Fondo
            </button>
            {selected.backgroundColor != null && (
              <input
                type="color"
                className="banner-editor__toolbar-color-only"
                value={selected.backgroundColor}
                onChange={(e) => updateElement(selected.id, { backgroundColor: e.target.value })}
                title="Tono del fondo"
              />
            )}
            <button
              type="button"
              title='Vidrio esmerilado estilo iOS — fondo translúcido con desenfoque, en vez de un color sólido. Usa el tono de "Con fondo" (o blanco si no hay ninguno) como base.'
              className={`banner-editor__toolbar-btn banner-editor__toolbar-btn--labeled ${selected.glass ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { glass: !selected.glass })}
            >
              <DropletIcon width={16} height={16} /> Vidrio
            </button>
            <button
              type="button"
              title='Con borde — solo el contorno, sin relleno (deja "Fondo" apagado)'
              className={`banner-editor__toolbar-btn banner-editor__toolbar-btn--labeled ${selected.borderColor != null ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => updateElement(selected.id, { borderColor: selected.borderColor != null ? null : '#ffffff' })}
            >
              <BorderBoxIcon width={16} height={16} /> Borde
            </button>
            {selected.borderColor != null && (
              <>
                <input
                  type="color"
                  className="banner-editor__toolbar-color-only"
                  value={selected.borderColor}
                  onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                  title="Color del borde"
                />
                <label className="banner-editor__toolbar-num" title="Grosor del borde">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={selectedLayout.borderWidth ?? 2}
                    onChange={(e) => updateDeviceLayout(selected.id, { borderWidth: Number(e.target.value) || 1 })}
                  />
                </label>
              </>
            )}
            <label className="banner-editor__toolbar-num" title="Redondeado (0 = cuadrado, alto = píldora)">
              <span style={{ fontSize: 11, fontWeight: 600 }}>Radio</span>
              <input
                type="number"
                min="0"
                max="999"
                value={selectedLayout.borderRadius ?? 0}
                onChange={(e) => updateDeviceLayout(selected.id, { borderRadius: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="banner-editor__toolbar-num" title="Espaciado interno — el aire entre el texto y su fondo/borde">
              <span style={{ fontSize: 11, fontWeight: 600 }}>Espacio</span>
              <input
                type="number"
                min="0"
                max="60"
                value={selectedLayout.padding ?? 0}
                onChange={(e) => updateDeviceLayout(selected.id, { padding: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          )}

          <div className="banner-editor__toolbar-group">
            <button
              type="button"
              title={selected.linked !== false ? 'Vinculado en los tres dispositivos — clic para editar cada uno por separado' : 'Desvinculado — clic para volver a usar la misma posición y tamaño en los tres'}
              className={`banner-editor__toolbar-btn ${selected.linked !== false ? 'banner-editor__toolbar-btn--active' : ''}`}
              onClick={() => setLinked(selected.id, selected.linked === false)}
            >
              {selected.linked !== false ? <LinkIcon width={16} height={16} /> : <UnlinkIcon width={16} height={16} />}
            </button>
            <button type="button" title="Eliminar" className="banner-editor__toolbar-btn" onClick={() => removeElement(selected.id)}>
              <TrashIcon width={16} height={16} />
            </button>
          </div>
          </>
        ) : (
          <p className="page-block__hint">Selecciona un elemento para editar su estilo.</p>
        )}
      </div>

      {selected?.linked === false && (
        <p className="page-block__hint" style={{ marginTop: -6 }}>
          Editando solo {resolvedDeviceRatios[device].label} — cambia de pestaña arriba para ajustar los otros tamaños por
          separado.
        </p>
      )}

      <div
        className="banner-editor__canvas-wrap"
        style={{
          width: DEVICE_PREVIEW_WIDTHS[device],
          aspectRatio: resolvedDeviceRatios[device].ratio,
          margin: '0 auto',
        }}
      >
        <div
          ref={containerRef}
          className="banner-editor__canvas"
          style={{
            backgroundImage: `url(${device === 'mobile' && imageUrlMobile ? imageUrlMobile : imageUrl})`,
            backgroundPosition: `${imageFocus?.x ?? 50}% ${imageFocus?.y ?? 50}%`,
            backgroundSize: imageZoom === 0 ? 'contain' : imageZoom != null ? `${imageZoom}%` : 'cover',
            backgroundColor: '#0d0d0d',
            aspectRatio: resolvedDeviceRatios[device].ratio,
            // Rendered at its full real-world reference width (laid out and
            // hinted exactly like the real site would be) and then visually
            // shrunk to fit the smaller preview box above via a pure
            // repaint-time scale — see DEVICE_PREVIEW_WIDTHS for why this
            // (not a smaller CSS width) is what keeps it pixel-accurate.
            width: BANNER_REFERENCE_WIDTHS[device],
            transform: `scale(${DEVICE_PREVIEW_WIDTHS[device] / BANNER_REFERENCE_WIDTHS[device]})`,
            transformOrigin: 'top left',
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={(e) => {
            // A click on an element itself still bubbles up here (stopping
            // the pointerdown's propagation doesn't stop the separate click
            // event) — only deselect when the canvas background itself was
            // clicked.
            if (e.target === e.currentTarget) setSelectedId(null)
          }}
        >
        <div className="banner-editor__scrim" style={{ background: scrimGradient(deviceRatios, scrimOpacity ?? 100) }} />
        {snapGuides.xPct != null && (
          <div className="banner-editor__guide banner-editor__guide--v" style={{ left: `${snapGuides.xPct}%` }} />
        )}
        {snapGuides.yPct != null && (
          <div className="banner-editor__guide banner-editor__guide--h" style={{ top: `${snapGuides.yPct}%` }} />
        )}
        {elements.map((el) => {
          const layout = resolveDeviceLayout(el, device)
          const editing = el.id === editingId
          if (el.kind === 'image') {
            return (
              <img
                key={el.id}
                ref={(node) => setElNode(el.id, node)}
                src={el.imageUrl ?? ''}
                alt=""
                draggable={false}
                className={`banner-editor__el banner-editor__el--image ${el.id === selectedId ? 'banner-editor__el--selected' : ''}`}
                style={{ left: `${layout.xPct}%`, top: `${layout.yPct}%`, ...bannerElementStyle(el, layout, device) }}
                onPointerDown={(e) => handlePointerDown(e, el)}
              />
            )
          }
          if (el.kind === 'plaque') {
            // A composite, three-line card (see .banner-editor__plaque in
            // index.css — the same "flyer" look as .tier-card__plaque on the
            // catalog page) instead of a single text node — its own text
            // fields are edited from the panel below, not inline.
            return (
              <div
                key={el.id}
                ref={(node) => setElNode(el.id, node)}
                className={`banner-editor__plaque ${el.id === selectedId ? 'banner-editor__el--selected' : ''}`}
                style={{
                  left: `${layout.xPct}%`,
                  top: `${layout.yPct}%`,
                  fontSize: cqw(layout.fontSize, device),
                  transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
                }}
                onPointerDown={(e) => handlePointerDown(e, el)}
              >
                <p className="banner-editor__plaque-range">{el.text || 'Paquete de 4 Playeras'}</p>
                <p className="banner-editor__plaque-price">{el.priceText || '$0'}</p>
                {el.captionText && <p className="banner-editor__plaque-caption">{el.captionText}</p>}
              </div>
            )
          }
          return (
            <div
              key={el.id}
              ref={(node) => setElNode(el.id, node)}
              className={`banner-editor__el ${el.kind === 'button' ? 'banner-editor__el--button' : ''} ${el.id === selectedId ? 'banner-editor__el--selected' : ''} ${editing ? 'banner-editor__el--editing' : ''}`}
              style={{ left: `${layout.xPct}%`, top: `${layout.yPct}%`, ...bannerElementStyle(el, layout, device) }}
              contentEditable={editing}
              suppressContentEditableWarning
              onPointerDown={(e) => {
                if (!editing) handlePointerDown(e, el)
              }}
              onBlur={(e) => {
                if (!editing) return
                // innerText (not textContent) — it turns manual line breaks
                // (each its own <div>/<br> once the browser handles Enter)
                // back into literal "\n" characters instead of losing them.
                updateElement(el.id, { text: e.currentTarget.innerText ?? '' })
                setEditingId(null)
              }}
              onKeyDown={(e) => {
                if (!editing) return
                // Enter now inserts a real line break (its default
                // contentEditable behavior) instead of committing — Escape
                // commits/exits instead.
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
            >
              {el.text || KIND_LABELS[el.kind]}
              {el.id === selectedId && !editing && (
                <span
                  className="banner-editor__resize-handle"
                  title="Arrastra para cambiar el ancho"
                  onPointerDown={(e) => handleResizePointerDown(e, el)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          )
        })}
        </div>
      </div>

      <div className="banner-editor__toolbar banner-editor__toolbar--below">
        <button type="button" className="btn btn--ghost btn--sm" onClick={addTextBox}>
          + Agregar cuadro de texto
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={addButton}>
          + Agregar botón
        </button>
        <ImageUploader variant="inline" label="+ Agregar imagen" onUploaded={addImage} />
        <p className="page-block__hint">
          Arrastra cualquier elemento para moverlo. Haz clic para editar su estilo, doble clic para editar el texto
          directamente ahí. Usa "+ Agregar imagen" para hacer un collage de varias fotos, como un flyer.
        </p>
      </div>

      {selected && selected.kind !== 'image' && (
        <div className="banner-editor__text-row">
          {selected.kind === 'plaque' ? (
            <div className="form-grid">
              <label className="form-field">
                Línea del paquete
                <input value={selected.text} onChange={(e) => updateElement(selected.id, { text: e.target.value })} placeholder="Paquete de 4 Playeras" />
              </label>
              <label className="form-field">
                Precio
                <input
                  value={selected.priceText ?? ''}
                  onChange={(e) => updateElement(selected.id, { priceText: e.target.value })}
                  placeholder="$1,360"
                />
              </label>
              <label className="form-field">
                Leyenda (opcional)
                <input
                  value={selected.captionText ?? ''}
                  onChange={(e) => updateElement(selected.id, { captionText: e.target.value })}
                  placeholder="(Cada prenda a $340 c/u)"
                />
              </label>
            </div>
          ) : (
          <label className="form-field">
            Texto — {KIND_LABELS[selected.kind]}
            <input value={selected.text} onChange={(e) => updateElement(selected.id, { text: e.target.value })} />
          </label>
          )}

          {selected.kind === 'button' && (
            <div className="form-grid">
              <label className="form-field">
                El botón lleva a
                <select
                  value={selected.linkType ?? 'catalog'}
                  onChange={(e) => {
                    const linkType = e.target.value as NonNullable<BannerElement['linkType']>
                    updateElement(selected.id, { linkType, collectionSlug: null, categorySlug: null, url: null })
                  }}
                >
                  <option value="catalog">Catálogo general</option>
                  <option value="packages">Página de Paquetes</option>
                  <option value="collection">Una colección</option>
                  <option value="category">Una categoría</option>
                  <option value="url">Enlace personalizado</option>
                </select>
              </label>
              {selected.linkType === 'collection' && (
                <label className="form-field">
                  Colección
                  <select
                    value={selected.collectionSlug ?? ''}
                    onChange={(e) => updateElement(selected.id, { collectionSlug: e.target.value || null })}
                  >
                    <option value="">Elige una colección…</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.linkType === 'category' && (
                <label className="form-field">
                  Categoría
                  <select
                    value={selected.categorySlug ?? ''}
                    onChange={(e) => updateElement(selected.id, { categorySlug: e.target.value || null })}
                  >
                    <option value="">Elige una categoría…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.linkType === 'url' && (
                <label className="form-field">
                  URL
                  <input
                    value={selected.url ?? ''}
                    onChange={(e) => updateElement(selected.id, { url: e.target.value })}
                    placeholder="https://…"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import JsBarcode from 'jsbarcode'
import logoUrl from '../assets/AndaryShop.jpg'

export interface LabelItem {
  barcode: string
  title: string
  subtitle: string
  copies: number
}

export interface LabelSize {
  widthMm: number
  heightMm: number
}

// The real default now lives in the database (see app_settings /
// admin/src/pages/Settings.tsx) — this is only a last-resort fallback for
// the brief moment before that setting has loaded.
export const DEFAULT_LABEL_SIZE: LabelSize = { widthMm: 56, heightMm: 40 }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** JsBarcode measures text width via the DOM, so the <svg> needs to be
 * attached (even off-screen) while it renders — a fully detached node can
 * come back with a collapsed/zero-width barcode in some browsers. */
function renderBarcodeSvg(value: string): string {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  document.body.appendChild(container)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  container.appendChild(svg)
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 13,
      height: 38,
      margin: 6,
    })
    return svg.outerHTML
  } finally {
    document.body.removeChild(container)
  }
}

/** Opens a print-ready tab with one label per copy — logo, product
 * description (name + color + talla) and a scannable barcode with its
 * digits printed underneath. `size` sets each label's real-world box (mm,
 * so it prints true-to-life) — width is fixed, height is a minimum so a
 * barcode/long name never gets clipped just for being taller than the
 * configured label. */
export function printBarcodeLabels(items: LabelItem[], size: LabelSize = DEFAULT_LABEL_SIZE) {
  const logoAbsUrl = new URL(logoUrl, window.location.href).toString()

  const labelsHtml = items
    .flatMap((item) => Array.from({ length: Math.max(1, Math.round(item.copies)) }, () => item))
    .map(
      (item) => `
        <div class="label">
          <div class="label__header">
            <img src="${logoAbsUrl}" alt="" />
            <span>ANDARY SHOP</span>
          </div>
          <div class="label__title">${escapeHtml(item.title)}</div>
          <div class="label__subtitle">${escapeHtml(item.subtitle)}</div>
          <div class="label__barcode">${renderBarcodeSvg(item.barcode)}</div>
        </div>
      `
    )
    .join('')

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Etiquetas — Andary Shop</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px; font-family: Arial, Helvetica, sans-serif; background: #f5f5f5; }
  .labels-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .label {
    width: ${size.widthMm}mm;
    min-height: ${size.heightMm}mm;
    padding: 10px;
    background: #fff;
    border: 1px dashed #999;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    page-break-inside: avoid;
  }
  .label__header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .label__header img { width: 20px; height: 20px; object-fit: cover; border-radius: 4px; }
  .label__header span { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; }
  .label__title { font-size: 12px; font-weight: 700; line-height: 1.25; }
  .label__subtitle { font-size: 10px; color: #444; margin: 2px 0 6px; }
  .label__barcode svg { max-width: 100%; }
  @media print {
    body { background: #fff; padding: 0; }
    .label { border: 1px solid #ccc; }
  }
</style>
</head>
<body>
  <div class="labels-grid">${labelsHtml}</div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`)
  printWindow.document.close()
}

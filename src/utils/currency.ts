export function formatPrice(value: number | string): string {
  const amount = typeof value === 'string' ? parseFloat(value) : value
  return `$${amount.toFixed(2)} MXN`
}

/**
 * Мөнгөн дүнг backend-ийн decimal string-ээс ('1234567.5', '22000.00', '-150') float-руу хөрвүүлэхгүйгээр
 * '1 234 567.50 ₮' хэлбэрт оруулна (бутархай алдагдахгүй). Буруу/хоосон → '—'.
 */
export function formatMoney(value: string | null | undefined, currency = '₮'): string {
  if (value === null || value === undefined) return '—'
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!m) return '—'
  const [, sign, int, frac = ''] = m
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const cents = (frac + '00').slice(0, 2)
  return `${sign ?? ''}${grouped}.${cents}${currency ? ` ${currency}` : ''}`
}

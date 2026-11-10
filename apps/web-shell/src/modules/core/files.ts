/** v0.2.4 FILE-01 — цэвэр туслахууд (unit тестлэгдэнэ) */
export function formatBytes(n: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  if (n < 1024) return `${nf.format(n)} B`
  if (n < 1024 * 1024) return `${nf.format(n / 1024)} KB`
  if (n < 1024 ** 3) return `${nf.format(n / 1024 / 1024)} MB`
  return `${nf.format(n / 1024 ** 3)} GB`
}

/** Blob-ийг файлаар хадгалах (Bearer-тэй татсан — <a href> шууд ажиллахгүй) */
export async function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

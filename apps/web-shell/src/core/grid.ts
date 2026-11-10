/**
 * v0.2.0 §0.5 — "Хүснэгтээр оруулах"-ын цэвэр функцууд (unit тест: tests/grid.test.ts).
 * Excel-ээс хуулсан текст = TSV (мөр \r\n, нүд \t, хашилттай нүдэнд мөр шилжилт/tab байж болно).
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === '\t') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export const emptyGrid = (rows: number, cols: number): string[][] => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_*]+/g, ' ')

/**
 * (r, c) нүднээс эхлэн буулгана; шаардлагатай бол мөр нэмнэ. Эхний мөр нь баганын толгой (labels) бол алгасна.
 */
export function pasteInto(grid: string[][], data: string[][], r: number, c: number, labels: string[]): string[][] {
  const cols = grid[0]?.length ?? labels.length
  let rows = data
  if (rows.length > 0 && rows[0].some((v) => v.trim() !== '') && rows[0].every((v, i) => !v.trim() || norm(v) === norm(labels[c + i] ?? ''))) {
    rows = rows.slice(1)
  }
  const out = grid.map((x) => [...x])
  rows.forEach((vals, i) => {
    const target = r + i
    while (out.length <= target) out.push(Array.from({ length: cols }, () => ''))
    vals.forEach((v, j) => {
      if (c + j < cols) out[target][c + j] = v.trim()
    })
  })
  return out
}

/** Хоосон мөрийг хасаж `{ key: value }` болгоно (backend parseTableRows) */
export function gridToRows(grid: string[][], keys: string[]): Record<string, string>[] {
  return grid
    .filter((row) => row.some((v) => v.trim() !== ''))
    .map((row) => Object.fromEntries(keys.map((k, i) => [k, (row[i] ?? '').trim()])))
}

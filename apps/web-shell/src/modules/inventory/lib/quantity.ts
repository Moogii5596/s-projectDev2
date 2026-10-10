/**
 * Phase 6.0.2 — Барааны тоо хэмжээ (DB: numeric(15,3)).
 * Float ашиглахгүй: 1000-аар үржүүлсэн BigInt (0.1 + 0.2 алдаа гарахгүй).
 */
const SCALE = 1000n
const UNSIGNED = /^\d{1,12}(\.\d{1,3})?$/
const SIGNED = /^[+-]?\d{1,12}(\.\d{1,3})?$/

export type ParseResult = { ok: true; value: string } | { ok: false; error: string }

function toMilli(value: string): bigint {
  const s = value.trim()
  const neg = s.startsWith('-')
  const body = s.replace(/^[+-]/, '')
  const [int, frac = ''] = body.split('.')
  const milli = BigInt(int) * SCALE + BigInt((frac + '000').slice(0, 3))
  return neg ? -milli : milli
}

function fromMilli(milli: bigint): string {
  const neg = milli < 0n
  const abs = neg ? -milli : milli
  const int = abs / SCALE
  const frac = (abs % SCALE).toString().padStart(3, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`
}

/** Хоосон бол 0. Сөрөг биш, бутархай нь 3 оронтой хүртэл. */
export function parseQuantity(input: string): ParseResult {
  const s = input.trim().replace(',', '.')
  if (s === '') return { ok: true, value: '0' }
  if (!UNSIGNED.test(s)) return { ok: false, error: '0 буюу түүнээс их тоо (бутархай 3 орон хүртэл)' }
  return { ok: true, value: fromMilli(toMilli(s)) }
}

/** Тохируулга: + орлого, − зарлага; 0 байж болохгүй. */
export function parseDelta(input: string): ParseResult {
  const s = input.trim().replace(',', '.')
  if (!SIGNED.test(s)) return { ok: false, error: 'Тоо оруулна уу (жнь 10 эсвэл -2.5)' }
  const milli = toMilli(s)
  if (milli === 0n) return { ok: false, error: '0-ээс ялгаатай тоо оруулна уу' }
  return { ok: true, value: fromMilli(milli) }
}

/** Тохируулгын дараах үлдэгдэл (backend-тэй ижил: сөрөг болохгүй) */
export function applyDelta(current: string, delta: string): { next: string; negative: boolean } {
  const next = toMilli(current) + toMilli(delta)
  return { next: fromMilli(next), negative: next < 0n }
}

/** '1234567.5' → '1 234 567.5' (харуулах) */
export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || !SIGNED.test(value.trim())) return '—'
  const [int, frac] = fromMilli(toMilli(value)).split('.')
  const sign = int.startsWith('-') ? '-' : ''
  const grouped = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`
}

/**
 * v0.2.3 Блок R10 (PIL-25, R-3, R-4) — өрөө бүртгэлийн ID-гүй гүйцэтгэгчийн мөр (харуул, ээлжийн унаа, дугуйчин) → ажилтан.
 * ЦЭВЭР функцууд (convert.mjs ашиглана; тест: contractors.test.mjs — `node --test`). Дүрэм: mapping.json `contractors`.
 *   ангилал  = ээлж (Z / W …) + ID / овог / нэр / албан тушаалын текстэд таарах үг
 *   түлхүүр  = `route` (жолооч — чиглэл нэг ажилтан: «Автобус 1» → овог «Автобус», нэр «Жолооч 1») эсвэл `name` (овог + нэр)
 *   код      = <угтвар><4 орон>, `--z-start`-аас (системийн хамгийн их Z кодын дараагийнх)
 */
const up = (v) => String(v ?? '').toUpperCase();
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Мөр → таарсан дүрэм (эхнийх) эсвэл null */
export function classifyContractor(row, rules) {
  const shift = up(clean(row.shift));
  const text = up([row.idText, row.lastName, row.firstName, row.position].map(clean).join(' '));
  return rules.find((r) => r.shift.map(up).includes(shift) && r.match.some((m) => text.includes(up(m)))) ?? null;
}

/** «Автобус 1», «Баянхонгор 2» → { label: 'Автобус', n: 1 } (албан тушаал эсвэл овгоос) */
export function routeOf(row, rule) {
  for (const v of [row.position, row.lastName, row.firstName]) {
    for (const w of rule.routeWords ?? []) {
      const m = new RegExp(`(${w})\\s*(\\d+)`, 'i').exec(clean(v));
      if (m) return { label: w, n: Number(m[2]) };
    }
  }
  return null;
}

/** Нэрийг тулгахад: жижиг үсэг, «Sino» г.м. үг, тоо, тэмдэгт хасна */
export const normName = (v) =>
  clean(v)
    .toLowerCase()
    .replace(/sino|sgs|сино/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Мөр → { key, lastName, firstName } эсвэл { error }.
 * route: овог = чиглэлийн нэр, нэр = rule.driverFirstName ({n}); name: ганц нэртэй бол «Нэр» талбарт.
 */
export function contractorIdentity(row, rule) {
  if (rule.key === 'route') {
    const r = routeOf(row, rule);
    if (!r) return { error: 'чиглэл (жнь «Автобус 1») олдсонгүй' };
    return { key: `${rule.id}:${r.label.toLowerCase()}:${r.n}`, lastName: r.label, firstName: (rule.driverFirstName ?? 'Жолооч {n}').replace('{n}', String(r.n)) };
  }
  let last = normName(row.lastName) ? clean(row.lastName).replace(/\s*sino\b/i, '').trim() : '';
  let first = normName(row.firstName) ? clean(row.firstName).replace(/\s*sino\b/i, '').trim() : '';
  if (!first && last) [first, last] = [last, ''];
  if (!first) return { error: 'нэр алга' };
  return { key: `${rule.id}:${normName(last)}|${normName(first)}`, lastName: last || null, firstName: first };
}

/** Түлхүүрүүдэд код: дүрмийн дараалал → түлхүүрээр эрэмбэлж <prefix><4 орон>, start-аас */
export function assignCodes(items, rules, prefix, start) {
  const order = new Map(rules.map((r, i) => [r.id, i]));
  const sorted = [...items].sort((a, b) => (order.get(a.ruleId) ?? 99) - (order.get(b.ruleId) ?? 99) || a.key.localeCompare(b.key, 'mn', { numeric: true }));
  return new Map(sorted.map((it, i) => [it.key, `${prefix}${String(start + i).padStart(4, '0')}`]));
}

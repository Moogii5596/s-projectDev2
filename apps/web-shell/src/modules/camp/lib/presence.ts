import i18n from '../../../i18n'
import type { MealType, Presence } from '../api/types'
import { localizedCatalogName, MEAL_ORDER } from '../../../core/labels'

/** Хоол × байршлын хүснэгт: мөр = хоол, багана = байршил (нэрээр эрэмбэлсэн, байршилгүй нь сүүлд) */
export function pivotPresence(lines: Presence['lines']) {
  const locs = new Map<string, string>()
  for (const l of lines) {
    const name = l.mealLocationName
      ? localizedCatalogName({ name: l.mealLocationName, nameI18n: l.mealLocationNameI18n }, i18n.resolvedLanguage ?? i18n.language)
      : i18n.t('camp.presence.no_location')
    locs.set(l.mealLocationId ?? '', name)
  }
  const columns = [...locs.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : a.name.localeCompare(b.name, 'mn')))
  const cell = new Map(lines.map((l) => [`${l.mealType}|${l.mealLocationId ?? ''}`, l.count]))
  const rows = MEAL_ORDER.filter((m) => lines.some((l) => l.mealType === m)).map((meal: MealType) => {
    const counts = columns.map((c) => cell.get(`${meal}|${c.id}`) ?? 0)
    return { meal, counts, total: counts.reduce((a, b) => a + b, 0) }
  })
  const columnTotals = columns.map((_, i) => rows.reduce((s, r) => s + r.counts[i], 0))
  return { columns, rows, columnTotals, grandTotal: columnTotals.reduce((a, b) => a + b, 0) }
}

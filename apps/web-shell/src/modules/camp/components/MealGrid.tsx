import { useTranslation } from 'react-i18next'
import type { MealLocation } from '../api/types'
import { MEAL_LABEL } from '../lib/labels'
import { cellKey, MEAL_TYPES, type Grid } from '../lib/meal-order'
import { Table, inputSmCls, td } from './ui'

/** Хоол × байршил тоо оруулах хүснэгт (захиалга, тогтмол загвар). Хоосон нүд = 0 */
export default function MealGrid({
  locations,
  values,
  onChange,
  disabled,
  compare,
}: {
  locations: MealLocation[]
  values: Grid
  onChange: (next: Grid) => void
  disabled?: boolean
  /** TWO_SIDED: одоогийн утга — өөрчлөгдсөн нүдийг тодруулна */
  compare?: Grid
}) {
  const { t } = useTranslation()
  return (
    <Table head={[t('camp.mo.location'), ...MEAL_TYPES.map((m) => MEAL_LABEL[m])]}>
      {locations.map((loc) => (
        <tr key={loc.id}>
          <td className={`${td} font-medium text-gray-800`}>{loc.name}</td>
          {MEAL_TYPES.map((m) => {
            const k = cellKey(m, loc.id)
            const changed = compare !== undefined && (compare[k] ?? 0) !== (values[k] ?? 0)
            return (
              <td key={m} className={td}>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  inputMode="numeric"
                  aria-label={`${loc.name} · ${MEAL_LABEL[m]}`}
                  className={`${inputSmCls} w-24 text-right ${changed ? 'bg-yellow-50 border-yellow-400' : ''}`}
                  value={values[k] ?? ''}
                  disabled={disabled}
                  onChange={(e) => {
                    const n = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)))
                    onChange({ ...values, [k]: Number.isFinite(n) ? n : 0 })
                  }}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </Table>
  )
}

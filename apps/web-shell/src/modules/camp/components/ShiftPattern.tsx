import { useState } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ShiftSegment, ShiftType } from '../api/types'
import { useAppMutation } from '../../../core/useAppMutation'
import { SHIFT_LABEL, weekdayShort } from '../../../core/labels'
import { type DayShifts, daysToSegments, patternProblem, segmentsToDays } from '../lib/shift-pattern'
import { Button, ErrorBox, Modal } from '../../../core/ui'

/** Ээлжийн загварын нийтлэг харагдац (хэлтэс, албан тушаал — v0.2.1, Д-1) */
const CELL: Record<ShiftType | 'NONE', string> = {
  DAY: 'bg-amber-200 text-amber-900',
  NIGHT: 'bg-indigo-600 text-white',
  NONE: 'bg-gray-100 text-gray-400',
}


/** Жижиг харагдац: өдөр бүр нэг нүд */
export function PatternStrip({ segments, onDays, emptyText }: { segments: ShiftSegment[]; onDays: number; emptyText?: string }) {
  const { t } = useTranslation()
  if (segments.length === 0) return <span className="text-xs text-gray-400">{emptyText ?? t('camp.dept.no_pattern')}</span>
  const days: DayShifts = segmentsToDays(segments, onDays)
  return (
    <div className="flex gap-px" role="img" aria-label={daysToSegments(days).map((s) => `${s.dayFrom}–${s.dayTo} ${SHIFT_LABEL[s.shift]}`).join(', ')}>
      {days.map((s, i) => (
        <span key={i} className={`w-3 h-4 rounded-sm ${CELL[s ?? 'NONE']}`} title={t('camp.dept.day_n', { n: i + 1, shift: s ? SHIFT_LABEL[s] : '—' })} />
      ))}
    </div>
  )
}


const NEXT: Record<ShiftType | 'NONE', ShiftType | null> = { NONE: 'DAY', DAY: 'NIGHT', NIGHT: null }

/**
 * Ээлжийн загвар засварлагч (хэлтэс, v0.2.1-ээс албан тушаал × кемп) — ростерын өдөр бүр Өдөр / Шөнө / хоосон.
 * `save` нь шинэ сегментүүдийг хадгална; `invalidate` — амжилттай болоход шинэчлэх query-үүд.
 */
export function ShiftPatternModal({
  title,
  initial,
  onDays,
  changeover,
  save,
  invalidate,
  note,
  onClose,
}: {
  title: string
  initial: ShiftSegment[]
  onDays: number
  changeover: number
  save: (segments: ShiftSegment[]) => Promise<unknown>
  invalidate: QueryKey[]
  note?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [days, setDays] = useState<DayShifts>(() => segmentsToDays(initial, onDays))
  const problem = patternProblem(days)
  const m = useAppMutation(() => save(daysToSegments(days)), invalidate, onClose)
  const fill = (fn: (i: number) => ShiftType | null) => setDays(Array.from({ length: onDays }, (_, i) => fn(i)))
  const half = Math.ceil(onDays / 2)

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!!problem}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      {note && <p className="text-sm text-blue-800 bg-blue-50 rounded-md px-3 py-2">{note}</p>}
      <p className="text-sm text-gray-600">{t('camp.dept.pattern_click')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => fill(() => 'DAY')}>
          {t('camp.dept.all_day')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill((i) => (i < half ? 'DAY' : 'NIGHT'))}>
          {t('camp.dept.half', { half, next: half + 1, days: onDays })}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill(() => null)}>
          {t('camp.dept.clear')}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${onDays}, 2.5rem)` }}>
          {days.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={t('camp.dept.day_n', { n: i + 1, shift: s ? SHIFT_LABEL[s] : t('camp.dept.empty_cell') })}
              onClick={() => setDays((p) => p.map((v, j) => (j === i ? NEXT[v ?? 'NONE'] : v)))}
              className={`h-14 rounded-md text-xs font-medium flex flex-col items-center justify-center ${CELL[s ?? 'NONE']}`}
            >
              <span>{i + 1}</span>
              <span className="opacity-80">{s ? SHIFT_LABEL[s] : '—'}</span>
            </button>
          ))}
          {days.map((_, i) => (
            <span key={`w${i}`} className="text-[10px] text-center text-gray-400">
              {weekdayShort(changeover + i + 1)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-sm">
        {problem ? (
          <span className="text-red-600">{problem}</span>
        ) : daysToSegments(days).length === 0 ? (
          <span className="text-gray-500">{t('camp.dept.will_be_empty')}</span>
        ) : (
          <span className="text-gray-600">
            {daysToSegments(days)
              .map((s) => `${s.dayFrom}–${s.dayTo}: ${SHIFT_LABEL[s.shift]}`)
              .join(' · ')}
          </span>
        )}
      </div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}


import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import apiClient from '../../api/client'
import { Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../../core/ui'

interface CalendarHoliday {
  id: string
  name: string
  recurrence: 'ONCE' | 'ANNUAL'
  holidayDate: string | null
  month: number | null
  day: number | null
  isActive: boolean
}

interface HolidayCalendar {
  id: string
  code: string
  name: string
  countryCode: string | null
  isActive: boolean
  holidays: CalendarHoliday[]
}

interface CalendarInput {
  code: string
  name: string
  countryCode: string
}

interface HolidayInput {
  name: string
  recurrence: 'ONCE' | 'ANNUAL'
  holidayDate: string
  month: string
  day: string
}

const CALENDAR_KEY = ['core', 'calendars'] as const
const EMPTY_HOLIDAY: HolidayInput = { name: '', recurrence: 'ANNUAL', holidayDate: '', month: '', day: '' }

export default function CalendarsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [calendarInput, setCalendarInput] = useState<CalendarInput>({ code: '', name: '', countryCode: '' })
  const [holidayCalendarId, setHolidayCalendarId] = useState<string | null>(null)
  const [holidayInput, setHolidayInput] = useState<HolidayInput>(EMPTY_HOLIDAY)
  const calendars = useQuery({
    queryKey: CALENDAR_KEY,
    queryFn: async () => (await apiClient.get<HolidayCalendar[]>('/api/v1/core/calendars')).data,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: CALENDAR_KEY })
  const createCalendar = useMutation({
    mutationFn: async (input: CalendarInput) => apiClient.post('/api/v1/core/calendars', {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      countryCode: input.countryCode.trim().toUpperCase() || null,
    }),
    onSuccess: () => {
      setCalendarInput({ code: '', name: '', countryCode: '' })
      void refresh()
    },
  })
  const addHoliday = useMutation({
    mutationFn: async ({ calendarId, input }: { calendarId: string; input: HolidayInput }) => apiClient.post(
      `/api/v1/core/calendars/${calendarId}/holidays`,
      input.recurrence === 'ONCE'
        ? { name: input.name.trim(), recurrence: input.recurrence, holidayDate: input.holidayDate }
        : { name: input.name.trim(), recurrence: input.recurrence, month: Number(input.month), day: Number(input.day) },
    ),
    onSuccess: () => {
      setHolidayCalendarId(null)
      setHolidayInput(EMPTY_HOLIDAY)
      void refresh()
    },
  })
  const removeHoliday = useMutation({
    mutationFn: async ({ calendarId, id }: { calendarId: string; id: string }) =>
      apiClient.delete(`/api/v1/core/calendars/${calendarId}/holidays/${id}`),
    onSuccess: refresh,
  })

  if (calendars.isLoading) return <Loading />
  if (calendars.isError) return <ErrorBox error={calendars.error} onRetry={() => calendars.refetch()} />

  return (
    <div className="space-y-4">
      <Card title={t('core.calendar.title')}>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            createCalendar.mutate(calendarInput)
          }}
        >
          <Field label={t('core.calendar.code')}>{(id) => <input id={id} className={inputCls} value={calendarInput.code} maxLength={40} onChange={(event) => setCalendarInput((value) => ({ ...value, code: event.target.value.toUpperCase() }))} required />}</Field>
          <Field label={t('core.calendar.name')}>{(id) => <input id={id} className={inputCls} value={calendarInput.name} maxLength={120} onChange={(event) => setCalendarInput((value) => ({ ...value, name: event.target.value }))} required />}</Field>
          <Field label={t('core.calendar.country_code')}>{(id) => <input id={id} className={inputCls} value={calendarInput.countryCode} maxLength={2} onChange={(event) => setCalendarInput((value) => ({ ...value, countryCode: event.target.value.toUpperCase() }))} />}</Field>
          <div className="flex items-end"><Button type="submit" loading={createCalendar.isPending} disabled={!calendarInput.code.trim() || !calendarInput.name.trim()}>{t('core.calendar.add')}</Button></div>
        </form>
        <ErrorBox error={createCalendar.error} />
      </Card>

      {calendars.data?.length === 0 && <Card><Empty>{t('core.calendar.empty')}</Empty></Card>}
      {calendars.data?.map((calendar) => (
        <Card key={calendar.id} title={`${calendar.name} (${calendar.code})`} actions={calendar.countryCode ? <span className="text-xs text-gray-500">{calendar.countryCode}</span> : undefined}>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setHolidayCalendarId(calendar.id)}>{t('core.calendar.add_holiday')}</Button>
          </div>
          {calendar.holidays.length === 0 ? <Empty>{t('core.calendar.no_holidays')}</Empty> : (
            <Table head={[t('core.calendar.holiday_name'), t('core.calendar.recurrence'), t('core.calendar.date'), '']}>
              {calendar.holidays.map((holiday) => (
                <tr key={holiday.id}>
                  <td className={td}>{holiday.name}</td>
                  <td className={td}>{t(`core.calendar.recurrence_${holiday.recurrence.toLowerCase()}`)}</td>
                  <td className={td}>{holiday.holidayDate?.slice(0, 10) ?? `--${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`}</td>
                  <td className={`${td} text-right`}>
                    <Button variant="ghost" disabled={removeHoliday.isPending} onClick={() => {
                      if (window.confirm(t('core.calendar.confirm_remove'))) removeHoliday.mutate({ calendarId: calendar.id, id: holiday.id })
                    }}>{t('core.calendar.remove')}</Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <ErrorBox error={removeHoliday.error} />
        </Card>
      ))}

      {holidayCalendarId && (
        <Modal
          title={t('core.calendar.add_holiday')}
          onClose={() => setHolidayCalendarId(null)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setHolidayCalendarId(null)}>{t('camp.common.cancel')}</Button>
              <Button loading={addHoliday.isPending} disabled={!holidayInput.name.trim() || (holidayInput.recurrence === 'ONCE' ? !holidayInput.holidayDate : !holidayInput.month || !holidayInput.day)} onClick={() => addHoliday.mutate({ calendarId: holidayCalendarId, input: holidayInput })}>{t('core.calendar.add')}</Button>
            </>
          )}
        >
          <Field label={t('core.calendar.holiday_name')}>{(id) => <input id={id} className={inputCls} value={holidayInput.name} maxLength={160} onChange={(event) => setHolidayInput((value) => ({ ...value, name: event.target.value }))} />}</Field>
          <Field label={t('core.calendar.recurrence')}>{(id) => <select id={id} className={inputCls} value={holidayInput.recurrence} onChange={(event) => setHolidayInput((value) => ({ ...value, recurrence: event.target.value as HolidayInput['recurrence'] }))}>
                <option value="ANNUAL">{t('core.calendar.recurrence_annual')}</option>
                <option value="ONCE">{t('core.calendar.recurrence_once')}</option>
              </select>}</Field>
          {holidayInput.recurrence === 'ONCE'
            ? <Field label={t('core.calendar.date')}>{(id) => <input id={id} type="date" className={inputCls} value={holidayInput.holidayDate} onChange={(event) => setHolidayInput((value) => ({ ...value, holidayDate: event.target.value }))} />}</Field>
            : <div className="grid grid-cols-2 gap-3">
              <Field label={t('core.calendar.month')}>{(id) => <input id={id} type="number" min="1" max="12" className={inputCls} value={holidayInput.month} onChange={(event) => setHolidayInput((value) => ({ ...value, month: event.target.value }))} />}</Field>
              <Field label={t('core.calendar.day')}>{(id) => <input id={id} type="number" min="1" max="31" className={inputCls} value={holidayInput.day} onChange={(event) => setHolidayInput((value) => ({ ...value, day: event.target.value }))} />}</Field>
            </div>}
          <ErrorBox error={addHoliday.error} />
        </Modal>
      )}
    </div>
  )
}

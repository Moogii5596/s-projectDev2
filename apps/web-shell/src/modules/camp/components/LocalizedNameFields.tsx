import { useTranslation } from 'react-i18next'
import { Field, inputCls } from '../../../core/ui'

export interface LocalizedNameInput {
  name: string
  nameI18n: { en: string; zh: string }
}

export function LocalizedNameFields({
  value,
  onChange,
  maxLength = 100,
}: {
  value: LocalizedNameInput
  onChange: (value: LocalizedNameInput) => void
  maxLength?: number
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t('camp.common.name_mn')}>
        {(id) => <input id={id} className={inputCls} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} maxLength={maxLength} />}
      </Field>
      <Field label={t('camp.common.name_en')}>
        {(id) => <input id={id} className={inputCls} value={value.nameI18n.en} onChange={(e) => onChange({ ...value, nameI18n: { ...value.nameI18n, en: e.target.value } })} maxLength={maxLength} />}
      </Field>
      <Field label={t('camp.common.name_zh')}>
        {(id) => <input id={id} className={inputCls} value={value.nameI18n.zh} onChange={(e) => onChange({ ...value, nameI18n: { ...value.nameI18n, zh: e.target.value } })} maxLength={maxLength} />}
      </Field>
    </div>
  )
}

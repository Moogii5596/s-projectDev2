import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../core/ui'

const MAX_PICKER_IMAGES = 6
const MAX_IMAGE_MB = 15
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

interface Props {
  value: File[]
  onChange: (files: File[]) => void
  max?: number
}

export default function ImagePicker({ value, onChange, max = MAX_PICKER_IMAGES }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [urls, setUrls] = useState<string[]>([])

  // Preview URL-ийг файл солигдох/устах бүрт revoke хийнэ
  useEffect(() => {
    const created = value.map((f) => URL.createObjectURL(f))
    setUrls(created)
    return () => created.forEach((u) => URL.revokeObjectURL(u))
  }, [value])

  const handleFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    if (inputRef.current) inputRef.current.value = ''
    if (picked.length === 0) return
    const msgs: string[] = []
    const accepted = picked.slice(0, Math.max(max - value.length, 0))
    if (picked.length > accepted.length) msgs.push(t('feed.ui.picker.max', { max }))
    for (const f of accepted) {
      if (f.size > MAX_IMAGE_BYTES) msgs.push(t('feed.ui.picker.tooLarge', { name: f.name, mb: MAX_IMAGE_MB }))
    }
    setWarnings(msgs)
    if (accepted.length > 0) onChange([...value, ...accepted])
  }

  const remove = (i: number) => {
    setWarnings([])
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" disabled={value.length >= max} onClick={() => inputRef.current?.click()}>
          {t('feed.ui.picker.add')}
        </Button>
        <span className="text-xs text-gray-500">{t('feed.ui.picker.count', { n: value.length, max })}</span>
        <input
          ref={inputRef}
          data-testid="feed-picker-input"
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {warnings.map((w) => (
        <p key={w} role="alert" className="text-xs text-yellow-700">
          {w}
        </p>
      ))}
      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {value.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              {urls[i] && <img src={urls[i]} alt={f.name} className="h-full w-full object-cover" />}
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">{i + 1}</span>
              <button
                type="button"
                aria-label={t('feed.ui.picker.remove', { n: i + 1 })}
                onClick={() => remove(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

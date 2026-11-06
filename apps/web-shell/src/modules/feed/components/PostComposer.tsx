import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, ErrorBox } from '../../camp/components/ui'
import { feedApi, feedKeys, type FeedListDto } from '../api'
import { prependPost } from '../lib/feed'
import ImagePicker from './ImagePicker'
import type { InfiniteData } from '@tanstack/react-query'

const MAX_IMAGES = 6
const MAX_BODY = 5000

/** Пост бичих: текст + ≤6 зураг. Амжилттай бол жагсаалтын эхэнд (refetch-гүй) */
export default function PostComposer() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [open, setOpen] = useState(false)

  const m = useMutation({
    mutationFn: () => feedApi.create(body.trim(), images),
    onSuccess: (post) => {
      qc.setQueryData<InfiniteData<FeedListDto, string | null>>(feedKeys.list(), (d) => prependPost(d, post))
      setBody('')
      setImages([])
      setOpen(false)
    },
  })

  const empty = body.trim().length === 0 && images.length === 0

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50"
      >
        {t('feed.compose.placeholder')}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <textarea
        autoFocus
        value={body}
        maxLength={MAX_BODY}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={t('feed.compose.placeholder')}
        className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <ImagePicker value={images} onChange={setImages} max={MAX_IMAGES} />
      {m.isError && <ErrorBox error={m.error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={m.isPending} onClick={() => setOpen(false)}>
          {t('feed.cancel')}
        </Button>
        <Button disabled={empty} loading={m.isPending} onClick={() => m.mutate()}>
          {t('feed.compose.submit')}
        </Button>
      </div>
    </div>
  )
}

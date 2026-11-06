import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FeedImage, { largestVariant } from './FeedImage'
import type { FeedImageDto } from './types'

export const MAX_GRID_IMAGES = 6

// Утсанд эхэлж: 6 баганат сүлжээ; нүд бүрийн span/харьцаа зургийн тоогоор
function cellClass(n: number, i: number): string {
  if (n === 1) return 'col-span-6 max-h-[28rem]'
  if (n === 2) return 'col-span-3 aspect-square'
  if (n === 3) return i === 0 ? 'col-span-6 aspect-video' : 'col-span-3 aspect-square'
  if (n === 4) return 'col-span-3 aspect-square'
  if (n === 5) return i < 2 ? 'col-span-3 aspect-square' : 'col-span-2 aspect-square'
  return 'col-span-2 aspect-square'
}

function cellSizes(n: number, i: number): string {
  if (n === 1) return '(min-width: 768px) 640px, 100vw'
  const half = n === 2 || n === 4 || (n === 5 && i < 2) || (n === 3 && i > 0)
  if (n === 3 && i === 0) return '(min-width: 768px) 640px, 100vw'
  return half ? '(min-width: 768px) 320px, 50vw' : '(min-width: 768px) 214px, 34vw'
}

interface Props {
  images: FeedImageDto[]
  dataSaver?: boolean
  className?: string
}

export default function FeedImageGrid({ images, dataSaver = false, className = '' }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const shown = images.slice(0, MAX_GRID_IMAGES)
  const n = shown.length

  const close = useCallback(() => setOpen(null), [])
  const step = useCallback((d: number) => setOpen((o) => (o === null ? o : (o + d + n) % n)), [n])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, step])

  if (n === 0) return null
  const current = open === null ? null : shown[open]

  return (
    <>
      <div data-testid="feed-image-grid" data-count={n} className={`grid grid-cols-6 gap-1 overflow-hidden rounded-lg ${className}`}>
        {shown.map((img, i) => (
          <div key={img.id} className={`${cellClass(n, i)} overflow-hidden`}>
            <FeedImage
              image={img}
              dataSaver={dataSaver}
              sizes={cellSizes(n, i)}
              alt={t('feed.image.open', { n: i + 1 })}
              className="h-full w-full"
              onClick={() => setOpen(i)}
            />
          </div>
        ))}
      </div>
      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('feed.lightbox.title')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={close}
        >
          <img
            data-testid="feed-lightbox-img"
            src={largestVariant(current)?.url}
            alt={t('feed.image.open', { n: (open ?? 0) + 1 })}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label={t('feed.lightbox.close')}
            onClick={close}
            className="absolute right-3 top-3 rounded-full bg-white/20 px-3 py-1 text-white"
          >
            ✕
          </button>
          {n > 1 && (
            <>
              <button
                type="button"
                aria-label={t('feed.lightbox.prev')}
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/20 px-3 py-2 text-white"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={t('feed.lightbox.next')}
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/20 px-3 py-2 text-white"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

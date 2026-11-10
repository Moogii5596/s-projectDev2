import { useMemo, useState } from 'react'
import { thumbHashToDataURL } from 'thumbhash'
import type { FeedImageDto } from '../types'

function thumbhashUrl(b64: string): string | undefined {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return thumbHashToDataURL(bytes)
  } catch {
    return undefined
  }
}

const byWidth = (image: FeedImageDto) => [...image.variants].sort((a, b) => a.w - b.w)

export const largestVariant = (image: FeedImageDto) => {
  const v = byWidth(image)
  return v[v.length - 1]
}

interface Props {
  image: FeedImageDto
  /** Өгөгдөл хэмнэх: зөвхөн хамгийн жижиг хувилбар; дарахад том */
  dataSaver?: boolean
  sizes?: string
  alt?: string
  className?: string
  /** Өгвөл дарахад үүнийг дуудна (жишээ нь lightbox); үгүй бол dataSaver үед газар дээрээ томруулна */
  onClick?: () => void
}

export default function FeedImage({
  image,
  dataSaver = false,
  sizes = '(min-width: 768px) 640px, 100vw',
  alt = '',
  className = '',
  onClick,
}: Props) {
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const placeholder = useMemo(() => thumbhashUrl(image.thumbhash), [image.thumbhash])

  const variants = byWidth(image)
  const useSmall = dataSaver && !expanded
  const src = (useSmall ? variants[0] : variants[variants.length - 1])?.url
  const srcSet = useSmall ? undefined : variants.map((v) => `${v.url} ${v.w}w`).join(', ')

  const handleClick = () => {
    if (onClick) onClick()
    else if (useSmall) setExpanded(true)
  }
  const interactive = !!onClick || useSmall

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={useSmall ? undefined : sizes}
      width={image.width}
      height={image.height}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onClick={interactive ? handleClick : undefined}
      style={
        !loaded && placeholder
          ? { backgroundImage: `url(${placeholder})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
      className={`bg-gray-100 object-cover ${interactive ? 'cursor-pointer' : ''} ${className}`}
    />
  )
}

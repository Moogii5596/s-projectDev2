// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../../i18n'
import FeedbackAttachments from '../FeedbackAttachments'
import type { FeedImageDto } from '../feed-bridge'

beforeAll(() => {
  i18n.addResourceBundle(
    'mn',
    'translation',
    {
      'feedback.attachments': 'Зураг',
      'feedback.attachments.hint': 'Хамгийн ихдээ 3 зураг',
      'feedback.attachments.remove': 'Зургийг устгах',
    },
    true,
    true,
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const image = (id: string): FeedImageDto => ({
  id,
  width: 800,
  height: 600,
  thumbhash: '3PcNNYSFeXh/b/i3d4iHeIeAeAAAAAAA',
  variants: [
    { w: 480, h: 360, url: `/images/${id}-480.webp` },
    { w: 1080, h: 810, url: `/images/${id}-1080.webp` },
  ],
})

describe('FeedbackAttachments', () => {
  it('одоогийн зургийг data saver-тай харуулж, устгалтыг хүсэлт болгон дамжуулна', () => {
    const onRemove = vi.fn()
    render(
      <FeedbackAttachments
        attachments={[image('a'), image('b')]}
        files={[]}
        onFilesChange={() => {}}
        onRemove={onRemove}
      />,
    )

    expect(screen.getByTestId('feed-image-grid').dataset.count).toBe('2')
    expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe('/images/a-480.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Зургийг устгах 2' }))
    expect(onRemove).toHaveBeenCalledWith('b')
    expect((screen.getByTestId('feed-picker-input') as HTMLInputElement).disabled).toBe(false)
  })

  it('нийт гурван зурагтай бол нэмэх сонголтыг хаана', () => {
    render(
      <FeedbackAttachments
        attachments={[image('a'), image('b'), image('c')]}
        files={[]}
        onFilesChange={() => {}}
        onRemove={() => {}}
      />,
    )

    expect(screen.getByTestId('feed-image-grid').dataset.count).toBe('3')
    expect(screen.getByTestId('feed-picker-input').parentElement?.querySelector('button')?.disabled).toBe(true)
  })
})

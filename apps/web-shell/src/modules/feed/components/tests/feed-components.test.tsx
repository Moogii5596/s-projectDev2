// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18n from '../../../../i18n'
import pending from '../../i18n-pending.json'
import FeedImage from '../FeedImage'
import FeedImageGrid from '../FeedImageGrid'
import ImagePicker from '../ImagePicker'
import ReportDialog from '../ReportDialog'
import RevisionsDialog from '../RevisionsDialog'
import type { FeedImageDto } from '../../types'

// Каталогт нэгтгэгдэх хүртэл feed.ui.* түлхүүрийг i18n-pending.json-оос ачаална
beforeAll(() => {
  for (const [lang, msgs] of Object.entries(pending)) i18n.addResourceBundle(lang, 'translation', msgs, true, true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const img = (id: string): FeedImageDto => ({
  id,
  width: 1600,
  height: 1200,
  thumbhash: '3PcNNYSFeXh/b/i3d4iHeIeAeAAAAAAA',
  variants: [
    { w: 1080, h: 810, url: `/m/${id}-1080.webp` },
    { w: 480, h: 360, url: `/m/${id}-480.webp` },
  ],
})
const imgs = (n: number) => Array.from({ length: n }, (_, i) => img(`i${i}`))
const file = (name: string, size = 10) => {
  const f = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('FeedImage', () => {
  it('srcset / sizes / lazy / размер', () => {
    const { container } = render(<FeedImage image={img('a')} sizes="100vw" />)
    const el = container.querySelector('img')!
    expect(el.getAttribute('srcset')).toBe('/m/a-480.webp 480w, /m/a-1080.webp 1080w')
    expect(el.getAttribute('sizes')).toBe('100vw')
    expect(el.getAttribute('loading')).toBe('lazy')
    expect(el.getAttribute('decoding')).toBe('async')
    expect(el.getAttribute('width')).toBe('1600')
    expect(el.getAttribute('height')).toBe('1200')
  })

  it('dataSaver: зөвхөн жижиг хувилбар, дарахад том', () => {
    const { container } = render(<FeedImage image={img('a')} dataSaver />)
    const el = container.querySelector('img')!
    expect(el.getAttribute('src')).toBe('/m/a-480.webp')
    expect(el.getAttribute('srcset')).toBeNull()
    fireEvent.click(el)
    expect(container.querySelector('img')!.getAttribute('srcset')).toContain('1080w')
  })
})

describe('FeedImageGrid', () => {
  it.each([1, 2, 3, 4, 5, 6])('%i зураг → %i нүд', (n) => {
    render(<FeedImageGrid images={imgs(n)} />)
    expect(screen.getAllByRole('img')).toHaveLength(n)
    expect(screen.getByTestId('feed-image-grid').dataset.count).toBe(String(n))
  })

  it('6-аас илүүг таслана', () => {
    render(<FeedImageGrid images={imgs(8)} />)
    expect(screen.getAllByRole('img')).toHaveLength(6)
  })

  it('lightbox: хамгийн том, зүүн/баруун, Esc', () => {
    render(<FeedImageGrid images={imgs(3)} dataSaver />)
    fireEvent.click(screen.getAllByRole('img')[1])
    expect(screen.getByTestId('feed-lightbox-img').getAttribute('src')).toBe('/m/i1-1080.webp')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('feed-lightbox-img').getAttribute('src')).toBe('/m/i2-1080.webp')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('feed-lightbox-img').getAttribute('src')).toBe('/m/i0-1080.webp')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('feed-lightbox-img').getAttribute('src')).toBe('/m/i2-1080.webp')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ImagePicker', () => {
  it('≤6, 15 MB анхааруулга, устгах', () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    const onChange = vi.fn()
    const { rerender } = render(<ImagePicker value={[]} onChange={onChange} />)
    const input = screen.getByTestId('feed-picker-input') as HTMLInputElement
    expect(input.accept).toBe('image/*')
    expect(input.multiple).toBe(true)

    fireEvent.change(input, { target: { files: [file('big.jpg', 16 * 1024 * 1024)] } })
    expect(screen.getByRole('alert').textContent).toContain('big.jpg')
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'big.jpg' })])

    const five = Array.from({ length: 5 }, (_, i) => file(`f${i}.jpg`))
    rerender(<ImagePicker value={five} onChange={onChange} />)
    fireEvent.change(input, { target: { files: [file('a.jpg'), file('b.jpg'), file('c.jpg')] } })
    expect(onChange.mock.calls.at(-1)![0]).toHaveLength(6)
    expect(screen.getByRole('alert').textContent).toContain('6')

    fireEvent.click(screen.getByLabelText('2-р зургийг устгах'))
    expect(onChange.mock.calls.at(-1)![0].map((f: File) => f.name)).toEqual(['f0.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg'])
  })
})

describe('ReportDialog', () => {
  it('шалтгаангүй бол илгээхгүй; >500 тайлбарыг хаана; зөв бол onSubmit', () => {
    const onSubmit = vi.fn()
    render(<ReportDialog onSubmit={onSubmit} onCancel={() => {}} />)
    const submit = screen.getByRole('button', { name: 'Мэдэгдэх' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Спам'))
    expect(submit.disabled).toBe(false)

    const note = screen.getByLabelText('Тайлбар (заавал биш)')
    fireEvent.change(note, { target: { value: 'x'.repeat(501) } })
    expect(submit.disabled).toBe(true)
    expect(screen.getByText('Тайлбар 500 тэмдэгтээс хэтэрсэн')).toBeTruthy()

    fireEvent.change(note, { target: { value: ' давтан ' } })
    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'SPAM', note: 'давтан' })
  })
})

describe('RevisionsDialog', () => {
  it('одоогийн + өмнөх хувилбарууд', () => {
    render(
      <RevisionsDialog
        onClose={() => {}}
        data={{
          current: 'Шинэ',
          editedAt: '2026-11-06T10:00:00Z',
          revisions: [
            { body: 'Дундах', replacedAt: '2026-11-06T10:00:00Z' },
            { body: 'Анхны', replacedAt: '2026-11-05T10:00:00Z' },
          ],
        }}
      />,
    )
    expect(screen.getByText('Шинэ')).toBeTruthy()
    expect(screen.getByText('Дундах')).toBeTruthy()
    expect(screen.getByText('Анхны')).toBeTruthy()
    expect(screen.getByText(/^Засагдсан:/)).toBeTruthy()
  })
})

describe('i18n-pending.json', () => {
  const src = (dir: string): string =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')

  it('mn/en/zh түлхүүр ижил, feed.ui.* угтвартай, хувьсагч ижил', () => {
    const keys = Object.keys(pending.mn).sort()
    expect(keys.every((k) => k.startsWith('feed.ui.'))).toBe(true)
    expect(Object.keys(pending.en).sort()).toEqual(keys)
    expect(Object.keys(pending.zh).sort()).toEqual(keys)
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const k of keys) {
      const mn = (pending.mn as Record<string, string>)[k]
      expect(vars((pending.en as Record<string, string>)[k]), k).toEqual(vars(mn))
      expect(vars((pending.zh as Record<string, string>)[k]), k).toEqual(vars(mn))
    }
  })

  it("компонентод ашигласан t('feed.ui.…') түлхүүр бүр pending-д байна", () => {
    const text = src(join(__dirname, '..'))
    const used = [...text.matchAll(/\bt\(\s*['`](feed\.ui\.[\w.]+)['`]/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(10)
    for (const k of used) expect(k in pending.mn, k).toBe(true)
    // динамик: feed.ui.report.reason.${r}
    for (const r of ['SPAM', 'OFFENSIVE', 'PRIVACY', 'OTHER']) expect(`feed.ui.report.reason.${r}` in pending.mn).toBe(true)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATA_SAVER_KEY, readDataSaver } from '../data-saver'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('readDataSaver', () => {
  it('localStorage > Save-Data > false', () => {
    expect(readDataSaver()).toBe(false)
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    expect(readDataSaver()).toBe(true)
    localStorage.setItem(DATA_SAVER_KEY, '0')
    expect(readDataSaver()).toBe(false)
    localStorage.setItem(DATA_SAVER_KEY, '1')
    expect(readDataSaver()).toBe(true)
  })

  it('localStorage алдаатай байсан ч Save-Data рүү унана', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
    })
    expect(readDataSaver()).toBe(false)
  })
})

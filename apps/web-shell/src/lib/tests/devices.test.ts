import { describe, expect, it } from 'vitest'
import type { DeviceSession } from '../../api/sessions'
import { describeUserAgent, deviceTitle, otherDevices, sortDevices } from '../devices'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

const dev = (id: string, o: Partial<DeviceSession> = {}): DeviceSession => ({ id, current: false, userAgent: null, ip: null, createdAt: null, lastActiveAt: null, ...o })

describe('describeUserAgent', () => {
  it('браузер + ҮС: Chrome/Edge (Edge нь Chrome биш), Safari iOS, Android нь Linux биш, Firefox Linux', () => {
    expect(describeUserAgent(CHROME_WIN)).toEqual({ browser: 'Chrome', os: 'Windows' })
    expect(describeUserAgent(EDGE_WIN)).toEqual({ browser: 'Edge', os: 'Windows' })
    expect(describeUserAgent(SAFARI_IOS)).toEqual({ browser: 'Safari', os: 'iOS' })
    expect(describeUserAgent(CHROME_ANDROID)).toEqual({ browser: 'Chrome', os: 'Android' })
    expect(describeUserAgent(FIREFOX_LINUX)).toEqual({ browser: 'Firefox', os: 'Linux' })
  })
  it('хоосон / үл мэдэгдэх → null', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null })
    expect(describeUserAgent('curl/8.0')).toEqual({ browser: null, os: null })
  })
})

describe('deviceTitle', () => {
  it('«Chrome · Windows»; тодорхойгүй бол өгсөн нэр; зөвхөн нэг нь мэдэгдвэл тэр нэг', () => {
    expect(deviceTitle(CHROME_WIN, '?')).toBe('Chrome · Windows')
    expect(deviceTitle(null, 'Тодорхойгүй')).toBe('Тодорхойгүй')
    expect(deviceTitle('Mozilla/5.0 (Windows NT 10.0)', '?')).toBe('Windows')
  })
})

describe('sortDevices / otherDevices', () => {
  const list = [
    dev('old', { lastActiveAt: '2026-11-01T00:00:00Z' }),
    dev('cur', { current: true, lastActiveAt: '2026-10-01T00:00:00Z' }),
    dev('new', { lastActiveAt: '2026-11-06T00:00:00Z' }),
    dev('nodate'),
  ]
  it('одоогийн төхөөрөмж эхэнд, бусад нь сүүлд ашигласнаар, огноогүй нь сүүлд', () => {
    expect(sortDevices(list).map((d) => d.id)).toEqual(['cur', 'new', 'old', 'nodate'])
  })
  it('эх массивыг өөрчлөхгүй; otherDevices одоогийнхыг хасна', () => {
    sortDevices(list)
    expect(list[0].id).toBe('old')
    expect(otherDevices(list).map((d) => d.id)).toEqual(['old', 'new', 'nodate'])
  })
})

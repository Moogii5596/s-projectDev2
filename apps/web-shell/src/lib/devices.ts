/**
 * v0.2.3 Блок 4б (PIL-15) — «Нэвтэрсэн төхөөрөмжүүд»-ийн цэвэр функцууд (API / React импортгүй, unit тестлэгдэнэ).
 */
import type { DeviceSession } from '../api/sessions'

export interface UserAgentInfo {
  browser: string | null
  os: string | null
}

/** User-Agent → браузер, үйлдлийн систем (нэр нь тусгай нэр тул орчуулагдахгүй). Мэдэхгүй бол null. */
export function describeUserAgent(ua: string | null | undefined): UserAgentInfo {
  if (!ua) return { browser: null, os: null }
  let browser: string | null = null
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari'

  let os: string | null = null
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return { browser, os }
}

/** «Chrome · Windows»; хоёулаа тодорхойгүй бол `unknown` */
export function deviceTitle(ua: string | null | undefined, unknown: string): string {
  const { browser, os } = describeUserAgent(ua)
  const parts = [browser, os].filter((x): x is string => x !== null)
  return parts.length > 0 ? parts.join(' · ') : unknown
}

/** Одоогийн төхөөрөмж эхэнд, үлдсэн нь сүүлд ашигласнаар (шинэ → хуучин) */
export function sortDevices(list: DeviceSession[]): DeviceSession[] {
  return [...list].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    return (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '')
  })
}

export const otherDevices = (list: DeviceSession[]): DeviceSession[] => list.filter((d) => !d.current)

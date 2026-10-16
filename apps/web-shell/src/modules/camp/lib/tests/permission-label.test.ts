/**
 * v0.2.2 H2 (H-Q3) — эрхийн нэр i18n кодоор, орчуулгагүй бол DB нэр
 */
import { describe, expect, it } from 'vitest'
import mn from '@s-project/i18n/web.mn.json'
import en from '@s-project/i18n/web.en.json'
import zh from '@s-project/i18n/web.zh.json'
import { P, permissionLabel, permissionLabelKey } from '../permissions'

describe('permissionLabel', () => {
  const dict: Record<string, string> = { 'perm.camp.employee.manage': 'Хүний нөөц › Ажилтан бүртгэл' }
  const exists = (k: string) => k in dict
  const tr = (k: string) => dict[k]

  it('орчуулгатай → i18n нэр', () => {
    expect(permissionLabel({ code: 'camp.employee.manage', name: 'Ажилтан бүртгэл' }, exists, tr)).toBe('Хүний нөөц › Ажилтан бүртгэл')
  })

  it('орчуулгагүй (шинэ код) → DB нэр', () => {
    expect(permissionLabel({ code: 'camp.new.thing', name: 'Шинэ эрх' }, exists, tr)).toBe('Шинэ эрх')
  })

  it('каталогийн бүх код mn/en/zh-д орчуулгатай', () => {
    for (const code of Object.values(P)) {
      const key = permissionLabelKey(code)
      for (const d of [mn, en, zh] as Record<string, string>[]) expect(d[key], `${key}`).toBeTruthy()
    }
  })
})

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import mn from '@s-project/i18n/web.mn.json'
import en from '@s-project/i18n/web.en.json'
import zh from '@s-project/i18n/web.zh.json'
import i18n, { applyOverrides, setLanguage } from '../index'

/**
 * v0.2.0 §0.7 — орчуулгын хамгаалалт (FE-005 загвар):
 *   1) 3 хэлний түлхүүр яг ижил, хоосон утгагүй, хувьсагч ({name}) ижил
 *   2) Кемп модуль, нэвтрэх, цэсний .ts/.tsx-д (тайлбараас гадуур) кирилл текст үлдээгүй
 *   3) Кодонд ашигласан t('…') литерал түлхүүр бүр каталогт байна
 */
const SRC = join(__dirname, '..', '..')
const vars = (s: string) => [...new Set([...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]))].sort()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'tests' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
  })
}
const SCOPE = [
  ...walk(join(SRC, 'modules', 'camp')),
  join(SRC, 'components', 'Layout.tsx'),
  join(SRC, 'components', 'LanguageSwitcher.tsx'),
  join(SRC, 'components', 'ProtectedRoute.tsx'),
  join(SRC, 'components', 'ErrorMessage.tsx'),
  join(SRC, 'pages', 'LoginPage.tsx'),
]
const stripComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('орчуулгын каталог', () => {
  it('mn / en / zh түлхүүр ижил, хоосон утгагүй, хувьсагч ижил', () => {
    const keys = Object.keys(mn).sort()
    expect(Object.keys(en).sort()).toEqual(keys)
    expect(Object.keys(zh).sort()).toEqual(keys)
    for (const k of keys) {
      for (const [lang, cat] of [['en', en], ['zh', zh]] as const) {
        expect((cat as Record<string, string>)[k].trim(), `${lang}:${k}`).not.toBe('')
        expect(vars((cat as Record<string, string>)[k]), `${lang}:${k}`).toEqual(vars((mn as Record<string, string>)[k]))
      }
    }
  })

  it('кемп модуль, нэвтрэх, цэсэнд кирилл текст үлдээгүй (тайлбараас гадуур)', () => {
    const bad: string[] = []
    for (const f of SCOPE) {
      stripComments(readFileSync(f, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/[Ѐ-ӿ]/.test(line)) bad.push(`${f.slice(SRC.length)}:${i + 1}: ${line.trim().slice(0, 80)}`)
        })
    }
    expect(bad).toEqual([])
  })

  it("кодонд ашигласан t('…') / i18n.t('…') түлхүүр бүр каталогт байна", () => {
    const missing: string[] = []
    for (const f of SCOPE) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
        if (!(m[1] in mn)) missing.push(`${f.slice(SRC.length)}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('i18n ажиллагаа', () => {
  it('хэл солих; хувьсагч {name}; байгууллагын засвар давхарлаж, буцаахад анхдагч', async () => {
    setLanguage('zh')
    expect(i18n.t('camp.att.rows', { n: 3 })).toBe('3 行')
    setLanguage('en')
    expect(i18n.t('nav.camp')).toBe('Camp')
    applyOverrides('en', { 'nav.camp': 'Base' })
    expect(i18n.t('nav.camp')).toBe('Base')
    applyOverrides('en', {})
    expect(i18n.t('nav.camp')).toBe('Camp')
    setLanguage('mn')
    expect(i18n.t('nav.camp')).toBe('Кемп')
  })
})

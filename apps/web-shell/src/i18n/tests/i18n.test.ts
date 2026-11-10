import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import mn from '@s-project/i18n/web.mn.json'
import en from '@s-project/i18n/web.en.json'
import zh from '@s-project/i18n/web.zh.json'
import termsMn from '@s-project/i18n/terms.mn.json'
import termsEn from '@s-project/i18n/terms.en.json'
import termsZh from '@s-project/i18n/terms.zh.json'
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
  // v0.2.2 Блок 6: «Хүний нөөц», урилга / нууц үгийн хуудсууд
  ...walk(join(SRC, 'modules', 'hr')),
  join(SRC, 'pages', 'SetPasswordPage.tsx'),
  join(SRC, 'pages', 'ForgotPasswordPage.tsx'),
  join(SRC, 'pages', 'ChangePasswordPage.tsx'),
  join(SRC, 'components', 'PageSuspense.tsx'),
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

  it('term каталог гурван хэлэнд бүтэн бөгөөд бүх web холбоос defaults-оороо задрана', () => {
    const terms = { mn: termsMn, en: termsEn, zh: termsZh }
    const termKeys = Object.keys(terms.mn).sort()
    expect(Object.keys(terms.en).sort()).toEqual(termKeys)
    expect(Object.keys(terms.zh).sort()).toEqual(termKeys)
    for (const lang of ['mn', 'en', 'zh'] as const) {
      const fixedT = i18n.getFixedT(lang)
      for (const termKey of termKeys) expect(terms[lang][termKey as keyof typeof terms.mn].trim(), `${lang}:${termKey}`).not.toBe('')
      for (const [key, value] of Object.entries({ mn, en, zh }[lang])) {
        const refs = [...value.matchAll(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g)].map((match) => match[1])
        for (const ref of refs) expect(termKeys, `${lang}:${key} → ${ref}`).toContain(ref)
        if (refs.length) expect(fixedT(key)).toBe(value.replace(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g, (_, ref: string) => terms[lang][ref as keyof typeof terms.mn]))
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
  it('гэрээний хувьсагчид гурван хэлээр зөв орлуулагдана', () => {
    for (const lang of ['mn', 'en', 'zh'] as const) {
      const t = i18n.getFixedT(lang)
      expect(t('camp.ct.payment_terms_total', { total: 95 })).toContain('95')
      expect(t('camp.ct.term_rule.AFTER_INVOICE_DAYS', { n: 10 })).toContain('10')
      expect(t('camp.ct.contract_currency', { currency: 'CNY' })).toContain('CNY')
      expect(t('camp.ct.quote_rate', { rate: '500', date: '2026-05-01' })).not.toMatch(/[{}]/)
    }
  })

  it('хэл солих; хувьсагч {name}; байгууллагын засвар давхарлаж, буцаахад анхдагч', async () => {
    setLanguage('zh')
    expect(i18n.t('camp.att.rows', { n: 3 })).toBe('3 行')
    setLanguage('en')
    expect(i18n.t('nav.camp')).toBe('Camp')
    applyOverrides('en', { 'term.camp.nom': 'Worksite' })
    expect(i18n.t('nav.camp')).toBe('Worksite')
    applyOverrides('en', {})
    expect(i18n.t('nav.camp')).toBe('Camp')
    applyOverrides('en', { 'nav.camp': 'Base' })
    expect(i18n.t('nav.camp')).toBe('Base')
    applyOverrides('en', {})
    expect(i18n.t('nav.camp')).toBe('Camp')
    setLanguage('mn')
    expect(i18n.t('nav.camp')).toBe('Кемп')
  })

  it('term interpolation preserves the existing translation text across all locales', () => {
    const expected = {
      mn: {
        'camp.att.col.dept_crew': 'Хэлтэс / ростер',
        'camp.att.shift_optional': 'Ээлж (заавал биш)',
        'camp.day.shift': 'Ээлж (тооцоолсон)',
        'camp.meals.by_department': 'Хэлтэс × ээлж',
        'camp.section.employees': 'Ажилтан',
        'camp.section.rooms': 'Өрөөний самбар',
        'camp.settings.section.departments': 'Хэлтэс, ээлж',
        'camp.system.section.organizations': 'Байгууллага',
        'hr.import.kind.employees': 'Ажилтан',
        'hr.section.employees': 'Ажилтан',
      },
      en: {
        'camp.att.col.dept_crew': 'Department / roster',
        'camp.att.shift_optional': 'Shift (optional)',
        'camp.day.shift': 'Shift (computed)',
        'camp.meals.by_department': 'Department × shift',
        'camp.section.employees': 'Employees',
        'camp.section.rooms': 'Room board',
        'camp.settings.section.departments': 'Departments, shifts',
        'camp.system.section.organizations': 'Organizations',
        'hr.import.kind.employees': 'Employees',
        'hr.section.employees': 'Employees',
      },
      zh: {
        'camp.att.col.dept_crew': '部门 / 轮班表',
        'camp.att.shift_optional': '班次（可选）',
        'camp.day.shift': '班次（计算）',
        'camp.meals.by_department': '部门 × 班次',
        'camp.section.employees': '员工',
        'camp.section.rooms': '房间看板',
        'camp.settings.section.departments': '部门、班次',
        'camp.system.section.organizations': '单位',
        'hr.import.kind.employees': '员工',
        'hr.section.employees': '员工',
      },
    } as const
    for (const lang of ['mn', 'en', 'zh'] as const) {
      const fixedT = i18n.getFixedT(lang)
      for (const [key, text] of Object.entries(expected[lang])) {
        expect(fixedT(key), `${lang}:${key}`).toBe(text)
      }
    }
  })
})

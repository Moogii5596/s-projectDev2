import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * v0.2.4 Блок 5 (I18N-03) — UI-д hardcode монгол (кирилл) текст ✖. Бүх текст i18n түлхүүрээр.
 * Шалгахгүй: тайлбар (comment), тест, release-notes, i18n, хөгжүүлэгчийн тохиргооны алдаа (`throw new Error`),
 * унтаа (Debug-only, Q17) модулиуд — DORMANT жагсаалт (v0.2.9 QA-06/18-д цэвэрлэнэ; шинэ файл нэмэхгүй).
 */
const SRC = join(__dirname, '..', '..')
const DORMANT = new Set([
  'modules/inventory/InventoryPage.tsx',
  'modules/inventory/lib/quantity.ts',
  'modules/report/ReportPage.tsx',
  'modules/report/lib/report.ts',
  'modules/vendor/VendorsPage.tsx',
  'pages/MRCreatePage.tsx',
  'pages/MRDetailPage.tsx',
  'pages/MRListPage.tsx',
  'pages/ApprovalSlaPage.tsx',
  'pages/WorkflowDefinitionPage.tsx',
  'pages/DelegationPage.tsx',
  'lib/mr-approval.ts',
  'hooks/useMRRealtime.ts',
  'components/RejectModal.tsx',
  'components/StatusBadge.tsx',
])
const SKIP_DIR = /(^|\/)(tests?|release-notes|i18n|__mocks__)(\/|$)/
const CYR = /[Ѐ-ӿ]/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name) ? [p] : []
  })
}

/** Тайлбарыг хасна (// …, /* … *\/, {/* … *\/}) — мөр дотрох URL-ийн `//`-ийг хадгалахын тулд мөрийн эхэнд эсвэл зайны дараах */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;,(){}])\/\/.*$/gm, '$1')
}

describe('hardcode текст (I18N-03)', () => {
  it('унтаа бус UI-д кирилл текст алга (i18n түлхүүр ашигла)', () => {
    const offenders: string[] = []
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, '/')
      if (SKIP_DIR.test(rel) || DORMANT.has(rel)) continue
      stripComments(readFileSync(f, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (CYR.test(line) && !/throw new Error\(/.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('DORMANT жагсаалтад байхгүй болсон файл үлдээхгүй (ratchet)', () => {
    const all = new Set(files(SRC).map((f) => relative(SRC, f).replace(/\\/g, '/')))
    expect([...DORMANT].filter((f) => !all.has(f))).toEqual([])
  })
})

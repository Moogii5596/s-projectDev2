/**
 * v0.2.2 H2 — «Хүний нөөц» хэсэг, хуучин Кемпийн хаягийн зураглал
 */
import { describe, expect, it } from 'vitest'
import { HR_DEFAULT_SECTION, HR_SECTIONS, LEGACY_CAMP_SECTIONS, hrPath, isHrSection, legacyCampToHr, sectionFromPath } from '../hr-sections'

const ID = '0192a000-0000-7000-8000-000000000001'

describe('hr-sections', () => {
  it('ADR-006 §5.1-ийн цэс (+ Блок 4: Хэрэглэгч)', () => {
    expect([...HR_SECTIONS]).toEqual(['employees', 'users', 'departments', 'crews', 'shifts', 'attendance', 'import', 'positions'])
    expect(HR_DEFAULT_SECTION).toBe('employees')
  })

  it('hrPath / isHrSection', () => {
    expect(hrPath(ID)).toBe(`/hr/${ID}/employees`)
    expect(hrPath(ID, 'positions')).toBe(`/hr/${ID}/positions`)
    expect(isHrSection('crews')).toBe(true)
    expect(isHrSection('rooms')).toBe(false)
    expect(isHrSection(undefined)).toBe(false)
  })

  it('ажлын байр солиход ижил хэсэгт үлдэнэ; танихгүй бол анхдагч', () => {
    expect(sectionFromPath(`/hr/${ID}/crews`)).toBe('crews')
    expect(sectionFromPath(`/hr/${ID}/import`)).toBe('import')
    expect(sectionFromPath(`/hr/${ID}`)).toBe('employees')
    expect(sectionFromPath(`/hr/${ID}/rooms`)).toBe('employees')
  })

  it('хуучин Кемпийн хаяг бүр HR-ийн хэсэг рүү очно, query хэвээр', () => {
    for (const s of LEGACY_CAMP_SECTIONS) expect(isHrSection(s)).toBe(true)
    expect(legacyCampToHr(ID, 'attendance', '?date=2026-10-16')).toBe(`/hr/${ID}/attendance?date=2026-10-16`)
    expect(legacyCampToHr(ID, 'crews')).toBe(`/hr/${ID}/crews`)
  })
})
